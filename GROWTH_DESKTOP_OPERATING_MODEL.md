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

## Growth Plan / Blueprint source and editing rules

- The Chapter-configured MSB planning year controls which member-submitted Blueprint is shown (currently 2027 for the installed Chapter). The legacy Growth target remains a separately labelled baseline for the current reporting year. Never substitute a future Blueprint goal into current-year progress.
- `members.received_thb` is the latest Monthly Sync value, falling back to the legacy Growth snapshot where no linked member exists. This field has no verified reporting-year attribution. UI labels it as latest actual, marks target comparisons approximate, and must not describe it as a confirmed annual result.
- The member owns their Blueprint submission. Growth can review it or request a revision, but must not silently edit member answers. The legacy Growth editor permits only nickname, note and legacy target. Membership age, actual received and calculated progress are read-only in that editor.
- The API derives Chapter scope from authentication for reads and writes, checks capabilities on writes, and records review/edit audit events without copying private notes into audit metadata. Blueprint categories and business details follow active member sharing/consent; absent or revoked consent fails closed.
- Commercial-readiness debt: Growth Plan still uses the imported legacy group sheet and its target as a baseline. Before calling the comparison an annual KPI, add a period-attributed actual revenue source and migrate the remaining sheet workflow to member-keyed records with verified Chapter ownership.

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
