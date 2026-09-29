import type { Role } from "./types";

// Used only as background context for interview briefs and email drafts.
// Never used for scoring — scoring reads exclusively from rubric_criteria.

export const PM_JD = `Kargo · Mumbai · Series A
Product Manager
Full-time · In-office, Mumbai · Reports to: Arjun Mehta, Founder

About Kargo
Kargo builds software for mid-sized freight forwarders and 3PLs — the companies that move goods across borders and between ports, warehouses, and buyers. Our platform automates the parts of their operation that still run on spreadsheets and WhatsApp chains: shipment tracking, documentation, and carrier coordination. We are Series A, 40 people, and scaling to 70 by December.

Why This Role Exists
We have one product, a growing customer base, and no dedicated PM function yet. The person in this role will be the first PM at Kargo focused on our core platform — the day-to-day tool that operations teams at freight forwarders live inside. There is a lot to build, and a lot to understand about how our customers actually work. Both are connected.

What You'll Own
- The product roadmap for Kargo's core operations platform: shipment tracking, documentation workflows, and real-time status visibility for freight forwarders and their customers
- Customer discovery — understanding where the platform is helping and where it isn't, from the people who use it daily
- Working directly with the engineering team to define what gets built, in what order, and why
- The rhythms a PM function needs: how we decide what to prioritise, how we track whether something worked, how decisions are communicated across the team

What Success Looks Like at 6 Months
- You have shipped at least two features that customers use without being asked to — not because we asked, because they found them useful
- You can tell Arjun, without hesitation, what the three most important things to build next are and why
- The engineering team knows what they are building three sprints out
- You have spent time inside freight forwarding operations — not just over calls, but in the rooms where the work actually happens

What We're Looking For
- 2-4 years of product management experience, ideally at a company building for the first time rather than maintaining what already exists
- Comfort operating without structure — no PM handbook, no design system, no sprint template. You'll build those
- Evidence that you've shipped things, killed things, and learned from both — preferably in short cycles
- Genuine curiosity about how operations work at ground level. What does a freight forwarder's morning actually look like? What breaks? What slows them down?
- Mumbai-based or willing to relocate. This role is in-office

What Kargo Offers
- Real ownership, early. You will be the PM — not one of ten
- Direct access to the founding team and to customers
- A product with genuine complexity and users who depend on it for their daily operations
- The experience of building a product function from scratch, not joining one that already exists`;

export const SPM_JD = `Kargo · Mumbai · Series A
Senior Product Manager
Full-time · In-office, Mumbai · Reports to: Arjun Mehta, Founder

About Kargo
Kargo builds software for mid-sized freight forwarders and 3PLs — the companies that move goods across borders and between ports, warehouses, and buyers. Our platform automates shipment tracking, documentation, and carrier coordination. We are Series A, 40 people, and scaling to 70 by December.

Why This Role Exists
As we scale, Kargo's product is becoming more complex. More carrier integrations. More customer-specific configurations. More data flowing between Kargo and the systems our customers already use. We need someone who can own the harder parts of the platform: the decisions that have consequences we will feel two years from now, not just in the next sprint. This person will also be the most senior PM at Kargo, which means they will help shape what the product function looks like as we grow.

What You'll Own
- The integration and data layer of Kargo's platform: how we connect with carrier systems, port portals, ERP environments, and the freight management tools our customers already operate
- The hard architectural product calls — what we build, what we configure, what we stay away from
- Reliability and data quality standards that freight forwarders can stake their operations on
- Working across sales, engineering, and customer operations to understand which integrations unlock new customers and which gaps are losing them
- Helping define the practices, decision frameworks, and ways of working the PM function will run on as Kargo grows

What Success Looks Like at 6 Months
- You own an integration roadmap that engineering, sales, and Arjun all agree on and trust — and that has not changed three times in six weeks
- At least one major integration has shipped that opened a new customer segment or unblocked a stalled deal
- You have a clear, defensible point of view on what Kargo should build versus configure versus not touch — and the team knows what it is
- The product function has clearer standards for what good PM work looks like, because you have demonstrated it

What We're Looking For
- 5-8 years of product management experience, with clear evidence of owning a product area without a layer of senior PMs above you making the calls
- Experience with platform products, integration layers, or products that have to work inside complex existing technical environments
- Proven ability to make calls in ambiguous situations and live with the consequences — at Kargo there is no committee that approves product decisions
- Time spent at an early-stage company, or strong evidence that you have operated in environments where the rules were not written yet
- Familiarity with how operations-heavy industries work at ground level — logistics, supply chain, or adjacent domains — is a genuine advantage here, not a nice-to-have
- Mumbai-based or willing to relocate. This role is in-office

What Kargo Offers
- A role that could become Head of Product as we scale. We are not offering a title — we are offering the actual work
- Direct access to Arjun and the founding team
- A product with real complexity, real customers, and real operational stakes
- The chance to build a PM function rather than join one`;

export function jobDescriptionFor(role: Role): string {
  return role === "PM" ? PM_JD : SPM_JD;
}
