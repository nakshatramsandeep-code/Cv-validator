import { sql } from "@/lib/db";
import type { RubricCriterion } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getCriteria(): Promise<RubricCriterion[]> {
  return (await sql`
    SELECT id, role, name, description, weight, sort_order
    FROM rubric_criteria ORDER BY role, sort_order
  `) as unknown as RubricCriterion[];
}

export default async function RubricPage() {
  const criteria = await getCriteria();
  const pm = criteria.filter((c) => c.role === "PM");
  const spm = criteria.filter((c) => c.role === "SPM");

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Rubric</h1>
        <p className="text-sm text-gray-500">
          Read-only. Derived from patterns in Arjun&apos;s past hires, not from the job descriptions.
        </p>
      </div>

      {[
        { label: "Product Manager", rows: pm },
        { label: "Senior Product Manager", rows: spm },
      ].map((section) => (
        <div key={section.label} className="space-y-3">
          <h2 className="font-semibold">{section.label}</h2>
          <p className="text-xs text-gray-400">
            Weights total: {section.rows.reduce((s, r) => s + r.weight, 0)}
          </p>
          {section.rows.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{c.name}</h3>
                <span className="text-sm text-gray-500">{c.weight}%</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">{c.description}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
