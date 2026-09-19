# Growth Desktop Operating Model

## Purpose

Growth Desktop is the Chapter planning and follow-up workspace. It turns trusted member, Referral and Member Success Blueprint (MSB) data into owned work. Growth Mobile remains the field workflow for opening one member, having a useful conversation and recording the next action.

## Chapter Growth Health

The landing page shows one decision context at a time:

1. **งานวันนี้** — priorities and open work that should be handled first.
2. **สุขภาพ Chapter** — goals, health score and Chapter-level KPIs.
3. **โอกาสจาก MSB** — explainable Chapter and connection opportunities.
4. **Referral Balance** — give/receive balance and members needing support.
5. **แนวโน้มและรายงาน** — score trend and the weekly snapshot.

MSB shortcuts open the exact Blueprint workspace needed for the decision: Support Radar, Data Quality, Pair Matching or annual goal comparison. The UI must not duplicate these tools inside Growth Health.

## Blueprint Intelligence

Blueprint tools are separate views, with `Chapter Blueprint Table` as the default. Only one workflow is visible at a time. Data is member-provided or sourced from named operational records; the UI must not present inferred values as facts.

## Growth Mobile onboarding

The active Growth term supports one Lead and up to two Co-Leads. Chapter Admin must:

1. Save the Growth Team assignment.
2. Confirm each member is linked to LINE.
3. Open `ตั้งค่า Email / PIN` for each saved team member.
4. Review the one-time invitation before sending it through LINE.
5. Confirm the readiness state becomes `พร้อมใช้งาน`.

Readiness states are `ยังไม่ได้ตั้งค่า`, `รอยืนยัน`, and `พร้อมใช้งาน`. Access lookup, invitation delivery and cancellation are scoped from the authenticated Chapter on the server. A claimed invitation stores the Chapter derived from the invited member, never from a browser-supplied Chapter ID.

## Design rules

- Keep Desktop and Mobile separate, but share the same member and action sources of truth.
- Show one decision context at a time and provide a direct next action.
- Preserve loading, empty, error, pending and ready states.
- Use existing design tokens and 44px mobile touch targets.
- Do not expose private Mentor notes or hidden member data to Growth.
