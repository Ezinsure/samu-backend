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

type CoaCredentialsEmailInput = {
  to: string;
  name: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
};

/**
 * Branded welcome email for bulk-imported COA accounts: login URL + temporary
 * password, with a clear instruction to change the password after first sign-in.
 */
export function coaCredentialsEmail(input: CoaCredentialsEmailInput): MailMessage {
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const password = escapeHtml(input.temporaryPassword);
  const loginUrl = escapeHtml(input.loginUrl);

  const text = [
    `Hello ${input.name},`,
    "",
    "Welcome to SAMU — Solektra Agent Monitoring Utility.",
    "A Community Opportunity Associate (COA) account has been created for you.",
    "",
    `Sign in at: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Please change this password as soon as you sign in (Profile → Change password).",
    "If you did not expect this email, contact your Solektra administrator.",
    "",
    "— Solektra / SAMU",
  ].join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="background:#0b1f33;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
    <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8">Solektra</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px">SAMU</div>
    <div style="font-size:13px;opacity:0.85;margin-top:4px">Solektra Agent Monitoring Utility</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
    <p style="margin:0 0 12px">Hello ${name},</p>
    <p style="margin:0 0 16px">A <strong>Community Opportunity Associate (COA)</strong> account has been created for you. Use the details below to sign in.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
      <tr>
        <td style="padding:8px 0;color:#475569;width:140px">Email</td>
        <td style="padding:8px 0;font-weight:600">${email}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#475569">Temporary password</td>
        <td style="padding:8px 0;font-family:Consolas,Monaco,monospace;font-weight:700;letter-spacing:0.02em">${password}</td>
      </tr>
    </table>
    <p style="margin:0 0 20px">
      <a href="${loginUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Sign in to SAMU</a>
    </p>
    <p style="margin:0 0 8px;font-size:14px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px">
      <strong>Important:</strong> Change this temporary password as soon as you sign in
      (Profile → Change password).
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#64748b">
      Or open: ${loginUrl}<br/>
      If you did not expect this email, contact your Solektra administrator.
    </p>
  </div>
</div>`;

  return {
    to: input.to,
    subject: "Your SAMU COA account — temporary password inside",
    text,
    html,
  };
}

type StockAssignmentEmailInput = {
  to: string;
  name: string;
  assignedByName: string;
  itemCount: number;
  typeSummary: string;
  note?: string;
  confirmUrl: string;
};

/** Notify a TC/COA that devices were assigned and need confirmation. */
export function stockAssignmentEmail(
  input: StockAssignmentEmailInput,
): MailMessage {
  const name = escapeHtml(input.name);
  const assignedBy = escapeHtml(input.assignedByName);
  const typeSummary = escapeHtml(input.typeSummary);
  const confirmUrl = escapeHtml(input.confirmUrl);
  const note = input.note ? escapeHtml(input.note) : null;
  const count = String(input.itemCount);

  const text = [
    `Hello ${input.name},`,
    "",
    `${input.assignedByName} assigned ${input.itemCount} device(s) to you in SAMU.`,
    `Devices: ${input.typeSummary}`,
    input.note ? `Note: ${input.note}` : null,
    "",
    `Confirm receipt: ${input.confirmUrl}`,
    "",
    "Please accept the devices that arrived, or flag any that are missing or wrong.",
    "",
    "— Solektra / SAMU",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="background:#0b1f33;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
    <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8">Solektra</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px">SAMU</div>
    <div style="font-size:13px;opacity:0.85;margin-top:4px">Device assignment</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
    <p style="margin:0 0 12px">Hello ${name},</p>
    <p style="margin:0 0 16px"><strong>${assignedBy}</strong> assigned <strong>${count}</strong> device(s) to you. Confirm what you received so your stock stays accurate.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
      <tr>
        <td style="padding:8px 0;color:#475569;width:140px">Devices</td>
        <td style="padding:8px 0;font-weight:600">${typeSummary}</td>
      </tr>
      ${
        note
          ? `<tr><td style="padding:8px 0;color:#475569">Note</td><td style="padding:8px 0">${note}</td></tr>`
          : ""
      }
    </table>
    <p style="margin:0 0 20px">
      <a href="${confirmUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Review assignment</a>
    </p>
    <p style="margin:0;font-size:12px;color:#64748b">
      Or open: ${confirmUrl}<br/>
      Accept devices that arrived, or flag any that are missing or wrong.
    </p>
  </div>
</div>`;

  return {
    to: input.to,
    subject: `SAMU: ${input.itemCount} device(s) assigned — confirm receipt`,
    text,
    html,
  };
}
