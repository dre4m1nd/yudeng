import {
  formatMoney,
  formatVolume,
  utilityMeta,
  type AlertLevel,
  type UtilityType,
} from "@yudeng/shared";
import type { AlertRule, BalanceSnapshot } from "@prisma/client";
import { config } from "../config";
import { prisma } from "../db";
import { sendMail } from "./mailer";

type Evaluation = {
  level: AlertLevel;
  metric: "MONEY" | "VOLUME";
  reason: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

export async function getRecipients(dormId: string): Promise<string[]> {
  const [students, recipients] = await Promise.all([
    prisma.student.findMany({
      where: { dormId },
      select: { email: true },
    }),
    prisma.dormRecipient.findMany({
      where: { dormId },
      select: { email: true },
    }),
  ]);

  return [
    ...new Set([
      ...students.map((student) => student.email).filter(Boolean),
      ...recipients.map((recipient) => recipient.email).filter(Boolean),
      ...config.alertEmails,
    ]),
  ];
}

function forecastDaysLeft(
  latest: BalanceSnapshot,
  ascending: BalanceSnapshot[],
): number | null {
  if (ascending.length < 2) return null;

  const windowStart = latest.capturedAt.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recent = ascending.filter(
    (snapshot) => snapshot.capturedAt.getTime() >= windowStart,
  );

  if (recent.length < 2) return null;

  let spendCents = 0;

  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1];
    const current = recent[index];
    if (current.moneyCents < previous.moneyCents) {
      spendCents += previous.moneyCents - current.moneyCents;
    }
  }

  const days =
    (recent[recent.length - 1].capturedAt.getTime() - recent[0].capturedAt.getTime()) /
    (24 * 60 * 60 * 1000);

  if (days < 1 / 24) return null;

  const averageDailySpend = spendCents / days;

  if (averageDailySpend <= 0) return null;

  return latest.moneyCents / averageDailySpend;
}

function evaluate(
  latest: BalanceSnapshot,
  ascending: BalanceSnapshot[],
  rule: AlertRule,
): Evaluation {
  const moneyCriticalLine = Math.floor(rule.moneyThresholdCents / 2);

  if (latest.moneyCents <= moneyCriticalLine) {
    return {
      level: "CRITICAL",
      metric: "MONEY",
      reason: `余额已低于阈值的一半（${formatMoney(rule.moneyThresholdCents)}）`,
    };
  }

  if (latest.moneyCents <= rule.moneyThresholdCents) {
    return {
      level: "LOW",
      metric: "MONEY",
      reason: `余额低于告警阈值（${formatMoney(rule.moneyThresholdCents)}）`,
    };
  }

  if (rule.volumeThresholdHundredths !== null) {
    const volumeCriticalLine = Math.floor(rule.volumeThresholdHundredths / 2);

    if (latest.volumeHundredths <= volumeCriticalLine) {
      return {
        level: "CRITICAL",
        metric: "VOLUME",
        reason: "剩余量低于告警阈值的一半",
      };
    }

    if (latest.volumeHundredths <= rule.volumeThresholdHundredths) {
      return {
        level: "LOW",
        metric: "VOLUME",
        reason: "剩余量低于告警阈值",
      };
    }
  }

  const daysLeft = forecastDaysLeft(latest, ascending);

  if (daysLeft !== null && daysLeft <= 1) {
    return {
      level: "CRITICAL",
      metric: "MONEY",
      reason: `按近 7 天消耗预计 ${daysLeft.toFixed(1)} 天后用完`,
    };
  }

  if (daysLeft !== null && daysLeft <= rule.forecastDays) {
    return {
      level: "LOW",
      metric: "MONEY",
      reason: `按近 7 天消耗预计 ${daysLeft.toFixed(1)} 天后用完`,
    };
  }

  return { level: "OK", metric: "MONEY", reason: "" };
}

export async function evaluateAlerts(dormId: string): Promise<void> {
  const dorm = await prisma.dorm.findUnique({ where: { id: dormId } });
  if (!dorm) return;

  const recipients = await getRecipients(dormId);
  const accounts = await prisma.utilityAccount.findMany({
    where: { dormId },
    include: {
      alertRule: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 168 },
    },
  });

  for (const account of accounts) {
    const rule = account.alertRule;
    const latest = account.snapshots[0];

    if (!rule || !rule.enabled || !latest) continue;

    const ascending = [...account.snapshots].reverse();
    const evaluation = evaluate(latest, ascending, rule);

    if (evaluation.level === "OK") {
      if (rule.lastAlertLevel) {
        await prisma.alertRule.update({
          where: { id: rule.id },
          data: { lastAlertLevel: null },
        });
      }
      continue;
    }

    const shouldSend =
      rule.lastAlertLevel !== evaluation.level ||
      !rule.lastAlertAt ||
      Date.now() - rule.lastAlertAt.getTime() >= rule.cooldownHours * 60 * 60 * 1000;

    if (!shouldSend) continue;

    const dedupeKey = `${account.id}:${evaluation.level}:${latest.hourBucket.toISOString()}`;

    let eventId: string;

    try {
      const event = await prisma.alertEvent.create({
        data: {
          dormId,
          accountId: account.id,
          level: evaluation.level,
          metric: evaluation.metric,
          valueCents: latest.moneyCents,
          valueHundredths: latest.volumeHundredths,
          dedupeKey,
          recipients: recipients.join(","),
          status: "PENDING",
        },
      });
      eventId = event.id;
    } catch {
      continue;
    }

    const utility = account.type as UtilityType;
    const meta = utilityMeta[utility];
    const subject = `[${dorm.name}] ${meta.label}${evaluation.level === "CRITICAL" ? "即将用完" : "余额不足"}`;
    const text = [
      `宿舍：${dorm.name}`,
      `费用类型：${meta.label}`,
      `当前余额：${formatMoney(latest.moneyCents)}`,
      `剩余量：${formatVolume(latest.volumeHundredths, meta.volumeUnit)}`,
      `触发原因：${evaluation.reason}`,
      `告警阈值：${formatMoney(rule.moneyThresholdCents)}`,
      `学校更新时间：${formatDate(latest.schoolUpdatedAt)}`,
      `查看面板：${config.APP_URL}`,
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.7;color:#1f2937">
        <h2 style="margin:0 0 16px">${escapeHtml(dorm.name)} · ${escapeHtml(meta.label)}</h2>
        <p style="margin:0 0 8px"><strong>当前余额：</strong>${formatMoney(latest.moneyCents)}</p>
        <p style="margin:0 0 8px"><strong>剩余量：</strong>${formatVolume(latest.volumeHundredths, meta.volumeUnit)}</p>
        <p style="margin:0 0 8px"><strong>触发原因：</strong>${escapeHtml(evaluation.reason)}</p>
        <p style="margin:0 0 8px"><strong>告警阈值：</strong>${formatMoney(rule.moneyThresholdCents)}</p>
        <p style="margin:0 0 8px"><strong>学校更新时间：</strong>${formatDate(latest.schoolUpdatedAt)}</p>
        <p style="margin:16px 0 0"><a href="${escapeHtml(config.APP_URL)}">打开余额面板</a></p>
      </div>
    `;

    const result = await sendMail({ to: recipients, subject, text, html });

    await prisma.alertEvent.update({
      where: { id: eventId },
      data: {
        status: result.status,
        sentAt: new Date(),
        error: result.error,
      },
    });

    await prisma.alertRule.update({
      where: { id: rule.id },
      data: {
        lastAlertLevel: evaluation.level,
        lastAlertAt: new Date(),
      },
    });
  }
}

export async function sendSystemAlert(
  dormId: string,
  level: "SCRAPE_FAILED" | "TOKEN_INVALID",
  message: string,
): Promise<void> {
  const dorm = await prisma.dorm.findUnique({ where: { id: dormId } });
  if (!dorm) return;

  const recipients = await getRecipients(dormId);
  const hourKey = new Date(Math.floor(Date.now() / (60 * 60 * 1000)) * 60 * 60 * 1000).toISOString();
  const dedupeKey = `${dormId}:${level}:${hourKey}`;

  const existing = await prisma.alertEvent.findUnique({ where: { dedupeKey } });
  if (existing) return;

  const event = await prisma.alertEvent.create({
    data: {
      dormId,
      level,
      dedupeKey,
      recipients: recipients.join(","),
      status: "PENDING",
    },
  });

  const subject = `[${dorm.name}] ${level === "TOKEN_INVALID" ? "OpenID 已失效" : "抓取失败"}`;
  const text = `${message}\n\n查看面板：${config.APP_URL}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.7;color:#1f2937">
      <h2 style="margin:0 0 16px">${escapeHtml(dorm.name)} · 抓取异常</h2>
      <p style="margin:0 0 8px">${escapeHtml(message)}</p>
      <p style="margin:16px 0 0"><a href="${escapeHtml(config.APP_URL)}">打开余额面板</a></p>
    </div>
  `;

  const result = await sendMail({ to: recipients, subject, text, html });

  await prisma.alertEvent.update({
    where: { id: event.id },
    data: { status: result.status, sentAt: new Date(), error: result.error },
  });
}
