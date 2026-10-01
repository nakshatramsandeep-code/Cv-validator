import { describe, expect, it } from "vitest";
import { assertNoPiiLeaked, extractPii, redactPii } from "../pii";

const FIXTURE_1 = `Rohan Desai
Mumbai, India | rohan.desai88@gmail.com | +91 98204 37810
linkedin.com/in/rohandesai88

Summary
Operations-turned-product professional with 3 years at a CHA firm in Nhava Sheva.

Experience
Senior Documentation Executive, Meridian Shipping (2021-2024)
- Managed documentation for 180+ shipments/month.
- Built an Excel tracker adopted by the 12-person ops team within two weeks.

Contact: rohan.desai88@gmail.com or 09820437810.
`;

const FIXTURE_2 = `SUNITA KRISHNAMURTHY
sunita.k@outlook.com
Phone: 080-2345 6789
github.com/sunitak

Independent logistics consultant. Rebuilt the documentation intake workflow
over a weekend when the FMS vendor changed formats.
`;

const FIXTURE_3 = `cv_12_meghna_tiwari.pdf content with no header line at all.
meghna.tiwari@proton.me
9876543210
Resolved a customs hold with the CHA through the night.
`;

// Real PDF extraction often splits a two-word heading like "PROFESSIONAL
// SUMMARY" across two lines, each of which trivially looks like a name.
const FIXTURE_4 = `PROFESSIONAL
SUMMARY
Priya Nair
priya.nair.test@example.com
+91 90123 45678
Led a 3-person ops team for a 3PL in Chennai.
`;

describe("extractPii", () => {
  it("extracts name, email and phone from a well-formed header", () => {
    const pii = extractPii(FIXTURE_1, "cv_1.pdf");
    expect(pii.fullName).toBe("Rohan Desai");
    expect(pii.email).toBe("rohan.desai88@gmail.com");
    expect(pii.phone).not.toBeNull();
  });

  it("handles an all-caps name and a hyphenated landline", () => {
    const pii = extractPii(FIXTURE_2, "cv_2.pdf");
    expect(pii.fullName).toBe("SUNITA KRISHNAMURTHY");
    expect(pii.email).toBe("sunita.k@outlook.com");
    expect(pii.phone).not.toBeNull();
  });

  it("falls back to the filename when there is no usable header", () => {
    const pii = extractPii(FIXTURE_3, "cv_12_meghna_tiwari.pdf");
    expect(pii.fullName).toBe("meghna tiwari");
    expect(pii.email).toBe("meghna.tiwari@proton.me");
  });

  it("skips section-heading lines (e.g. a wrapped 'PROFESSIONAL SUMMARY') to find the real name", () => {
    const pii = extractPii(FIXTURE_4, "cv_4.pdf");
    expect(pii.fullName).toBe("Priya Nair");
    expect(pii.fullName).not.toMatch(/^(professional|summary)$/i);
  });
});

describe("redactPii + assertNoPiiLeaked", () => {
  it("removes every occurrence of name, email, phone and social URLs", () => {
    const pii = extractPii(FIXTURE_1, "cv_1.pdf");
    const { cvContent, report } = redactPii(FIXTURE_1, pii);

    expect(cvContent).not.toContain("Rohan");
    expect(cvContent).not.toContain("Desai");
    expect(cvContent).not.toContain("rohan.desai88@gmail.com");
    expect(cvContent).not.toContain("98204");
    expect(cvContent).not.toContain("linkedin.com");
    expect(cvContent).toContain("[REDACTED]");
    expect(cvContent).toContain("Nhava Sheva");
    expect(cvContent).toContain("Mumbai, India");

    expect(report.name_removed).toBeGreaterThan(0);
    expect(report.emails_removed).toBeGreaterThan(0);
    expect(report.phones_removed).toBeGreaterThan(0);
    expect(report.urls_removed).toBeGreaterThan(0);

    expect(() => assertNoPiiLeaked(cvContent, pii)).not.toThrow();
  });

  it("passes the leak check for fixture 2 and 3 as well", () => {
    for (const [fixture, filename] of [
      [FIXTURE_2, "cv_2.pdf"],
      [FIXTURE_3, "cv_12_meghna_tiwari.pdf"],
    ] as const) {
      const pii = extractPii(fixture, filename);
      const { cvContent } = redactPii(fixture, pii);
      expect(() => assertNoPiiLeaked(cvContent, pii)).not.toThrow();
    }
  });

  it("throws if a name variant survives redaction", () => {
    const pii = { fullName: "Rohan Desai", email: null, phone: null };
    const leaked = "Rohan Desai still appears here.";
    expect(() => assertNoPiiLeaked(leaked, pii)).toThrow();
  });

  it("redacts an email containing the person's name as one clean token, not fragments", () => {
    // Regression test: email/URL/phone must be redacted before the loose
    // name-substring match, otherwise "devika.nair@..." gets chopped into
    // "[REDACTED].[REDACTED]@..." instead of one "[REDACTED]".
    const fixture = `Devika Nair\nChennai, India | devika.nair.test@example.com | +91 90000 11223`;
    const pii = extractPii(fixture, "cv.txt");
    const { cvContent } = redactPii(fixture, pii);

    expect(cvContent).not.toMatch(/\[REDACTED\]\s*\[REDACTED\]/);
    expect(cvContent).not.toMatch(/\[REDACTED\]\.\[REDACTED\]/);
    expect(() => assertNoPiiLeaked(cvContent, pii)).not.toThrow();
  });
});
