import type { RubricCriterion } from "./types";

/**
 * All AI prompts for the hiring pipeline live in this one file so they can be
 * read and tuned without touching call sites. Every prompt is a pure function
 * of its inputs — no hidden state, no PII (candidate name/email/phone never
 * appear here; cv_content is already stripped before it reaches these).
 */

export function scoringSystemPrompt(): string {
  return `You are scoring a candidate's CV against a hiring rubric for Kargo, a logistics SaaS company.

Score only from evidence written in the CV. Do not reward certifications, courses, talks,
brand-name employers, degrees/institutes, years of experience or tool lists. If there is no
concrete evidence for a criterion, score it 1 or 2. Each reason must be one line and must quote
or paraphrase the specific CV evidence you used. Never infer from job titles, company names or
credentials alone.

Scoring scale (apply to every criterion):
5 = Multiple specific, concrete instances matching the "strong" description
4 = One clear, specific instance
3 = Partial or indirect evidence (adjacent, or described vaguely)
2 = Only generic claims ("strong ownership", "passionate about ops") with no concrete example
1 = No evidence

Respond only with JSON matching the provided schema. Do not include markdown formatting.`;
}

export function scoringUserPrompt(criteria: RubricCriterion[], cvContent: string): string {
  const criteriaBlock = criteria
    .map(
      (c, i) =>
        `${i + 1}. criterion_id: ${c.id}\n   Name: ${c.name}\n   What a strong candidate looks like: ${c.description}`
    )
    .join("\n\n");

  return `RUBRIC CRITERIA:\n${criteriaBlock}\n\nCANDIDATE CV (personal identifying information has already been removed and replaced with [REDACTED]):\n"""\n${cvContent}\n"""\n\nScore the candidate against every criterion listed above.`;
}

export function briefSystemPrompt(): string {
  return `You write a 3-sentence interview brief for a hiring manager at Kargo, a logistics SaaS company.
You never see the candidate's name, email or phone number — the CV text you are given has already
had personal identifying information removed and replaced with [REDACTED]. Do not reference
[REDACTED] tokens in your output; write around them.

Write exactly 3 sentences, in this order:
1. Who they are, in one line (their background/function, not a name).
2. Why the system ranked them here: their strongest rubric evidence, cited concretely.
3. The one thing to probe in the interview: their weakest scored criterion, or an unverified claim.

Respond only with JSON matching the provided schema. The brief_text field must contain exactly
3 sentences and nothing else (no headers, no bullet points).`;
}

export function briefUserPrompt(params: {
  cvContent: string;
  jobDescription: string;
  scores: { criterionName: string; score: number; reason: string }[];
}): string {
  const scoresBlock = params.scores
    .map((s) => `- ${s.criterionName}: ${s.score}/5 — ${s.reason}`)
    .join("\n");

  return `JOB DESCRIPTION (for context on the role only; do not score against it):\n"""\n${params.jobDescription}\n"""\n\nCANDIDATE CV (PII removed):\n"""\n${params.cvContent}\n"""\n\nRUBRIC SCORES:\n${scoresBlock}\n\nWrite the 3-sentence interview brief.`;
}

export function emailSystemPrompt(type: "invite" | "rejection"): string {
  const shared = `You draft an email from Arjun Mehta, Founder of Kargo, to a job candidate.
You never see the candidate's name, email or phone number — use the literal token {{FIRST_NAME}}
wherever a greeting or name would go (e.g. "Hi {{FIRST_NAME}},"). The CV text you are given has
already had personal identifying information removed and replaced with [REDACTED]; do not
reference [REDACTED] tokens in your output.

The email must be specific to something real in the candidate's background (quote or paraphrase
an actual detail from their CV). Never invent claims not supported by the CV.
Sign off as: Arjun Mehta, Founder, Kargo.

Respond only with JSON matching the provided schema (subject, body).`;

  if (type === "invite") {
    return `${shared}

This is an INVITE email. Tone: warm, specific, proposes a 30-minute conversation, and asks the
candidate for 2-3 time slots that work for them this week. Keep it brief.`;
  }

  return `${shared}

This is a WARM REJECTION email. Tone: warm and respectful. Thank them for applying. Name one
genuine strength from their CV. No generic HR language, no fake promises to "keep their CV on
file" or "reach out in future" unless clearly true, no rubric scores, no internal reasons for
the decision. Kind and brief.`;
}

export function emailUserPrompt(params: {
  type: "invite" | "rejection";
  cvContent: string;
  jobDescription: string;
}): string {
  return `JOB DESCRIPTION (for context on the role only):\n"""\n${params.jobDescription}\n"""\n\nCANDIDATE CV (PII removed):\n"""\n${params.cvContent}\n"""\n\nWrite the ${params.type} email.`;
}
