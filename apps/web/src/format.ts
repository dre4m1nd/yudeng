import type { Account, UtilityType } from "./types";

export type TagType = "primary" | "success" | "info" | "warning" | "danger";

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatFullDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/* 货币与数值格式化：走 Intl，避免硬编码格式与本地化漂移 */
const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatYuan(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  return currencyFormatter.format(cents / 100);
}

export function formatVolume(hundredths: number, unit: string): string {
  if (!Number.isFinite(hundredths)) return "—";
  return `${decimalFormatter.format(hundredths / 100)} ${unit}`;
}

export function utilityLabel(type: UtilityType): string {
  switch (type) {
    case "LIGHTING":
      return "照明电费";
    case "AC":
      return "空调电费";
    default:
      return "水费";
  }
}

export function utilityPath(type: UtilityType): string {
  switch (type) {
    case "LIGHTING":
      return "/utility/lighting";
    case "AC":
      return "/utility/ac";
    default:
      return "/utility/water";
  }
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case "SUCCESS":
      return "成功";
    case "PARTIAL":
      return "部分成功";
    case "FAILED":
      return "失败";
    case "RUNNING":
      return "进行中";
    default:
      return status;
  }
}

export function levelLabel(level: string): string {
  switch (level) {
    case "LOW":
      return "偏低";
    case "CRITICAL":
      return "紧急";
    case "SCRAPE_FAILED":
      return "抓取失败";
    case "TOKEN_INVALID":
      return "OpenID 失效";
    default:
      return level;
  }
}

export function levelType(level: string): TagType {
  switch (level) {
    case "CRITICAL":
    case "TOKEN_INVALID":
      return "danger";
    case "LOW":
    case "SCRAPE_FAILED":
      return "warning";
    default:
      return "info";
  }
}

export function openIdStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "可用";
    case "COOLING":
      return "冷却中";
    case "INVALID":
      return "已失效";
    case "DISABLED":
      return "已停用";
    default:
      return status;
  }
}

export function openIdStatusType(status: string): TagType {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "COOLING":
      return "warning";
    case "INVALID":
      return "danger";
    default:
      return "info";
  }
}

export function alertStatusLabel(status: string): string {
  switch (status) {
    case "SENT":
      return "已发送";
    case "CONSOLE":
      return "控制台";
    case "FAILED":
      return "失败";
    default:
      return status;
  }
}

export function accountStatus(account: Account): {
  label: string;
  type: TagType;
} {
  if (!account.latest) return { label: "无数据", type: "info" };

  const rule = account.alertRule;

  if (!rule || !rule.enabled) return { label: "未启用告警", type: "info" };

  if (account.latest.moneyCents <= Math.floor(rule.moneyThresholdCents / 2)) {
    return { label: "紧急", type: "danger" };
  }

  if (account.latest.moneyCents <= rule.moneyThresholdCents) {
    return { label: "偏低", type: "warning" };
  }

  return { label: "正常", type: "success" };
}
