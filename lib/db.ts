import { neon } from "@neondatabase/serverless";
import type { CriterionLayer } from "./types";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

/** Tagged-template SQL client. Use for single statements. */
export const sql = neon(process.env.DATABASE_URL);

/**
 * Validates that rubric weights sum to 100 for every layer (pattern, role_pm,
 * role_spm). This is the app's core scoring guarantee, so a violation is
 * treated as fatal, not a warning.
 */
export async function assertRubricWeightsValid(): Promise<void> {
  const rows = (await sql`
    SELECT layer, SUM(weight)::int AS total
    FROM rubric_criteria
    GROUP BY layer
  `) as { layer: CriterionLayer; total: number }[];

  const byLayer = new Map(rows.map((r) => [r.layer, r.total]));
  const layers: CriterionLayer[] = ["pattern", "role_pm", "role_spm"];
  const problems = layers
    .map((layer) => ({ layer, total: byLayer.get(layer) ?? 0 }))
    .filter((p) => p.total !== 100);

  if (problems.length > 0) {
    const detail = problems.map((p) => `${p.layer}=${p.total}`).join(", ");
    throw new Error(
      `Rubric weights must sum to 100 per layer. Found: ${detail}. Fix rubric_criteria before scoring.`
    );
  }
}
