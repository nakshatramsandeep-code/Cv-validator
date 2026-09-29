import { parse } from "csv-parse/sync";

export interface CsvRow {
  rowIndex: number;
  filename?: string;
  cv_text?: string;
  applied_role?: string;
  name?: string;
  email?: string;
  phone?: string;
  error?: string;
}

/**
 * Parses a bulk-import CSV: columns `filename` or `cv_text` (at least one
 * required), `applied_role` (PM/SPM, required), and optional `name`, `email`,
 * `phone` overrides. Validation only — does not touch the database.
 */
export function parseCsvRows(csvText: string): CsvRow[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return records.map((r, i) => {
    const row: CsvRow = {
      rowIndex: i,
      filename: r.filename || undefined,
      cv_text: r.cv_text || undefined,
      applied_role: r.applied_role || undefined,
      name: r.name || undefined,
      email: r.email || undefined,
      phone: r.phone || undefined,
    };

    if (row.applied_role !== "PM" && row.applied_role !== "SPM") {
      row.error = `Invalid applied_role "${row.applied_role ?? ""}". Must be PM or SPM.`;
    } else if (!row.filename && !row.cv_text) {
      row.error = "Row must have either a filename or cv_text column filled in.";
    }
    return row;
  });
}
