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

/** Extracts raw text from a PDF, DOCX or TXT buffer. Must run on the Node runtime. */
export async function parseCvBuffer(buffer: Buffer, ext: SupportedExt): Promise<string> {
  switch (ext) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "txt":
      return buffer.toString("utf-8");
  }
}
