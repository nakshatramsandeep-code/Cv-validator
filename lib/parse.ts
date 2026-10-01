import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type SupportedExt = "pdf" | "docx" | "txt";

export function detectExt(filename: string): SupportedExt | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Postgres text columns reject the NUL byte (0x00) outright, and other C0
 * control characters (besides tab/newline/CR) have no business in CV text.
 * PDF/DOCX extraction occasionally yields these from corrupted font tables or
 * embedded objects, so strip them before this text ever reaches the database.
 */
export function sanitizeExtractedText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Extracts raw text from a PDF, DOCX or TXT buffer. Must run on the Node runtime. */
export async function parseCvBuffer(buffer: Buffer, ext: SupportedExt): Promise<string> {
  const raw = await (async () => {
    switch (ext) {
      case "pdf":
        return parsePdf(buffer);
      case "docx":
        return parseDocx(buffer);
      case "txt":
        return buffer.toString("utf-8");
    }
  })();
  return sanitizeExtractedText(raw);
}
