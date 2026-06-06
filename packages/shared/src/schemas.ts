import { z } from "zod";
export const FieldAssertionSchema = z.object({
  name: z.string(), kind: z.enum(["structural", "exact", "semantic"]), tolerance: z.number().optional(),
});
export const ContractSchema = z.object({
  sutId: z.string(), version: z.number().int().positive(),
  fields: z.array(FieldAssertionSchema), invariants: z.array(z.string()),
});
export const ApprovalDecisionSchema = z.object({ approved: z.boolean(), reviewer: z.string(), note: z.string().optional() });
