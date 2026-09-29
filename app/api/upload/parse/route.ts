export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ingestCv } from "@/lib/ingest";
import type { Role } from "@/lib/types";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const appliedRole = form.get("appliedRole") as Role | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (appliedRole !== "PM" && appliedRole !== "SPM") {
    return NextResponse.json({ error: "appliedRole must be PM or SPM" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ingestCv({ buffer, filename: file.name, appliedRole });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
