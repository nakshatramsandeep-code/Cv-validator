import type { Role, Tier } from "./types";

export const PATTERN_WEIGHT = 0.6;
export const ROLE_WEIGHT = 0.4;

export const TIER_INTERVIEW_MIN = 75;
export const TIER_REVIEW_MIN = 60;

/** criterion weight is 0-100 (percent); score is 0-4. Returns a 0-100 scale. */
export function weightedLayerScore(items: { weight: number; score: number }[]): number {
  const total = items.reduce((sum, i) => sum + i.weight * (i.score / 4), 0);
  return Math.round(total * 10) / 10;
}

export function computeComposite(patternScore: number, roleScore: number): number {
  const composite = PATTERN_WEIGHT * patternScore + ROLE_WEIGHT * roleScore;
  return Math.round(composite * 10) / 10;
}

export function tierForComposite(composite: number): Tier {
  if (composite >= TIER_INTERVIEW_MIN) return "INTERVIEW";
  if (composite >= TIER_REVIEW_MIN) return "REVIEW";
  return "PASS";
}

/** Rank tiers for comparison: INTERVIEW > REVIEW > PASS. */
const TIER_RANK: Record<Tier, number> = { INTERVIEW: 2, REVIEW: 1, PASS: 0 };
export function tierAtLeast(tier: Tier, floor: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[floor];
}

export interface CompositeResult {
  compositePm: number;
  tierPm: Tier;
  compositeSpm: number;
  tierSpm: Tier;
  recommendedRole: Role;
  bestComposite: number;
  finalTier: Tier;
  /** True only when the candidate applied to a specific role that differs from the recommendation. */
  rerouteSuggested: boolean;
}

export function computeCompositeResult(params: {
  patternScore: number;
  roleScorePm: number;
  roleScoreSpm: number;
  appliedRole: Role | null;
}): CompositeResult {
  const compositePm = computeComposite(params.patternScore, params.roleScorePm);
  const compositeSpm = computeComposite(params.patternScore, params.roleScoreSpm);
  const tierPm = tierForComposite(compositePm);
  const tierSpm = tierForComposite(compositeSpm);

  const recommendedRole: Role = compositeSpm > compositePm ? "SPM" : "PM";
  const bestComposite = Math.max(compositePm, compositeSpm);
  const finalTier = recommendedRole === "PM" ? tierPm : tierSpm;

  const rerouteSuggested =
    params.appliedRole !== null && params.appliedRole !== recommendedRole;

  return {
    compositePm,
    tierPm,
    compositeSpm,
    tierSpm,
    recommendedRole,
    bestComposite,
    finalTier,
    rerouteSuggested,
  };
}
