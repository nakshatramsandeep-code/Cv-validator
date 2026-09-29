import { neon } from "@neondatabase/serverless";
import type { Role } from "./types";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

/** Tagged-template SQL client. Use for single statements. */
export const sql = neon(process.env.DATABASE_URL);

/**
 * Validates that rubric weights sum to 100 for every role. This is the app's
 * core scoring guarantee, so a violation is treated as fatal, not a warning.
 */
export async function assertRubricWeightsValid(): Promise<void> {
  const rows = (await sql`
    SELECT role, SUM(weight)::int AS total
    FROM rubric_criteria
    GROUP BY role
  `) as { role: Role; total: number }[];

  const byRole = new Map(rows.map((r) => [r.role, r.total]));
  const roles: Role[] = ["PM", "SPM"];
  const problems = roles
    .map((role) => ({ role, total: byRole.get(role) ?? 0 }))
    .filter((r) => r.total !== 100);

  if (problems.length > 0) {
    const detail = problems.map((p) => `${p.role}=${p.total}`).join(", ");
    throw new Error(
      `Rubric weights must sum to 100 per role. Found: ${detail}. Fix rubric_criteria before scoring.`
    );
  }
}
