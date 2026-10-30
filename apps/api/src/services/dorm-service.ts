import { maskOpenId, utilityMeta, type UtilityType } from "@yudeng/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { encryptOpenId, hashOpenId } from "../crypto";

export const UTILITY_TYPES: UtilityType[] = ["LIGHTING", "AC", "WATER"];

export type TimeRange = "24h" | "7d" | "30d";

const RANGE_MS: Record<TimeRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function parseRange(value: string | undefined): TimeRange {
  if (value === "24h" || value === "30d") return value;
  return "7d";
}

export async function listDormSummaries() {
  const dorms = await prisma.dorm.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      accounts: {
        orderBy: { type: "asc" },
        include: {
          snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
        },
      },
      tokens: {
        select: {
          id: true,
          tokenMask: true,
          status: true,
          lastSuccessAt: true,
          lastError: true,
        },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
      scrapeRuns: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });

  return dorms.map((dorm) => ({
    id: dorm.id,
    name: dorm.name,
    building: dorm.building,
    room: dorm.room,
    latest: dorm.accounts.map((account) => ({
      accountId: account.id,
      type: account.type,
      displayName: account.displayName,
      unit: account.unit,
      moneyCents: account.snapshots[0]?.moneyCents ?? null,
      volumeHundredths: account.snapshots[0]?.volumeHundredths ?? null,
      schoolUpdatedAt: account.snapshots[0]?.schoolUpdatedAt ?? null,
      capturedAt: account.snapshots[0]?.capturedAt ?? null,
    })),
    openId: dorm.tokens[0]
      ? {
          id: dorm.tokens[0].id,
          mask: dorm.tokens[0].tokenMask,
          status: dorm.tokens[0].status,
          lastSuccessAt: dorm.tokens[0].lastSuccessAt,
          lastError: dorm.tokens[0].lastError,
        }
      : null,
    lastRun: dorm.scrapeRuns[0] ?? null,
  }));
}

export async function createDorm(input: {
  name: string;
  building?: string;
  room?: string;
  openId: string;
}) {
  return prisma.dorm.create({
    data: {
      name: input.name,
      building: input.building || null,
      room: input.room || null,
      accounts: {
        create: UTILITY_TYPES.map((type) => {
          const meta = utilityMeta[type];
          return {
            type,
            displayName: meta.label,
            unit: meta.volumeUnit,
            alertRule: {
              create: {
                moneyThresholdCents: meta.defaultThresholdCents,
                forecastDays: 3,
                enabled: true,
                cooldownHours: 24,
              },
            },
          };
        }),
      },
      tokens: {
        create: {
          label: "宿舍 OpenID",
          tokenCipher: encryptOpenId(input.openId),
          tokenHash: hashOpenId(input.openId),
          tokenMask: maskOpenId(input.openId),
        },
      },
    },
    include: { accounts: true },
  });
}

export async function getDormDashboard(dormId: string) {
  const dorm = await prisma.dorm.findUnique({
    where: { id: dormId },
    include: {
      students: { orderBy: { createdAt: "asc" } },
      recipients: { orderBy: { createdAt: "asc" } },
      tokens: { orderBy: { createdAt: "asc" }, take: 1 },
      accounts: {
        include: {
          alertRule: true,
          snapshots: { orderBy: { capturedAt: "desc" }, take: 168 },
        },
        orderBy: { type: "asc" },
      },
      alerts: {
        include: { account: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      scrapeRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!dorm) return null;

  return {
    dorm: {
      id: dorm.id,
      name: dorm.name,
      building: dorm.building,
      room: dorm.room,
    },
    accounts: dorm.accounts.map((account) => ({
      id: account.id,
      type: account.type,
      displayName: account.displayName,
      unit: account.unit,
      alertRule: account.alertRule,
      latest: account.snapshots[0] ?? null,
      history: [...account.snapshots].reverse().map((snapshot) => ({
        id: snapshot.id,
        moneyCents: snapshot.moneyCents,
        volumeHundredths: snapshot.volumeHundredths,
        schoolUpdatedAt: snapshot.schoolUpdatedAt,
        capturedAt: snapshot.capturedAt,
      })),
    })),
    openId: dorm.tokens[0]
      ? {
          id: dorm.tokens[0].id,
          mask: dorm.tokens[0].tokenMask,
          status: dorm.tokens[0].status,
          lastSuccessAt: dorm.tokens[0].lastSuccessAt,
          lastError: dorm.tokens[0].lastError,
        }
      : null,
    students: dorm.students.map((student) => ({
      id: student.id,
      name: student.name,
      email: student.email,
    })),
    recipients: dorm.recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
    })),
    alerts: dorm.alerts.map((alert) => ({
      id: alert.id,
      dormId: dorm.id,
      dormName: dorm.name,
      accountId: alert.accountId,
      accountName: alert.account?.displayName ?? null,
      level: alert.level,
      metric: alert.metric,
      valueCents: alert.valueCents,
      valueHundredths: alert.valueHundredths,
      status: alert.status,
      recipients: alert.recipients,
      error: alert.error,
      createdAt: alert.createdAt,
      sentAt: alert.sentAt,
    })),
    lastRun: dorm.scrapeRuns[0] ?? null,
  };
}

export async function getDormTimeSeries(
  dormId: string,
  range: TimeRange,
) {
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_MS[range]);

  const accounts = await prisma.utilityAccount.findMany({
    where: { dormId },
    orderBy: { type: "asc" },
    include: {
      snapshots: {
        where: { capturedAt: { gte: from } },
        orderBy: { capturedAt: "asc" },
      },
    },
  });

  return {
    range,
    from,
    to,
    accounts: accounts.map((account) => ({
      id: account.id,
      type: account.type,
      displayName: account.displayName,
      unit: account.unit,
      points: account.snapshots.map((snapshot) => ({
        id: snapshot.id,
        capturedAt: snapshot.capturedAt,
        moneyCents: snapshot.moneyCents,
        volumeHundredths: snapshot.volumeHundredths,
        schoolUpdatedAt: snapshot.schoolUpdatedAt,
      })),
    })),
  };
}

export async function getDormSnapshotPage(
  dormId: string,
  options: {
    page: number;
    pageSize: number;
    accountId?: string;
    from?: Date;
    to?: Date;
  },
) {
  const where: Prisma.BalanceSnapshotWhereInput = {
    account: { dormId },
  };

  if (options.accountId) {
    where.accountId = options.accountId;
  }

  if (options.from || options.to) {
    where.capturedAt = {
      ...(options.from ? { gte: options.from } : {}),
      ...(options.to ? { lte: options.to } : {}),
    };
  }

  const [total, rows] = await prisma.$transaction([
    prisma.balanceSnapshot.count({ where }),
    prisma.balanceSnapshot.findMany({
      where,
      include: { account: true },
      orderBy: { capturedAt: "desc" },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountName: row.account.displayName,
      accountType: row.account.type,
      accountUnit: row.account.unit,
      moneyCents: row.moneyCents,
      volumeHundredths: row.volumeHundredths,
      schoolUpdatedAt: row.schoolUpdatedAt,
      capturedAt: row.capturedAt,
    })),
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(total / options.pageSize),
  };
}
