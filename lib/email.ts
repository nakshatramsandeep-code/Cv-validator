import { Resend } from "resend";
import { sql } from "./db";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email not configured");
    this.name = "EmailNotConfiguredError";
  }
}

export class AlreadySentError extends Error {
  constructor() {
    super("This draft has already been sent");
    this.name = "AlreadySentError";
  }
}

export class UnsubstitutedTokenError extends Error {
  constructor(token: string) {
    super(`Email body still contains an unsubstituted token: ${token}`);
    this.name = "UnsubstitutedTokenError";
  }
}

function assertNoLeftoverTokens(body: string): void {
  for (const token of ["{{", "[NAME]", "[REDACTED]"]) {
    if (body.includes(token)) {
      throw new UnsubstitutedTokenError(token);
    }
  }
}

/**
 * Sends the email draft for one candidate. Substitutes {{FIRST_NAME}} from
 * candidate_pii (never from the AI-visible cv_content). If TEST_RECIPIENT_EMAIL
 * is set, always redirects there and prefixes the subject, so this can never
 * reach a real external address outside of production.
 */
export async function sendCandidateEmail(candidateId: string): Promise<{
  status: "sent" | "failed";
  resendMessageId?: string;
  sentTo?: string;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailNotConfiguredError();
  }

  const draftRows = (await sql`
    SELECT id, type, subject, body_template, edited_body, status
    FROM email_drafts WHERE candidate_id = ${candidateId}
  `) as {
    id: string;
    type: string;
    subject: string;
    body_template: string;
    edited_body: string | null;
    status: string;
  }[];

  if (draftRows.length === 0) {
    throw new Error("No email draft exists for this candidate");
  }
  const draft = draftRows[0];
  if (draft.status === "sent") {
    throw new AlreadySentError();
  }

  const piiRows = (await sql`
    SELECT full_name, email FROM candidate_pii WHERE candidate_id = ${candidateId}
  `) as { full_name: string | null; email: string | null }[];
  if (piiRows.length === 0 || !piiRows[0].email) {
    throw new Error("No stored email address for this candidate");
  }
  const { full_name, email } = piiRows[0];
  const firstName = (full_name ?? "there").trim().split(/\s+/)[0] || "there";

  const rawBody = draft.edited_body ?? draft.body_template;
  const body = rawBody.replace(/\{\{FIRST_NAME\}\}/g, firstName);
  assertNoLeftoverTokens(body);

  const testRecipient = process.env.TEST_RECIPIENT_EMAIL;
  const recipient = testRecipient || email;
  const subject = testRecipient ? `[TEST -> ${email}] ${draft.subject}` : draft.subject;

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || "Kargo Hiring <onboarding@resend.dev>";

  try {
    const result = await resend.emails.send({
      from,
      to: recipient,
      subject,
      text: body,
    });

    if (result.error) {
      const message = result.error.message || "Resend API error";
      await sql`
        UPDATE email_drafts SET status = 'failed', updated_at = now() WHERE id = ${draft.id}
      `;
      return { status: "failed", error: message };
    }

    const messageId = result.data?.id ?? null;
    await sql`
      UPDATE email_drafts
      SET status = 'sent', sent_at = now(), resend_message_id = ${messageId}, sent_to = ${recipient}, updated_at = now()
      WHERE id = ${draft.id}
    `;
    return { status: "sent", resendMessageId: messageId ?? undefined, sentTo: recipient };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE email_drafts SET status = 'failed', updated_at = now() WHERE id = ${draft.id}
    `;
    return { status: "failed", error: message };
  }
}
