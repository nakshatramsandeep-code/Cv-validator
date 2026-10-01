import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import type { ConfidenceLevel, CriterionLayer, Role, RubricCriterion } from "./types";
import {
  briefSystemPrompt,
  briefUserPrompt,
  emailSystemPrompt,
  emailUserPrompt,
  guardrailSystemPrompt,
  guardrailUserPrompt,
  probesSystemPrompt,
  probesUserPrompt,
  scoringSystemPrompt,
  scoringUserPrompt,
  whyRankedHereSystemPrompt,
  whyRankedHereUserPrompt,
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

// ---------------------------------------------------------------------------
// Layer scoring (pattern / role_pm / role_spm)
// ---------------------------------------------------------------------------

const confidenceSchema = z.enum(["high", "medium", "low"]);
const layerScoreItemSchema = z.object({
  criterion_id: z.string(),
  score: z.number().int().min(0).max(4),
  confidence: confidenceSchema,
  evidence: z.string().min(1),
});
const layerScoreResponseSchema = z.array(layerScoreItemSchema);
export type LayerScoreItem = z.infer<typeof layerScoreItemSchema>;

const LAYER_SCORE_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      criterion_id: { type: Type.STRING },
      score: { type: Type.INTEGER },
      confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
      evidence: { type: Type.STRING },
    },
    required: ["criterion_id", "score", "confidence", "evidence"],
    propertyOrdering: ["criterion_id", "score", "confidence", "evidence"],
  },
};

/** Scores a candidate's (PII-stripped) CV against one layer's rubric criteria. */
export async function scoreLayer(
  layer: CriterionLayer,
  criteria: RubricCriterion[],
  cvContent: string
): Promise<LayerScoreItem[]> {
  const validCriterionIds = new Set(criteria.map((c) => c.id));

  return generateJson({
    systemInstruction: scoringSystemPrompt(layer),
    userPrompt: scoringUserPrompt(criteria, cvContent),
    responseSchema: LAYER_SCORE_RESPONSE_SCHEMA,
    parse: (raw) => {
      const parsed = layerScoreResponseSchema.parse(raw);
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

// ---------------------------------------------------------------------------
// Guardrail
// ---------------------------------------------------------------------------

const guardrailResponseSchemaZod = z.object({
  potential_flag: z.boolean(),
  potential_reason: z.string(),
  tier_changed: z.boolean(),
  final_tier: z.enum(["INTERVIEW", "REVIEW", "PASS"]),
  guardrail_notes: z.string().min(1),
});
export type GuardrailResult = z.infer<typeof guardrailResponseSchemaZod>;

const GUARDRAIL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    potential_flag: { type: Type.BOOLEAN },
    potential_reason: { type: Type.STRING },
    tier_changed: { type: Type.BOOLEAN },
    final_tier: { type: Type.STRING, enum: ["INTERVIEW", "REVIEW", "PASS"] },
    guardrail_notes: { type: Type.STRING },
  },
  required: ["potential_flag", "potential_reason", "tier_changed", "final_tier", "guardrail_notes"],
};

export async function runGuardrail(params: {
  patternScores: { code: string; score: number; confidence: ConfidenceLevel; evidence: string }[];
  roleScores: { code: string; score: number; confidence: ConfidenceLevel; evidence: string }[];
  role: Role;
  compositeForRole: number;
  tierForRole: "INTERVIEW" | "REVIEW" | "PASS";
}): Promise<GuardrailResult> {
  return generateJson({
    systemInstruction: guardrailSystemPrompt(),
    userPrompt: guardrailUserPrompt(params),
    responseSchema: GUARDRAIL_RESPONSE_SCHEMA,
    parse: (raw) => guardrailResponseSchemaZod.parse(raw),
  });
}

// ---------------------------------------------------------------------------
// Why ranked here (one sentence)
// ---------------------------------------------------------------------------

const whyRankedSchemaZod = z.object({ sentence: z.string().min(1) });
const WHY_RANKED_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: { sentence: { type: Type.STRING } },
  required: ["sentence"],
};

export async function generateWhyRankedHere(params: {
  cvContent: string;
  topScores: { name: string; score: number; evidence: string }[];
}): Promise<string> {
  const result = await generateJson({
    systemInstruction: whyRankedHereSystemPrompt(),
    userPrompt: whyRankedHereUserPrompt(params),
    responseSchema: WHY_RANKED_RESPONSE_SCHEMA,
    parse: (raw) => whyRankedSchemaZod.parse(raw),
  });
  return result.sentence;
}

// ---------------------------------------------------------------------------
// Probe questions
// ---------------------------------------------------------------------------

const probesSchemaZod = z.object({ probes: z.array(z.string().min(1)).min(1) });
const PROBES_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: { probes: { type: Type.ARRAY, items: { type: Type.STRING } } },
  required: ["probes"],
};

export async function generateProbes(params: {
  cvContent: string;
  jobDescription: string;
  lowConfidenceScores: { name: string; score: number; confidence: ConfidenceLevel; evidence: string }[];
}): Promise<string[]> {
  const result = await generateJson({
    systemInstruction: probesSystemPrompt(),
    userPrompt: probesUserPrompt(params),
    responseSchema: PROBES_RESPONSE_SCHEMA,
    parse: (raw) => probesSchemaZod.parse(raw),
  });
  return result.probes;
}

// ---------------------------------------------------------------------------
// Structured interview brief
// ---------------------------------------------------------------------------

const briefResponseSchemaZod = z.object({ brief_markdown: z.string().min(1) });
const BRIEF_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: { brief_markdown: { type: Type.STRING } },
  required: ["brief_markdown"],
};

export async function generateBrief(params: {
  cvContent: string;
  jobDescription: string;
  patternScores: { name: string; score: number; evidence: string }[];
  roleScores: { name: string; score: number; evidence: string }[];
  role: Role;
}): Promise<string> {
  const result = await generateJson({
    systemInstruction: briefSystemPrompt(),
    userPrompt: briefUserPrompt(params),
    responseSchema: BRIEF_RESPONSE_SCHEMA,
    parse: (raw) => briefResponseSchemaZod.parse(raw),
  });

  for (const heading of ["### Summary", "### Strengths", "### Risks & gaps to probe", "### Suggested focus areas"]) {
    if (!result.brief_markdown.includes(heading)) {
      throw new Error(`Brief is missing required section: ${heading}`);
    }
  }
  return result.brief_markdown;
}

// ---------------------------------------------------------------------------
// Email drafts
// ---------------------------------------------------------------------------

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
