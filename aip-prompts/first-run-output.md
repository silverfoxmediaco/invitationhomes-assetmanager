# First preview run — Claude Opus 4.8, 16.8s

Run against `sample-snapshot.json`. Transcribed from the AIP Logic debugger.

1. **Reprice under-market renewals across the portfolio**
   1,281 homes sit below market, a $112,740/month gap ($1,352,880/year), while
   renewals rose only 4.6% vs 3.1% market growth. The gap closable at renewal.
   impact $1,352,880 · basis "underMarketAnnual from snapshot" · medium ·
   renewal cycle · action null

2. **Prioritize Arcilla Ridge repricing (79% under market)**
   Arcilla Ridge has 79% of 55 comped homes below market with a $3,870/month
   gap, the highest under-market share in the worstGaps list.
   impact $46,440 · basis "gapPerMonth 3870 x 12" · medium · renewal cycle ·
   target community/arcilla-ridge

3. **Appeal Bexar County assessment at Silos**
   Silos is the dearest community at $26,253/home, with tax of $8,308/home —
   the highest tax burden shown — and tax is 50% of the cost spread.
   Assessments are appealable.
   impact "" · basis "Not quantifiable without assessment detail" · low ·
   annual · **action file-tax-appeal** · target county/Bexar

4. **Pursue 90+ arrears settlements on flagged residents**
   $1,271,127 of $1,673,783 arrears is 90+ days aged, and 47% of arrears is
   held by 165 flagged leases. Older buckets rarely collect in full.
   impact $1,271,127 · basis "ageing 90+ from snapshot" · medium · 90 days ·
   **action waive-rent-payment**

5. **Charge back resident-responsibility filter visits**
   1,080 filter visits were billed; under the responsibility split and Lease
   Easy bundle, air filters are the resident's cost and should not sit in
   landlord maintenance ($9,453,381/12m).
   impact "" · basis "filterVisitsBilled 1080 cited" ·
   **action charge-to-resident**

## Rule 1 audit — did it invent anything?

Every figure traced back to the snapshot:

1,281 / $112,740 / $1,352,880 / 4.6% / 3.1% / 79% / 55 homes / $3,870 /
$26,253 / $8,308 / 50% / $1,271,127 / $1,673,783 / 47% / 165 / 1,080 /
$9,453,381 — all present in the input.

The single piece of arithmetic, $46,440, is declared as "gapPerMonth 3870 x 12".

**Zero hallucinated figures.**

Better than that: suggestions 3 and 5 returned `impact: ""` with a stated
reason rather than inventing a number, and 3 dropped its own confidence to
"low" off the back of it. Refusing to quantify is the behaviour that makes the
rest of the panel worth believing.

Actions attached correctly on three of five, each to the right object kind —
file-tax-appeal to a county, waive-rent-payment to arrears, charge-to-resident
to filter visits.

## What to tune next

Suggestions 1 and 4 set `impact` to the FULL exposure — $1,352,880 of gap and
$1,271,127 of 90+ arrears. Both are real snapshot figures and the basis is
stated, so nothing is invented, but a reader skims that as recoverable and
neither is: you do not close every gap at renewal, and you do not collect all
of 90+ aged arrears.

Prompt fix, not a model fix. Add to rule 1: state whether an impact is gross
exposure or a realistic recovery, and prefer the latter where the snapshot
supports estimating it.
