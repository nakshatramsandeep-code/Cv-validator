export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { parseCsvRows } from "@/lib/csv-import";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const csvFile = form.get("csvFile");
  if (!(csvFile instanceof File)) {
    return NextResponse.json({ error: "Missing csvFile" }, { status: 400 });
  }

  const csvText = await csvFile.text();
  let rows;
  try {
    rows = parseCsvRows(csvText);
  } catch {
    return NextResponse.json({ error: "Could not parse CSV" }, { status: 400 });
  }

  const uploadedNames = new Set(
    form.getAll("files").filter((f): f is File => f instanceof File).map((f) => f.name)
  );

  const checked = rows.map((row) => {
    if (row.error) return row;
    if (row.filename && !row.cv_text && !uploadedNames.has(row.filename)) {
      return { ...row, error: `No uploaded file matches filename "${row.filename}"` };
    }
    return row;
  });

  return NextResponse.json({ rows: checked });
}
