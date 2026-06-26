import { z } from "zod";
import { insertSyncConfigSchema } from "@shared/schema";

// Rejects configs that set the same non-empty ONIX fixed field name on more than
// one row. During sync only the first occurrence (higher row) wins, so silently
// persisting duplicates via the API, import, or seed would drop the lower rows.
export function refineNoDuplicateFixedFields(
  data: { onixFixedFields?: Array<{ field: string }> | null },
  ctx: z.RefinementCtx,
) {
  const fields = data.onixFixedFields;
  if (!Array.isArray(fields)) return;
  const counts = new Map<string, number>();
  for (const ff of fields) {
    const name = (ff.field || "").trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["onixFixedFields"],
      message: `Duplicate fixed fields are not allowed; each field may be set only once. The higher row takes precedence. Duplicates: ${duplicates.join(", ")}`,
    });
  }
}

// Rejects configs whose field mappings point two or more rows at the same target
// field. During sync each target should be written once; persisting duplicate
// targets via the API, import, or seed (bypassing the editor's validateMappings)
// would make the effective mapping ambiguous. Mirrors the client-side check.
export function refineNoDuplicateMappingTargets(
  data: { fieldMappings?: Array<{ sourceField?: string; targetField?: string }> | null },
  ctx: z.RefinementCtx,
) {
  const mappings = data.fieldMappings;
  if (!Array.isArray(mappings)) return;
  const counts = new Map<string, number>();
  for (const m of mappings) {
    const target = (m.targetField || "").trim();
    if (target) counts.set(target, (counts.get(target) || 0) + 1);
  }
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fieldMappings"],
      message: `Duplicate target fields are not allowed; each target field may be mapped only once. Duplicates: ${duplicates.join(", ")}`,
    });
  }
}

// Derived from the canonical insertSyncConfigSchema so route, import, and seed
// validation can never drift from the DB-backed shape. We only layer on the
// route-specific requirements (createdBy comes from the session, plus stricter
// scalar rules and enums) instead of re-declaring every nested object shape.
export const baseSyncConfigSchema = insertSyncConfigSchema.omit({ createdBy: true }).extend({
  name: z.string().min(1),
  targetModuleId: z.string().min(1),
  sourceModuleId: z.string().min(1),
  sourceRecordLimit: z.number().int().min(0).optional(),
  fieldMappings: z.array(z.object({
    sourceField: z.string().min(1),
    targetField: z.string().min(1),
    transform: z.string().optional(),
  })),
  matchOperator: z.enum(["and", "or"]).optional(),
  onMissing: z.enum(["create", "skip", "force"]).optional(),
  autoRetry: z.boolean().optional(),
  retryDelayMin: z.number().int().min(1).max(120).optional(),
});

export const createSyncConfigSchema = baseSyncConfigSchema.extend({
  sourceRecordLimit: z.number().int().min(0).optional().default(120000),
  fieldMappings: z.array(z.object({
    sourceField: z.string().min(1),
    targetField: z.string().min(1),
    transform: z.string().optional(),
  })).min(1),
}).superRefine(refineNoDuplicateFixedFields).superRefine(refineNoDuplicateMappingTargets);

export const updateSyncConfigSchema = baseSyncConfigSchema
  .partial()
  .superRefine(refineNoDuplicateFixedFields)
  .superRefine(refineNoDuplicateMappingTargets);

export type CreateSyncConfigInput = z.infer<typeof createSyncConfigSchema>;
export type UpdateSyncConfigInput = z.infer<typeof updateSyncConfigSchema>;
