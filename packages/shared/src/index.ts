import { z } from "zod";

export const UtilityTypeSchema = z.enum(["LIGHTING", "AC", "WATER"]);
export type UtilityType = z.infer<typeof UtilityTypeSchema>;

export const TokenStatusSchema = z.enum(["ACTIVE", "COOLING", "INVALID", "DISABLED"]);
export type TokenStatus = z.infer<typeof TokenStatusSchema>;

export const AlertLevelSchema = z.enum([
  "OK",
  "LOW",
  "CRITICAL",
  "SCRAPE_FAILED",
  "TOKEN_INVALID",
]);
export type AlertLevel = z.infer<typeof AlertLevelSchema>;

export const utilityMeta: Record<
  UtilityType,
  { label: string; volumeUnit: "kWh" | "m³"; defaultThresholdCents: number }
> = {
  LIGHTING: { label: "照明电费", volumeUnit: "kWh", defaultThresholdCents: 1000 },
  AC: { label: "空调电费", volumeUnit: "kWh", defaultThresholdCents: 1000 },
  WATER: { label: "水费", volumeUnit: "m³", defaultThresholdCents: 1000 },
};

export function parseAmountToHundredths(value: string): number {
  const normalized = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function formatHundredths(value: number): string {
  return (value / 100).toFixed(2);
}

export function formatMoney(cents: number): string {
  return `¥${formatHundredths(cents)}`;
}

export function formatVolume(hundredths: number, unit: "kWh" | "m³"): string {
  return `${formatHundredths(hundredths)} ${unit}`;
}

export function maskOpenId(openId: string): string {
  if (openId.length <= 8) return "••••";
  return `${openId.slice(0, 4)}••••${openId.slice(-4)}`;
}

export function cleanRoomLabel(room: string): string {
  return room.replace(/(照明|空调|水表)$/u, "");
}

export const LoginInputSchema = z.object({
  password: z.string().min(1),
});

export const SetOpenIdInputSchema = z.object({
  openId: z.string().trim().min(8).max(128),
});

export const AddStudentInputSchema = z.object({
  name: z.string().min(1).max(40),
  email: z.string().email(),
});

export const UpdateAlertRuleInputSchema = z.object({
  moneyThresholdCents: z.number().int().min(0).max(100_000_000),
  volumeThresholdHundredths: z.number().int().min(0).nullable().optional(),
  forecastDays: z.number().int().min(1).max(30),
  enabled: z.boolean(),
});
