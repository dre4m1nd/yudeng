import { cleanRoomLabel, parseAmountToHundredths, type UtilityType } from "@yudeng/shared";
import { z } from "zod";
import { config } from "../config";
import { ProviderError } from "../errors";

const ResponseSchema = z.object({
  statusCode: z.string(),
  message: z.string().nullable().optional(),
  resultObject: z
    .object({
      leftMoney: z.string(),
      leftEle: z.string().optional(),
      leftWater: z.string().optional(),
      loudong: z.string().optional(),
      monTime: z.string(),
      room: z.string(),
    })
    .nullable(),
});

export type MeterReading = {
  utility: UtilityType;
  moneyCents: number;
  volumeHundredths: number;
  volumeUnit: "kWh" | "m³";
  moneyBalanceText: string;
  volumeBalanceText: string;
  roomLabel: string;
  buildingLabel: string;
  schoolUpdatedAt: Date;
  raw: unknown;
};

function parseSchoolTime(value: string): Date {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(`${normalized}+08:00`);
  if (Number.isNaN(date.getTime())) {
    throw new ProviderError(`Invalid monTime: ${value}`, "parse");
  }
  return date;
}

async function requestJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new ProviderError(
      `Request failed: ${error instanceof Error ? error.message : String(error)}`,
      "transient",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(`HTTP ${response.status}`, "auth");
  }

  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "60");
    throw new ProviderError("Rate limited", "rate_limit", retryAfterSeconds * 1000);
  }

  if (!response.ok) {
    throw new ProviderError(`HTTP ${response.status}`, "transient");
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderError("Invalid JSON response", "parse");
  }
}

async function fetchMeter(openId: string, utility: UtilityType): Promise<MeterReading> {
  const params = new URLSearchParams({ openId });
  let endpoint: string;

  if (utility === "LIGHTING" || utility === "AC") {
    params.set("type", utility === "LIGHTING" ? "1" : "2");
    endpoint = `${config.schoolApiBase}/getEleInfo`;
  } else {
    endpoint = `${config.schoolApiBase}/getWaterInfo`;
  }

  const payload = await requestJson(`${endpoint}?${params.toString()}`);
  const parsed = ResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ProviderError(`Unexpected response: ${parsed.error.message}`, "parse");
  }

  const { statusCode, message, resultObject } = parsed.data;

  if (statusCode !== "200" || !resultObject) {
    throw new ProviderError(
      `School API error: ${statusCode} ${message ?? ""}`.trim(),
      "api",
    );
  }

  const volumeText = utility === "WATER" ? resultObject.leftWater : resultObject.leftEle;

  if (!volumeText) {
    throw new ProviderError(`Missing volume field for ${utility}`, "parse");
  }

  return {
    utility,
    moneyCents: parseAmountToHundredths(resultObject.leftMoney),
    volumeHundredths: parseAmountToHundredths(volumeText),
    volumeUnit: utility === "WATER" ? "m³" : "kWh",
    moneyBalanceText: resultObject.leftMoney,
    volumeBalanceText: volumeText,
    roomLabel: cleanRoomLabel(resultObject.room),
    buildingLabel: (resultObject.loudong ?? "").replace(/空调$/u, ""),
    schoolUpdatedAt: parseSchoolTime(resultObject.monTime),
    raw: payload,
  };
}

export const schoolProvider = {
  fetchLighting: (openId: string) => fetchMeter(openId, "LIGHTING"),
  fetchAc: (openId: string) => fetchMeter(openId, "AC"),
  fetchWater: (openId: string) => fetchMeter(openId, "WATER"),
};

export function fetchForUtility(openId: string, utility: UtilityType): Promise<MeterReading> {
  switch (utility) {
    case "LIGHTING":
      return schoolProvider.fetchLighting(openId);
    case "AC":
      return schoolProvider.fetchAc(openId);
    case "WATER":
      return schoolProvider.fetchWater(openId);
  }
}