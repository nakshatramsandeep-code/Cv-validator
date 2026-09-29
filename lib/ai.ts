import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import type { RubricCriterion } from "./types";
import {
  briefSystemPrompt,
  briefUserPrompt,
  emailSystemPrompt,
  emailUserPrompt,
  scoringSystemPrompt,
  scoringUserPrompt,
} from "./prompts";

function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function getModel(): string {
  if (!process.env.GEMINI_MODEL) {
    throw new Error("GEMINI_MODEL is not set");
  }
  return process.env.GEMINI_MODEL;
}

const scoreItemSchema = z.object({
  criterion_id: z.string(),
  score: z.number().int().min(1).max(5),
  reason: z.string().min(1),
});
const scoresResponseSchema = z.array(scoreItemSchema);
export type ScoreItem = z.infer<typeof scoreItemSchema>;

const SCORE_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      criterion_id: { type: Type.STRING },
      score: { type: Type.INTEGER },
      reason: { type: Type.STRING },
    },
    required: ["criterion_id", "score", "reason"],
    propertyOrdering: ["criterion_id", "score", "reason"],
  },
};

const briefResponseSchemaZod = z.object({ brief_text: z.string().min(1) });
const BRIEF_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: { brief_text: { type: Type.STRING } },
  required: ["brief_text"],
};

const emailResponseSchemaZod = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});
const EMAIL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    body: { type: Type.STRING },
  },
  required: ["subject", "body"],
};

async function generateJson<T>(params: {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: object;
  parse: (raw: unknown) => T;
}): Promise<T> {
  const client = getClient();
  const model = getModel();

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: params.userPrompt,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
          temperature: 0,
        },
      });
      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      const json = JSON.parse(text);
      return params.parse(json);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Gemini call failed after retry: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/** Scores a candidate's (PII-stripped) CV against one role's rubric criteria. */
export async function scoreCandidate(
  criteria: RubricCriterion[],
  cvContent: string
): Promise<ScoreItem[]> {
  const validCriterionIds = new Set(criteria.map((c) => c.id));

  return generateJson({
    systemInstruction: scoringSystemPrompt(),
    userPrompt: scoringUserPrompt(criteria, cvContent),
    responseSchema: SCORE_RESPONSE_SCHEMA,
    parse: (raw) => {
      const parsed = scoresResponseSchema.parse(raw);
      const seen = new Set<string>();
      for (const item of parsed) {
        if (!validCriterionIds.has(item.criterion_id)) {
          throw new Error(`Unknown criterion_id in model response: ${item.criterion_id}`);
        }
        seen.add(item.criterion_id);
      }
      for (const id of validCriterionIds) {
        if (!seen.has(id)) {
          throw new Error(`Missing score for criterion_id: ${id}`);
        }
      }
      return parsed;
    },
  });
}

/** Generates a 3-sentence interview brief for an above-the-line candidate. */
export async function generateBrief(params: {
  cvContent: string;
  jobDescription: string;
  scores: { criterionName: string; score: number; reason: string }[];
}): Promise<string> {
  const result = await generateJson({
    systemInstruction: briefSystemPrompt(),
    userPrompt: briefUserPrompt(params),
    responseSchema: BRIEF_RESPONSE_SCHEMA,
    parse: (raw) => briefResponseSchemaZod.parse(raw),
  });

  const sentenceCount = (result.brief_text.match(/[.!?](?:\s|$)/g) ?? []).length;
  if (sentenceCount !== 3) {
    throw new Error(`Brief must be exactly 3 sentences, got ${sentenceCount}: ${result.brief_text}`);
  }
  return result.brief_text;
}

/** Generates an email draft (invite or rejection). Uses {{FIRST_NAME}} as the greeting token. */
export async function generateEmailDraft(params: {
  type: "invite" | "rejection";
  cvContent: string;
  jobDescription: string;
}): Promise<{ subject: string; body: string }> {
  return generateJson({
    systemInstruction: emailSystemPrompt(params.type),
    userPrompt: emailUserPrompt(params),
    responseSchema: EMAIL_RESPONSE_SCHEMA,
    parse: (raw) => emailResponseSchemaZod.parse(raw),
  });
}
