import { env } from "../config/env.js";
import { logger } from "./logger.js";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Result of a send attempt; `delivered` is false when no provider is configured. */
export type MailResult = { delivered: boolean };

/** True when a real email provider is configured. */
export function isMailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/**
 * Send a transactional email through Resend's HTTP API (no SDK needed).
 *
 * Without `RESEND_API_KEY` nothing leaves the server. Outside production the
 * plain-text body (including the action link) is logged so the flow can be
 * tested locally; in production only the fact that it was skipped is logged.
 *
 * Throws when the provider rejects the request.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!env.RESEND_API_KEY) {
    logger.warn(
      { to: message.to, subject: message.subject },
      "Email provider not configured; message not sent",
    );
    if (env.NODE_ENV !== "production") {
      logger.info({ to: message.to, text: message.text }, "DEV email body");
    }
    return { delivered: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email provider error ${response.status}: ${detail}`);
  }

  return { delivered: true };
}
