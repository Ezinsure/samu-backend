import { z } from "zod";
import { serviceLineSchema } from "../../lib/service-lines.js";

export const serviceLineParamSchema = z.object({
  line: serviceLineSchema,
});

export type ServiceLineParam = z.infer<typeof serviceLineParamSchema>;
