import { z } from "zod";

export const assignTcBodySchema = z.object({
  tcUserId: z.string().min(1),
});

export const territoryIdParamSchema = z.object({
  id: z.string().min(1),
});

export type AssignTcBody = z.infer<typeof assignTcBodySchema>;
