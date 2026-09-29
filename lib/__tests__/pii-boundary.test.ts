import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Structural privacy guarantee: the AI-facing modules must have no code path
 * to candidate_pii. This is a static source check rather than a runtime mock,
 * so it catches the mistake even if a future test forgets to assert on it.
 */
const AI_FACING_MODULES = ["../ai.ts", "../prompts.ts", "../job-descriptions.ts"];

describe("PII boundary", () => {
  it.each(AI_FACING_MODULES)("%s never references candidate_pii", (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), "utf-8");
    expect(source).not.toMatch(/candidate_pii/i);
  });

  it("pipeline.ts scores from cv_content only, not candidate_pii", () => {
    const source = readFileSync(join(__dirname, "../pipeline.ts"), "utf-8");
    expect(source).not.toMatch(/candidate_pii/i);
  });
});
