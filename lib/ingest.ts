import { sql } from "./db";
import { detectExt, parseCvBuffer } from "./parse";
import { assertNoPiiLeaked, extractPii, redactPii, type ExtractedPii } from "./pii";
import type { Role } from "./types";

export interface IngestResult {
  candidateId: string;
  status: "processing" | "error";
  errorMessage?: string;
}

export interface IngestOverrides {
  fullName?: string;
  email?: string;
  phone?: string;
}

/**
 * STEP 1 of the pipeline: separate PII from already-extracted raw text, with
 * no AI call. Inserts the candidate (status 'processing', or 'error' if the
 * post-redaction leak check fails) and the candidate_pii row. Scoring is a
 * separate step (see lib/pipeline.ts) so each request stays short and
 * progress is visible. Used directly for CSV rows carrying raw cv_text; file
 * uploads go through `ingestCv`, which parses the buffer first.
 */
export async function ingestFromText(params: {
  rawText: string;
  filename: string;
  appliedRole: Role | null;
  overrides?: IngestOverrides;
}): Promise<IngestResult> {
  const rawText = params.rawText;
  const extracted = extractPii(rawText, params.filename);
  const pii: ExtractedPii = {
    fullName: params.overrides?.fullName || extracted.fullName,
    email: params.overrides?.email || extracted.email,
    phone: params.overrides?.phone || extracted.phone,
  };

  const { cvContent, report } = redactPii(rawText, pii);

  let leakError: string | null = null;
  try {
    assertNoPiiLeaked(cvContent, pii);
  } catch (err) {
    leakError = err instanceof Error ? err.message : String(err);
  }

  const status = leakError ? "error" : "processing";
  const rows = (await sql`
    INSERT INTO candidates
      (applied_role, original_filename, status, error_message, cv_content, pii_redaction_report)
    VALUES (
      ${params.appliedRole},
      ${params.filename},
      ${status},
      ${leakError},
      ${leakError ? null : cvContent},
      ${JSON.stringify(report)}::jsonb
    )
    RETURNING id
  `) as { id: string }[];
  const candidateId = rows[0].id;

  await sql`
    INSERT INTO candidate_pii (candidate_id, full_name, email, phone)
    VALUES (${candidateId}, ${pii.fullName}, ${pii.email}, ${pii.phone})
  `;

  return { candidateId, status, errorMessage: leakError ?? undefined };
}

/** File-upload entry point: parses the buffer (PDF/DOCX/TXT) then delegates to `ingestFromText`. */
export async function ingestCv(params: {
  buffer: Buffer;
  filename: string;
  appliedRole: Role | null;
  overrides?: IngestOverrides;
}): Promise<IngestResult> {
  const ext = detectExt(params.filename);
  if (!ext) {
    throw new Error(`Unsupported file type: ${params.filename}. Use PDF, DOCX or TXT.`);
  }
  const rawText = await parseCvBuffer(params.buffer, ext);
  return ingestFromText({
    rawText,
    filename: params.filename,
    appliedRole: params.appliedRole,
    overrides: params.overrides,
  });
}
