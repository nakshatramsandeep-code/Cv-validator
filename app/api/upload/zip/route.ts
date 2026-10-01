export const runtime = "nodejs";
export const maxDuration = 60;

import AdmZip from "adm-zip";
import { NextRequest, NextResponse } from "next/server";
import { ingestCv } from "@/lib/ingest";
import { detectExt } from "@/lib/parse";
import type { Role } from "@/lib/types";

interface ZipEntryResult {
  filename: string;
  candidateId?: string;
  status: "processing" | "error";
  errorMessage?: string;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const rawRole = form.get("appliedRole");
    const appliedRole: Role | null = rawRole === "PM" || rawRole === "SPM" ? rawRole : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      return NextResponse.json({ error: "Could not read ZIP file" }, { status: 400 });
    }

    const results: ZipEntryResult[] = [];

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.split("/").pop() ?? entry.entryName;
      if (!detectExt(name)) continue;
      if (entry.header.size > 20 * 1024 * 1024) {
        results.push({ filename: name, status: "error", errorMessage: "File too large (>20MB)" });
        continue;
      }

      try {
        const entryBuffer = entry.getData();
        const result = await ingestCv({ buffer: entryBuffer, filename: name, appliedRole });
        results.push({ filename: name, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ filename: name, status: "error", errorMessage: message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
