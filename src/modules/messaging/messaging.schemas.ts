import { z } from "zod";

export const sendSmsSchema = z.object({
  toPhone: z.string().trim().min(7).max(32),
  body: z.string().trim().min(1).max(500).optional(),
  templateId: z.string().trim().max(80).optional(),
  visitId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
}).refine((v) => Boolean(v.body?.trim()) || Boolean(v.templateId), {
  message: "Provide body or templateId",
});

export const messageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["stub_queued", "stub_sent", "stub_failed"]).optional(),
});

export type SendSmsInput = z.infer<typeof sendSmsSchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
