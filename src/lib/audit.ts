import { logger } from "./logger.js";
import { prisma } from "./prisma.js";

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  objectType: string;
  objectId: string;
  summary: string;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Best-effort audit write — never throws into the request path.
 */
export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId,
        summary: input.summary,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    logger.warn({ err: error, action: input.action }, "Failed to write audit log");
  }
}
