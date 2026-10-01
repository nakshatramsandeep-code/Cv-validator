import { describe, expect, it } from "vitest";
import { computeCompositeResult, tierForComposite } from "../scoring";

// Regression fixtures: real (pattern, role_pm, role_spm) -> (composite, tier)
// tuples observed from a reference implementation of this same scoring model.
const CASES = [
  { pattern: 92.5, rolePm: 77.5, roleSpm: 78.8, cpm: 86.5, cspm: 87, tpm: "INTERVIEW", tspm: "INTERVIEW" },
  { pattern: 85, rolePm: 81.3, roleSpm: 88.8, cpm: 83.5, cspm: 86.5, tpm: "INTERVIEW", tspm: "INTERVIEW" },
  { pattern: 86.3, rolePm: 76.3, roleSpm: 53.8, cpm: 82.3, cspm: 73.3, tpm: "INTERVIEW", tspm: "REVIEW" },
  { pattern: 58.8, rolePm: 80, roleSpm: 48.8, cpm: 67.3, cspm: 54.8, tpm: "REVIEW", tspm: "PASS" },
  { pattern: 38.8, rolePm: 63.8, roleSpm: 28.8, cpm: 48.8, cspm: 34.8, tpm: "PASS", tspm: "PASS" },
] as const;

describe("computeCompositeResult", () => {
  it.each(CASES)(
    "matches the reference composite/tier for pattern=%s",
    ({ pattern, rolePm, roleSpm, cpm, cspm, tpm, tspm }) => {
      const result = computeCompositeResult({
        patternScore: pattern,
        roleScorePm: rolePm,
        roleScoreSpm: roleSpm,
        appliedRole: null,
      });
      expect(result.compositePm).toBeCloseTo(cpm, 1);
      expect(result.compositeSpm).toBeCloseTo(cspm, 1);
      expect(result.tierPm).toBe(tpm);
      expect(result.tierSpm).toBe(tspm);
    }
  );

  it("recommends the role with the higher composite and flags a reroute when applied differs", () => {
    // Applied SPM, but PM composite (79) beats SPM composite (65.5) -> recommend PM, reroute=true
    const result = computeCompositeResult({
      patternScore: 70,
      roleScorePm: 92.5,
      roleScoreSpm: 58.8,
      appliedRole: "SPM",
    });
    expect(result.recommendedRole).toBe("PM");
    expect(result.rerouteSuggested).toBe(true);
    expect(result.finalTier).toBe(result.tierPm);
    expect(result.bestComposite).toBeCloseTo(result.compositePm, 1);
  });

  it("never suggests a reroute when the applied role is unspecified", () => {
    const result = computeCompositeResult({
      patternScore: 50,
      roleScorePm: 40,
      roleScoreSpm: 87.5,
      appliedRole: null,
    });
    expect(result.recommendedRole).toBe("SPM");
    expect(result.rerouteSuggested).toBe(false);
  });

  it("never suggests a reroute when applied already matches the recommendation", () => {
    const result = computeCompositeResult({
      patternScore: 86.3,
      roleScorePm: 76.3,
      roleScoreSpm: 53.8,
      appliedRole: "PM",
    });
    expect(result.recommendedRole).toBe("PM");
    expect(result.rerouteSuggested).toBe(false);
  });
});

describe("tierForComposite", () => {
  it("applies the exact boundary thresholds", () => {
    expect(tierForComposite(75)).toBe("INTERVIEW");
    expect(tierForComposite(74.9)).toBe("REVIEW");
    expect(tierForComposite(60)).toBe("REVIEW");
    expect(tierForComposite(59.9)).toBe("PASS");
  });
});
