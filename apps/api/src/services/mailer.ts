import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config";

export type MailResult = {
  status: "SENT" | "CONSOLE" | "FAILED";
  messageId?: string;
  error?: string;
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
          : undefined,
    });
  }
  return transporter;
}

export async function sendMail(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<MailResult> {
  const recipients = [...new Set(input.to.map((value) => value.trim()).filter(Boolean))];

  if (recipients.length === 0) {
    return { status: "FAILED", error: "No recipients configured" };
  }

  if (!config.SMTP_HOST) {
    console.log(
      `[mail:console] to=${recipients.join(",")} subject=${input.subject}\n${input.text}`,
    );
    return { status: "CONSOLE" };
  }

  try {
    const info = await getTransporter().sendMail({
      from: config.MAIL_FROM || config.SMTP_USER,
      to: recipients.join(","),
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { status: "SENT", messageId: info.messageId };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}