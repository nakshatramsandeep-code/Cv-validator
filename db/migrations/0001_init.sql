-- 0001_init.sql
-- Initial schema for Kargo Hiring dashboard.
-- Applied directly via Neon MCP against project crimson-dew-16026559, branch `production`.
-- This file is kept for version control; do not re-run it against an already-initialized branch.

CREATE TYPE role_type AS ENUM ('PM', 'SPM');
CREATE TYPE candidate_status AS ENUM ('processing', 'scored', 'error');
CREATE TYPE email_type AS ENUM ('invite', 'rejection');
CREATE TYPE email_status AS ENUM ('draft', 'sent', 'failed');

CREATE TABLE rubric_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role role_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  weight INT NOT NULL,
  sort_order INT NOT NULL
);

CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_role role_type NOT NULL,
  original_filename TEXT NOT NULL,
  status candidate_status NOT NULL DEFAULT 'processing',
  error_message TEXT,
  cv_content TEXT,
  pii_redaction_report JSONB
);

CREATE TABLE candidate_pii (
  candidate_id UUID PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT
);

CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  role role_type NOT NULL,
  criterion_id UUID NOT NULL REFERENCES rubric_criteria(id),
  score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
  reason TEXT NOT NULL,
  points NUMERIC NOT NULL,
  UNIQUE (candidate_id, role, criterion_id)
);

CREATE VIEW candidate_role_totals AS
SELECT candidate_id, role, SUM(points) AS total_points
FROM scores
GROUP BY candidate_id, role;

CREATE TABLE briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  role role_type NOT NULL,
  brief_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, role)
);

-- One active draft per candidate. `type` flips between invite/rejection as rank
-- changes; a sent draft (status='sent') must never be regenerated or overwritten.
CREATE TABLE email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  type email_type NOT NULL,
  subject TEXT NOT NULL,
  body_template TEXT NOT NULL,
  edited_body TEXT,
  status email_status NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  resend_message_id TEXT,
  sent_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('shortlist_size', '5');

-- Rubric criteria, seeded from rubric.txt (derived from past-hire patterns, not the JDs).
INSERT INTO rubric_criteria (role, name, description, weight, sort_order) VALUES
('PM', 'Ground-Floor Operations Exposure',
 'Has personally done operational work inside a freight, logistics, port, customs, 3PL or similarly operations-heavy business, e.g. handled shipment documentation, coordinated carriers or CHAs, managed exceptions, or worked a shift alongside ops teams. The CV names concrete artefacts or events (B/L, DO release, customs hold, carrier allocation, shipment volumes). Strong = 1+ year doing this work themselves. Weak = only built for, sold to, or "worked with" logistics clients from a desk/SaaS seat, or no operations exposure at all.',
 30, 1),
('PM', 'Self-Started Fix, Adopted by Others',
 'At least one instance where they noticed a problem nobody asked them to solve, built a working fix themselves (spreadsheet, prototype, process, dashboard, checklist), and other people, ideally frontline users outside their own team, adopted it. The CV states who adopted it and how fast, or that it became the standard. Weak = improvements were assigned roadmap items, or were artefacts for their own function only (e.g. a PRD template for PMs), or there is no evidence anyone else used what they built.',
 30, 2),
('PM', 'Owns Failures and Reversals',
 'The CV describes something that went wrong or a call they reversed, and what they did about it: killed a feature on data, ran a post-mortem on a lost deal or outage they owned, changed course after discovery contradicted the plan. The candidate names the failure and the resulting change in practice. Weak = CV lists only wins, metrics and launches; no sign they have made a call that turned out wrong or taken responsibility for one.',
 20, 3),
('PM', 'Operates Without a Safety Net',
 'Evidence they carried outcomes with no layer above or around them catching mistakes: sole owner of an area, handled a crisis personally and in real time, worked directly with end users/ops without an intermediary, covered extra load without escalation. For PM, owning a defined product area (or equivalent in their prior function) end to end is strong. Weak = always one of many in a large team, decisions routed through managers/committees, impact described as "supported" or "contributed to".',
 20, 4),
('SPM', 'Ground-Floor Operations Exposure',
 'Same as PM, AND the candidate has used that operational knowledge to shape a product or system decision, e.g. translated field realities directly into specs, integration design or data standards. Strong = hands-on ops experience plus a named product/system call it informed. Weak = domain knowledge only from selling to or reading about the industry.',
 25, 1),
('SPM', 'Self-Started Fix, Adopted by Others',
 'Same as PM, but at a larger scale. The self-initiated fix spread beyond their own team (other branches, regions, the whole company or customers) and became permanent practice or a core product feature (e.g. a weekend prototype that became a platform feature). Strong = 2+ instances, or one instance adopted org-wide. Weak = a single local improvement, or only assigned work.',
 25, 2),
('SPM', 'Owns Failures and Reversals',
 'Same as PM, plus the lesson changed how OTHER people work: the post-mortem became standard practice, or the kill decision reset the team''s roadmap. Evidence they have made consequential calls that others had to live with, and publicly owned the ones that went wrong. Weak = no failures named, or failures blamed on others/circumstances.',
 20, 3),
('SPM', 'Operates Without a Safety Net',
 'The highest bar for SPM. Has been the most senior person in their function (sole PM, first PM, independent consultant, no manager layer between them and the founder/CEO/customer) and made architectural or strategic calls without a committee approving them. The CV shows those calls stuck, e.g. an engineering lead or client trusted them without escalation. Strong = 2+ years operating this way. Weak = decisions always sat with a senior PM/Head above them.',
 30, 4);
