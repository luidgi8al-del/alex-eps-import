# Bac EPS AFL1 — 15 October 2026

Nine additional interactive school-reference grids: volley-ball, badminton,
tennis de table, acrosport, gymnastique, pentabond, sauvetage, course en durée,
musculation. Existing 3×500 and climbing AFL1 tools remain separate and intact.

## Source and scoring decisions

`scripts/build-bac-grids.py` extracts the complete degree descriptions from the
local Word documents. Table alignment and numerical values were checked against
their PDF counterparts. It generates the same versioned JSON for web and Android.
Do not substitute national generic rubrics for these school rubrics.

Teacher-confirmed clarifications, 15 October 2026:

- Volley collective criterion, degree 3 upper bound: 3.5.
- Badminton tactical criterion, degree 4, more wins: 4.
- Acrosport individual: degree score × sum of four difficulty weights, then
  subtract 0.5 per missing requirement; clamp to 0–8.

Specific workflows:

- Volley: slider score multiplied by the degree-specific match coefficient.
  The source remains labelled as the school's 2023 proposal.
- Badminton: select the match outcome within the chosen degree.
- Table tennis: judge positions the slider using the proportion of wins. No
  undocumented interpolation formula is applied.
- Gymnastics: difficulty coefficient for execution only; optional integer
  rounding is explicit, never silently enabled.
- Pentabond: choose an exact line of the girls/boys performance or gap table.
  The printed 3.2, 4.2 and 5.2 values are preserved. Actual measurements can be
  recorded in observations; no interpolation between source rows is invented.
- Rescue swimming: choose the explicit course/time-tier/obstacle or towing
  combination. Timing thresholds and 5-second penalty rule are shown in the
  degree information. The judge selects the appropriate row, not an inferred
  time interpolation.
- Endurance running and strength training: source-specific slider ranges.

Only AFL1 /12 is exported, not a complete Bac /20 mark. Empty criteria remain
incomplete, whereas genuine zero scores are preserved. Group changes do not
copy, alter or delete individual grades.

## Verification

- 76 Node regression test files passed.
- 290 scoring combinations, boundary/empty/zero checks and identical source
  assets: `bac-grids-model.test.cjs`.
- All nine UIs at 1280, 390 and 320 px: full descriptions, individual grading,
  pupil isolation, save, reopen from class, export data and horizontal overflow.
- Group creation and cancelled edit retain notes.
- Real service-worker offline test: nine works created offline, reload preserves
  descriptions, notes and groups; reconnect delivers nine queued writes to a
  simulated Supabase endpoint. No real pupil records were changed.
- Android compilation and 352 unit tests passed, including all rubric choices
  and portable round trips with different device-local pupil IDs.
- Existing climbing AFL1 / 3×500 browser regression also passed.

No Android phone was available for a physical-device UI or live two-device
Supabase test. Android controls reuse the navigation-bar-safe SavedWorkBar.
This is not a claim that those physical/live checks have been performed.
