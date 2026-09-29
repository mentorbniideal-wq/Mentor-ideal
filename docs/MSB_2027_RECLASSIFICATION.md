# MSB 2027 intake correction (2026-09-29)

The early member-facing MSB form labelled 2026 and the later form labelled
2027 both collect the 2027 plan. The 2026 Growth target imported from Excel is
stored separately in `member_annual_growth_goals` and is never a member form.

Read-only Production preflight (BNI IDEAL, active members): 58 members; 5 had
only a submitted 2026 form, 33 only a submitted 2027 form, 6 submitted both,
and 14 had neither. All 6 overlapping 2027 records were updated later; 3 had
different BNI goals, 2 different total targets, and all 6 different free text.

Migration `20260929000003` reclassifies only the 5 non-conflicting 2026 rows to
2027, marking their `source` as `member_form_2026_reclassified`. For the 6
overlaps it retains both originals, marks the 2026 row
`member_form_2026_superseded`, and treats the newer 2027 row as canonical. No
member-authored field, consent, or historical Growth target is overwritten.
The migration is limited to the existing `bni-ideal` Chapter and is idempotent.
The server uses provenance markers to avoid applying this exception to future
Chapters. PDF defaults to the 2027 form and offers separate 2026 Growth-baseline
and comparison exports; 2026 is never labelled as an unsubmitted form.

Verify after applying: 2027 submitted form count should be 44, reclassified
source count 5, superseded source count 6, and active members with neither
form count 14. Verify individual 2027 form totals/text were unchanged for all
six overlapping records, and the imported Growth 2026 baseline is unchanged.

Rollback is not automatic. The 5 reclassified IDs are recoverable from their
source marker; their `blueprint_year` and `source` can be restored to 2026 in a
transaction after checking no new 2027 form was created for those members.
The 6 superseded rows can have their source restored to `member_form`; no row
is deleted. Do not roll back after members have edited a reclassified 2027
form without a per-member review.
