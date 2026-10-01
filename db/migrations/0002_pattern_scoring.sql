-- 0002_pattern_scoring.sql
-- Replaces the flat per-role rubric with a two-layer model matching the
-- teammate's (Shreyas's) deployed design at kargo-hiring-two.vercel.app:
--   Layer "pattern" (shared across roles, 60% of composite): 4 criteria
--   Layer "role_pm" / "role_spm" (role-specific, 40% of composite)
-- Scores are 0-4 with a confidence level, instead of the old 1-5 scale.
-- Composite = 0.6*pattern_score + 0.4*role_score; tiers are fixed thresholds
-- (INTERVIEW >=75, REVIEW 50-75, PASS <50), not a top-N shortlist, so
-- settings.shortlist_size is no longer used by scoring (left in place,
-- harmless).
--
-- This drops and recreates `scores` and `rubric_criteria` because the shape
-- changed fundamentally (scale, layering) and only test fixtures exist so
-- far. Run directly against Neon via the MCP connector, as with 0001.

DROP VIEW IF EXISTS candidate_role_totals;
DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS rubric_criteria;

ALTER TABLE candidates ALTER COLUMN applied_role DROP NOT NULL;

CREATE TYPE criterion_layer AS ENUM ('pattern', 'role_pm', 'role_spm');
CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');
CREATE TYPE tier_level AS ENUM ('INTERVIEW', 'REVIEW', 'PASS');
CREATE TYPE decision_state AS ENUM ('pending', 'advance', 'reject');

CREATE TABLE rubric_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer criterion_layer NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  weight INT NOT NULL,
  sort_order INT NOT NULL
);

CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  layer criterion_layer NOT NULL,
  criterion_id UUID NOT NULL REFERENCES rubric_criteria(id),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 4),
  confidence confidence_level NOT NULL,
  evidence TEXT NOT NULL,
  UNIQUE (candidate_id, layer, criterion_id)
);

-- Per-candidate rollup: composite scores, tiers, recommendation, guardrail
-- outcome. Computed deterministically in code from `scores`, never by the
-- model itself, so arithmetic can't drift.
CREATE TABLE candidate_scoring (
  candidate_id UUID PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  pattern_score NUMERIC NOT NULL,
  role_score_pm NUMERIC NOT NULL,
  composite_pm NUMERIC NOT NULL,
  tier_pm tier_level NOT NULL,
  role_score_spm NUMERIC NOT NULL,
  composite_spm NUMERIC NOT NULL,
  tier_spm tier_level NOT NULL,
  recommended_role role_type NOT NULL,
  reroute_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  best_composite NUMERIC NOT NULL,
  final_tier tier_level NOT NULL,
  potential_flag BOOLEAN NOT NULL DEFAULT FALSE,
  potential_reason TEXT,
  guardrail_notes TEXT,
  tier_changed BOOLEAN NOT NULL DEFAULT FALSE,
  why_ranked_here TEXT,
  probes JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One structured brief per candidate (not per role): Summary / Strengths /
-- Risks & gaps to probe / Probe questions / Suggested focus areas, as markdown.
DROP TABLE IF EXISTS briefs;
CREATE TABLE briefs (
  candidate_id UUID PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  brief_markdown TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Human shortlist decision, separate from email send status.
CREATE TABLE decisions (
  candidate_id UUID PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  decision decision_state NOT NULL DEFAULT 'pending',
  note TEXT,
  decided_at TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rubric: pattern layer (shared, 60% of composite)
INSERT INTO rubric_criteria (layer, code, name, description, weight, sort_order) VALUES
('pattern', 'P1', 'Ground-level operations exposure',
 'Has personally done hands-on operational work inside a freight, logistics, port, customs, 3PL or similarly operations-heavy business (not sold to or built for one from a desk). The CV names concrete artefacts: berth/vessel scheduling, container handling, B/L or customs documentation, carrier allocation, shipment volumes, CHA coordination. Score high only when this is the candidate''s own daily work, not something they observed or managed remotely.',
 40, 1),
('pattern', 'P2', 'Built unasked, adopted by peers',
 'At least one instance where the candidate noticed a problem nobody assigned them, built a working fix themselves (tracker, checklist, process, prototype), and other people adopted it without being told to. The CV states who adopted it and how fast, or that it became the standard. Weak: the improvement was an assigned roadmap item, or no one else is shown to have used it.',
 25, 2),
('pattern', 'P3', 'Ownership without a layer',
 'Evidence the candidate operated as the most senior or only person in their function for a meaningful stretch: sole PM, no manager above them in the product function, independent consultant, or equivalent in their prior role. The CV shows them making calls that stuck, not routed through a manager or committee. Weak: always one of several, decisions routed upward, impact described as "supported" or "contributed to".',
 20, 3),
('pattern', 'P4', 'Holds under operational pressure',
 'The candidate handled a live operational incident, crisis, or sustained high-pressure period personally and in real time, without escalating it away: an outage, a customs hold, an emergency cargo release, a peak-season surge. The CV describes what they did in the moment, not just that something stressful happened. Weak: pressure is implied but the candidate''s specific actions during it are not described.',
 15, 4);

-- Rubric: PM role-fit layer (40% of composite)
INSERT INTO rubric_criteria (layer, code, name, description, weight, sort_order) VALUES
('role_pm', 'PM1', 'Ships in short cycles, unprompted adoption',
 'Evidence of shipping product changes in short cycles (weeks, not quarters) that customers used without being asked to try them. The CV cites a specific feature and a sign that people actually used it (adoption, conversion, retention), not just that it shipped.',
 30, 1),
('role_pm', 'PM2', 'Shipped, killed, learned',
 'The candidate shipped something, later killed or reversed it based on evidence (usage data, customer feedback), and named what they learned or did differently after. Weak: only launches are listed, nothing was ever killed or reconsidered.',
 25, 2),
('role_pm', 'PM3', 'Discovery inside customer workflows',
 'The candidate did direct discovery inside customers'' real workflows (on-site, embedded, shadowing operations) rather than via surveys or secondhand requirements, and a product decision changed as a direct result. The CV should connect a specific discovery activity to a specific resulting decision.',
 25, 3),
('role_pm', 'PM4', 'Built PM rhythms from zero',
 'Evidence the candidate established the basic practices a PM function runs on (prioritisation framework, sprint cadence, PRD template, decision log) where none existed before, rather than inheriting them. Weak: the candidate operated inside practices someone else had already built.',
 20, 4);

-- Rubric: SPM role-fit layer (40% of composite)
INSERT INTO rubric_criteria (layer, code, name, description, weight, sort_order) VALUES
('role_spm', 'SPM1', 'Integration / platform / data-layer ownership',
 'The candidate owned a technical integration, platform, or data-layer decision directly (which systems to connect, what to build vs. configure), grounded in specifics (named systems, APIs, data formats), not just "worked with engineering".',
 30, 1),
('role_spm', 'SPM2', 'Owned an area with no senior PM above',
 'The candidate was the most senior product person in their area for a meaningful period, with no senior PM or Head of Product making the final call above them, and made architectural or strategic calls that stuck.',
 25, 2),
('role_spm', 'SPM3', 'Integrations tied to revenue; cross-functional',
 'A specific integration or technical decision the candidate owned is tied to a measurable business outcome (new customer segment unlocked, deal unblocked, revenue or conversion impact), and involved working across sales, engineering and/or customer-facing teams.',
 20, 3),
('role_spm', 'SPM4', 'Early-stage / unwritten rules; shaped practice',
 'Evidence of operating where the rules were not yet written (early-stage company, new function, ambiguous mandate) and having shaped how the function or team works as a result, not just adapted to existing process.',
 15, 4),
('role_spm', 'SPM5', 'Reliability and data-quality standards',
 'The candidate set or enforced concrete reliability, data-quality, or SLA standards for a system others depended on (uptime, data freshness, incident response), with specifics on what the standard was and how it was enforced. Weak: reliability is mentioned in passing with no concrete standard or enforcement named.',
 10, 5);
