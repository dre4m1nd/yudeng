import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().default("http://localhost:3000"),
  SCHOOL_API_BASE: z.string().min(1),
  SCHOOL_OPENIDS: z.string().default(""),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY must be 64 hex characters"),
  COOKIE_SECRET: z.string().min(16),
  APP_PASSWORD: z.string().min(1).default("admin"),
  ALERT_EMAILS: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  MAIL_FROM: z.string().default(""),
  TZ: z.string().default("Asia/Shanghai"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  schoolApiBase: parsed.data.SCHOOL_API_BASE.replace(/\/+$/, ""),
  openIds: parsed.data.SCHOOL_OPENIDS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  alertEmails: parsed.data.ALERT_EMAILS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};