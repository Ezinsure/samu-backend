import type { MailMessage } from "./mailer.js";

type LinkEmailInput = {
  to: string;
  name: string;
  link: string;
  /** Human readable validity, e.g. "1 hour". */
  validFor: string;
};

/** Minimal HTML escaping for user-supplied values placed into templates. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared layout: greeting, one paragraph, one button, fallback link. */
function linkEmail(
  input: LinkEmailInput,
  subject: string,
  intro: string,
  action: string,
): MailMessage {
  const name = escapeHtml(input.name);
  const link = escapeHtml(input.link);
  return {
    to: input.to,
    subject,
    text: `Hello ${input.name},\n\n${intro}\n\n${action}: ${input.link}\n\nThis link is valid for ${input.validFor} and can be used once. If you did not expect this email you can ignore it.\n\nSAMU — Solektra Agent Monitoring Utility`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
  <h2 style="margin:0 0 16px">SAMU</h2>
  <p>Hello ${name},</p>
  <p>${escapeHtml(intro)}</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action)}</a></p>
  <p style="font-size:13px;color:#475569">Or paste this link into your browser:<br>${link}</p>
  <p style="font-size:13px;color:#475569">This link is valid for ${escapeHtml(input.validFor)} and can be used once. If you did not expect this email you can ignore it.</p>
</div>`,
  };
}

/** Email sent when a user asks to reset a forgotten password. */
export function passwordResetEmail(input: LinkEmailInput): MailMessage {
  return linkEmail(
    input,
    "Reset your SAMU password",
    "We received a request to reset your SAMU password.",
    "Reset password",
  );
}

/** Email sent when an admin creates an account without setting a password. */
export function accountInviteEmail(input: LinkEmailInput): MailMessage {
  return linkEmail(
    input,
    "Your SAMU account is ready",
    "A SAMU account has been created for you. Set your password to get started.",
    "Set your password",
  );
}
