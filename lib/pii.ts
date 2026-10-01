import type { RedactionReport } from "./types";

export interface ExtractedPii {
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Indian mobile/landline formats: +91 98204 37810, 098204-37810, 9820437810,
// 080-2345 6789, with optional country code, spaces, dots or hyphens. Matches
// broadly and relies on isPlausiblePhone() below to reject non-phone digit runs
// (years, shipment counts, date ranges) by their total digit count.
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,15}\d)/g;

const URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s,)]+/gi;

const GENERIC_URL_RE = /(?:https?:\/\/)?(?:www\.)[^\s,)]+\.[a-z]{2,}[^\s,)]*/gi;

/**
 * A run of at least 4 digits is treated as a plausible phone match. This
 * filters out short numbers (years, counts) picked up incidentally by a loose
 * regex while still catching real Indian numbers, which are always 10+ digits.
 */
function isPlausiblePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

function extractEmail(text: string): string | null {
  const match = text.match(EMAIL_RE);
  return match ? match[0] : null;
}

function extractPhone(text: string): string | null {
  const matches = text.match(PHONE_RE) ?? [];
  const plausible = matches.filter(isPlausiblePhone);
  return plausible.length > 0 ? plausible[0] : null;
}

/**
 * Name heuristic: first non-empty line, or the largest heading-like line
 * (short, title-cased, no digits/@ symbol) near the top of the CV. Falls back
 * to a line near the email, then to the filename.
 */
// Common resume section headings that trivially pass the name shape check
// (single short word, letters only) but are never a candidate's actual name.
const SECTION_HEADING_WORDS = new Set([
  "summary", "profile", "objective", "overview", "about", "experience",
  "education", "academics", "academic", "skills", "projects", "project",
  "certifications", "certification", "achievements", "awards", "contact",
  "references", "professional", "qualifications", "interests", "hobbies",
  "languages", "publications", "declaration", "personal", "details",
  "information", "career", "employment", "history", "background",
  "curriculum", "vitae", "resume", "biodata", "profile summary",
]);

function extractName(text: string, email: string | null, filename: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const looksLikeName = (line: string) => {
    if (line.length === 0 || line.length > 60) return false;
    if (line.includes("@")) return false;
    if (/\d/.test(line)) return false;
    if (/\.(pdf|docx|txt)/i.test(line)) return false;
    if (/^(curriculum vitae|resume|cv)$/i.test(line)) return false;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) return false;
    if (!words.every((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w))) return false;
    // Reject common section headings, e.g. "SUMMARY", "Education", "Professional".
    const normalized = line.toLowerCase().trim();
    if (SECTION_HEADING_WORDS.has(normalized)) return false;
    if (words.length === 1 && SECTION_HEADING_WORDS.has(words[0].toLowerCase())) return false;
    return true;
  };

  for (const line of lines.slice(0, 8)) {
    if (looksLikeName(line)) return line;
  }

  if (email) {
    const idx = lines.findIndex((l) => l.includes(email));
    if (idx >= 0) {
      for (const offset of [-1, 1, -2, 2]) {
        const candidate = lines[idx + offset];
        if (candidate && looksLikeName(candidate)) return candidate;
      }
    }
  }

  const base = filename.replace(/\.(pdf|docx|txt)$/i, "");
  const fromFilename = base
    .replace(/^cv[_\-\s]*\d*[_\-\s]*/i, "")
    .replace(/[_\-]+/g, " ")
    .trim();
  return fromFilename.length > 0 ? fromFilename : null;
}

export function extractPii(rawText: string, filename: string): ExtractedPii {
  const email = extractEmail(rawText);
  const phone = extractPhone(rawText);
  const fullName = extractName(rawText, email, filename);
  return { fullName, email, phone };
}

function nameVariants(fullName: string): string[] {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const variants = new Set<string>();
  if (fullName.trim().length > 0) variants.add(fullName.trim());
  for (const part of parts) {
    if (part.length > 1) variants.add(part);
  }
  if (parts.length >= 2) {
    variants.add(`${parts[0]} ${parts[parts.length - 1]}`);
  }
  return Array.from(variants).sort((a, b) => b.length - a.length);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes name, email, phone and LinkedIn/GitHub/portfolio URLs from CV text,
 * replacing each with [REDACTED]. Returns the stripped text plus counts of
 * what was removed (never the values themselves).
 */
export function redactPii(
  rawText: string,
  pii: ExtractedPii
): { cvContent: string; report: RedactionReport } {
  let text = rawText;
  const report: RedactionReport = {
    name_removed: 0,
    emails_removed: 0,
    phones_removed: 0,
    urls_removed: 0,
  };

  // Structural patterns (URL/email/phone) run before the loose name-substring
  // match below, so a name embedded in an email/handle (e.g. "devika.nair@...")
  // gets redacted as one clean token instead of being chopped up first.
  const linkedinGithub = text.match(URL_RE);
  if (linkedinGithub) {
    report.urls_removed += linkedinGithub.length;
    text = text.replace(URL_RE, "[REDACTED]");
  }
  const genericUrls = text.match(GENERIC_URL_RE);
  if (genericUrls) {
    report.urls_removed += genericUrls.length;
    text = text.replace(GENERIC_URL_RE, "[REDACTED]");
  }

  const emails = text.match(EMAIL_RE);
  if (emails) {
    report.emails_removed += emails.length;
    text = text.replace(EMAIL_RE, "[REDACTED]");
  }

  const phones = (text.match(PHONE_RE) ?? []).filter(isPlausiblePhone);
  if (phones.length > 0) {
    report.phones_removed += phones.length;
    text = text.replace(PHONE_RE, (m) => (isPlausiblePhone(m) ? "[REDACTED]" : m));
  }

  if (pii.fullName) {
    for (const variant of nameVariants(pii.fullName)) {
      const re = new RegExp(escapeRegex(variant), "gi");
      const matches = text.match(re);
      if (matches) {
        report.name_removed += matches.length;
        text = text.replace(re, "[REDACTED]");
      }
    }
  }

  return { cvContent: text, report };
}

/**
 * Privacy guarantee check: throws if the stripped text still contains the
 * candidate's stored name, email or phone. Must pass before any AI call.
 */
export function assertNoPiiLeaked(cvContent: string, pii: ExtractedPii): void {
  const lower = cvContent.toLowerCase();

  if (pii.email && lower.includes(pii.email.toLowerCase())) {
    throw new Error("PII leak check failed: email still present in cv_content");
  }
  if (pii.phone) {
    const digitsInContent = cvContent.replace(/\D/g, "");
    const digitsInPhone = pii.phone.replace(/\D/g, "");
    if (digitsInPhone.length >= 10 && digitsInContent.includes(digitsInPhone)) {
      throw new Error("PII leak check failed: phone still present in cv_content");
    }
  }
  if (pii.fullName) {
    for (const variant of nameVariants(pii.fullName)) {
      if (variant.length > 1 && lower.includes(variant.toLowerCase())) {
        throw new Error("PII leak check failed: name still present in cv_content");
      }
    }
  }
}
