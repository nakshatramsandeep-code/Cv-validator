export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { parseCsvRows } from "@/lib/csv-import";
import { ingestFromText } from "@/lib/ingest";
import { detectExt, parseCvBuffer } from "@/lib/parse";
import type { Role } from "@/lib/types";

interface CommitResult {
  rowIndex: number;
  filename?: string;
  candidateId?: string;
  status: "processing" | "error";
  errorMessage?: string;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const csvFile = form.get("csvFile");
  if (!(csvFile instanceof File)) {
    return NextResponse.json({ error: "Missing csvFile" }, { status: 400 });
  }

  const csvText = await csvFile.text();
  const rows = parseCsvRows(csvText);

  const uploadedFiles = new Map(
    form.getAll("files").filter((f): f is File => f instanceof File).map((f) => [f.name, f])
  );

  const results: CommitResult[] = [];

  for (const row of rows) {
    if (row.error) {
      results.push({ rowIndex: row.rowIndex, filename: row.filename, status: "error", errorMessage: row.error });
      continue;
    }
    const appliedRole: Role | null = row.applied_role === "PM" || row.applied_role === "SPM" ? row.applied_role : null;
    const overrides = { fullName: row.name, email: row.email, phone: row.phone };

    try {
      if (row.cv_text) {
        const result = await ingestFromText({
          rawText: row.cv_text,
          filename: row.filename || `row-${row.rowIndex + 1}.txt`,
          appliedRole,
          overrides,
        });
        results.push({ rowIndex: row.rowIndex, filename: row.filename, ...result });
      } else {
        const file = uploadedFiles.get(row.filename!);
        if (!file) {
          results.push({
            rowIndex: row.rowIndex,
            filename: row.filename,
            status: "error",
            errorMessage: `No uploaded file matches filename "${row.filename}"`,
          });
          continue;
        }
        if (!detectExt(file.name)) {
          results.push({
            rowIndex: row.rowIndex,
            filename: row.filename,
            status: "error",
            errorMessage: "Unsupported file type",
          });
          continue;
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const rawText = await parseCvBuffer(buffer, detectExt(file.name)!);
        const result = await ingestFromText({ rawText, filename: file.name, appliedRole, overrides });
        results.push({ rowIndex: row.rowIndex, filename: row.filename, ...result });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ rowIndex: row.rowIndex, filename: row.filename, status: "error", errorMessage: message });
    }
  }

  return NextResponse.json({ results });
}
