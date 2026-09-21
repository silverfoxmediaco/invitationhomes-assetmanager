# Ontology spec — Invitation Homes property operations

Draft 1, 2026-09-21. Scope: the **communities portfolio only** (76 real
communities), 3 years of history, ~3,000 synthesized properties.

Everything below the Community line is generated. The 76 communities, their
markets, cities, states, starting rents, bed ranges and feature lists are real
and scraped; see `data/reference/`.

## The chain this exists to serve

```
Community → Property → Lease → RentPayment
                   ↘ MaintenanceWorkOrder → Vendor
                   ↘ Expense
                   ↘ TaxAssessment → TaxBill
         Lease → Resident (many leases per resident)
         City + beds + month → MarketRateComp
```

Two questions the chain must answer that no single object can:

1. **Which homes are under market, and is it pricing or cost?**
   `Lease.monthlyRent` against `MarketRateComp` for that property's city, bed
   count and month, set against that property's maintenance, expense and tax
   load.
2. **Which residents are at risk, and what is exposed?**
   `Resident` payment history across *all* their leases, not just the current
   one, joined back to the property and its rent.

Ambiguous modelling decisions get resolved in favour of keeping those
traversable.

## Objects

Synced to `data/generated/` on 2026-09-21. Row counts and column lists below are
what the generator ACTUALLY produces, not estimates. Re-sync after any generator
change: the spec is what object types get built from, so drift here becomes
drift in the ontology.

| CSV | Object type | Rows |
|---|---|---|
| `communities.csv` | Community | 76 |
| `counties.csv` | County | 43 |
| `properties.csv` | Property | 2,997 |
| `residents.csv` | Resident | 5,646 |
| `leases.csv` | Lease | 8,375 |
| `rent_payments.csv` | RentPayment | 95,467 |
| `vendors.csv` | Vendor | 92 |
| `maintenance_work_orders.csv` | MaintenanceWorkOrder | 26,477 |
| `expenses.csv` | Expense | 81,548 |
| `tax_assessments.csv` | TaxAssessment | 8,991 |
| `tax_bills.csv` | TaxBill | 8,991 |
| `market_rate_comps.csv` | MarketRateComp | 4,212 |

### Reference / location

**Community** — 76 rows, REAL apart from `propertyCount`.
`slug` (pk), `communityName`, `market`, `city`, `state`, `county`, `countyId`,
`zip`, `startingRent`, `rentAnchor`, `bedsMin`, `bedsMax`, `featureCount`,
`features`, `propertyCount`.

`rentAnchor` is `scraped` (73) or `estimated` (3). Three communities publish no
starting rent; theirs falls back to the market median. Never treat an
`estimated` rent as an observation.

**County** — 43 rows.
`countyId` (pk), `countyName`, `state`, `millRate`, `assessmentDrift`,
`reassessmentCycle`, `appealWindowDays`.

`reassessmentCycle` is `annual`, `biennial`, `quadrennial`, `octennial` or
`capped-prop13`, set by STATE regime. California caps assessment growth at 2%
until a sale resets it; Texas reassesses annually and hard. County matters
because tax is assessed and appealed there — Hillsborough and Pasco are both
"tampa".

### Portfolio

**Property** — 2,997 rows, SYNTHETIC.
`propertyId` (pk), `communitySlug`, `streetAddress`, `city`, `state`, `zip`,
`countyId`, `beds`, `baths`, `sqft`, `yearBuilt`, `acquisitionDate`,
`acquisitionPrice`, `marketRent`, `status`, `currentLeaseId`.

`status` is `occupied`, `vacant` or `turn`. `marketRent` never falls below its
community's `startingRent`, because "starting at $X" is a floor.

### People and tenancy

**Resident** — 5,646 rows.
`residentId` (pk), `displayName`, `creditTierAtApplication`, `householdSize`,
`hasPets`, `syntheticProfileGroundTruth`.

`syntheticProfileGroundTruth` is the generator's answer key — the label used to
DECIDE who pays late, not anything derived from what a resident did. It exists
for exactly one purpose: checking whether the rules-based risk score actually
finds the degrading cohort.

**It must never be a model feature, a dashboard column, or a filter offered to a
user.** A model that sees it scores perfectly by reading the answer, which is
the circularity described under AIP below. When the object type is created in
Foundry, its description must say this, because the name alone will not stop
someone dragging it into a training set.

Residents persist ACROSS leases. This is what makes renter history real: a
renewal is a second lease for the same resident, and a resident who moves to a
different home in the portfolio keeps their payment record. A resident whose
history lives only inside one lease cannot be "at risk" in any useful sense.

**Lease** — 8,375 rows.
`leaseId` (pk), `propertyId`, `residentId`, `startDate`, `endDate`,
`termMonths`, `monthlyRent`, `deposit`, `concessionMonths`, `renewalOfLeaseId`
(self-link), `status`.

`status` is `active`, `expired`, `terminated-early` or `evicted`. There is no
`renewed` status: a renewal is a NEW lease whose `renewalOfLeaseId` points back,
which is what keeps the resident's history continuous. `termMonths` is 12, 18 or
24; 18 is deliberately rare because it shifts a start month by six and walks
summer leases into winter on every renewal.

**RentPayment** — 95,467 rows.
`paymentId` (pk), `leaseId`, `propertyId`, `residentId`, `dueDate`, `amountDue`,
`amountPaid`, `paidDate`, `daysLate`, `status`.

`status` is `paid`, `late`, `partial`, `missed` or `waived`. `propertyId` and
`residentId` are denormalised onto the payment so delinquency queries do not
have to hop through Lease on every row.

`daysLate` is the raw material for delinquency ageing. Bucketing (30/60/90+) is
computed at READ time, not stored, so thresholds can change without regenerating
95,467 rows.

### Cost

**MaintenanceWorkOrder** — 26,477 rows.
`workOrderId` (pk), `propertyId`, `category`, `responsibility`,
`chargedToResident`, `contributingNeglect`, `priority`, `isEmergency`,
`openedDate`, `closedDate`, `cost`, `vendorId`, `residentReported`.

Nineteen categories, each tagged `landlord` or `resident` from Invitation Homes'
PUBLISHED split (invitationhomes.com/resident-responsibilities):

*Landlord pays* — HVAC - not cooling, HVAC - not heating, Plumbing - leak,
Plumbing - water heater, Plumbing - major clog, Plumbing - hardware, Appliance -
garbage disposal, Appliance, Roof, Fence, Garage door, Electrical, Turn.

*Resident pays* — Lawn maintenance, Sprinkler, Pool maintenance, Pest control,
Air filter, Plumbing - minor clog.

Resident-responsibility requests are STILL RECORDED, with `chargedToResident`
true. Residents submit them, the company triages them, and the cost is charged
back. Keeping them visible is what lets a dashboard separate "what we spend"
(18,379 orders, $26.6M) from "what we handle" (8,098 orders, $2.0M).

`contributingNeglect` marks HVAC failures where the resident skipped their own
air-filter duty and the landlord paid for the result — 562 orders, $932,682.
Resident responsibility becoming landlord cost is the kind of chain an ontology
shows and a spreadsheet cannot.

**Vendor** — 92 rows.
`vendorId` (pk), `vendorName`, `category`, `market`, `avgTurnaroundDays`,
`onTimePct`.

**Expense** — 81,548 rows.
`expenseId` (pk), `propertyId`, `communitySlug`, `scope`, `category`, `date`,
`amount`, `glCode`.

`scope` is `property` (85,917... i.e. the large majority) or `community`. A
community-scope row carries NO `propertyId` — that is how common-area cost is
held, and the validator enforces both directions.

Cadence follows real billing, not a uniform loop:

| Category | Cadence | Rows | Total |
|---|---|---|---|
| CapEx | episodic | 5,959 | $39.5M |
| Turn | episodic | 5,935 | $15.3M |
| Insurance | annual | 8,643 | $14.4M |
| HOA | quarterly | 34,680 | $9.2M |
| Legal | episodic | 5,928 | $6.9M |
| Marketing | episodic | 13,377 | $5.8M |
| Common area landscaping | quarterly, community scope | 912 | $1.8M |
| Utilities | monthly, VACANCY ONLY | 6,114 | $1.2M |

**Utilities bill only while a home is vacant.** Residents pay their own; Lease
Easy sells "utility management" as a convenience, not as the landlord absorbing
the bill. Charging utilities on an occupied month invents a cost that does not
exist, and the validator now asserts every utilities row falls outside every
lease term for its property.

Total $94.0M over 3 years, $10,460 per property per year.

### Tax

**TaxAssessment** — 8,991 rows (one per property per year, 2024–2026).
`assessmentId` (pk), `propertyId`, `countyId`, `taxYear`, `assessedValue`,
`priorAssessedValue`, `changePct`, `appealStatus`, `appealSavings`.

`appealStatus` is `none`, `filed`, `won` or `lost`. Appeals only appear where
`changePct` exceeded ~9%, which is where a real owner would contest.

**TaxBill** — 8,991 rows.
`billId` (pk), `assessmentId`, `propertyId`, `countyId`, `taxYear`, `amountDue`,
`dueDate`, `paidDate`, `status`.

### Market

**MarketRateComp** — 4,212 rows (city × bed count × 36 months).
`compId` (pk), `city`, `state`, `beds`, `month` (YYYY-MM), `medianRent`,
`sampleSize`, `source` (always `synthetic`).

**Keyed on CITY, not market.** The tampa market spans $1,759–$2,919 because it
covers Fort Myers, Cape Coral, Port Charlotte and Venice as well as Tampa
proper. Comps at market level would report under-market gaps that are really
just geography.

## Links

| From | To | Via | Cardinality |
|---|---|---|---|
| Community | Property | `communitySlug` | 1 → many |
| Community | County | `countyId` | many → 1 |
| Property | County | `countyId` | many → 1 |
| Property | Lease | `propertyId` | 1 → many (over time) |
| Property | MaintenanceWorkOrder | `propertyId` | 1 → many |
| Property | Expense | `propertyId` | 1 → many |
| Property | TaxAssessment | `propertyId` | 1 → many (one per year) |
| Community | Expense | `communitySlug` | 1 → many (community scope) |
| Lease | Resident | `residentId` | many → 1 |
| Lease | RentPayment | `leaseId` | 1 → many |
| Lease | Lease | `renewalOfLeaseId` | self, many → 1 |
| RentPayment | Property | `propertyId` | many → 1 (denormalised) |
| RentPayment | Resident | `residentId` | many → 1 (denormalised) |
| MaintenanceWorkOrder | Vendor | `vendorId` | many → 1 |
| TaxAssessment | TaxBill | `assessmentId` | 1 → 1 |

Deliberate denormalisation: `Property` carries `city`, `state` and `countyId`
although all three are reachable through Community, and `RentPayment` carries
`propertyId` and `residentId` although both are reachable through Lease. The
comp join, the tax rollup and the delinquency query all run per row on every
dashboard render, and a two-hop traversal per row is slower and harder to read.
**Cost accepted:** those fields must stay consistent with their parents, and
validate.py checks the property/community case. Raise this unprompted if anyone
asks about the model — "I denormalised the read path and here is the integrity
cost I accepted" is the honest answer.

## Seasonality to build in

Not decoration. Without it the dashboard shows flat lines and the trending-rate
feature has nothing to trend.

**Leasing.** Move-ins cluster May–August: 41% of lease starts as generated,
against a 45% target. The residual gap is genuine drift from turnover, and
forcing it to exactly 45% would mean faking the turn cycle.
Lease ends follow 12–24 months later, so turn costs and vacancy inherit the
same rhythm.

**Rent collection.** Late and missed payments spike in **January** (post-holiday)
and again in **August/September** in markets with school-year moves. Baseline
on-time rate around 94–96%, dipping to ~88% in January.

**Maintenance.** HVAC-not-cooling spikes June–September in FL, TX, AZ — the
hottest markets carry the heaviest summer load (518–591/month against a ~280
baseline). HVAC-not-heating and freeze-driven plumbing leaks spike
December–February in TX, CO, TN, NC (350–387/month against ~130). Turn work
orders follow the leasing calendar, not the weather. Landscaping is the
RESIDENT's cost and is not a landlord seasonal line at all.

**Market rents.** Rise through spring and summer, flatten in winter, with a mild
overall upward drift over the 3 years so "trending rental rates" has a trend.

## The at-risk cohort

Roughly 8% of residents should show **degrading** payment behaviour rather than
uniformly bad behaviour — an on-time record that slips to late, then partial,
then missed. A flat random distribution of late payments makes every resident
look the same and there is nothing to find.

Ageing buckets computed at read time: current, 1–30, 31–60, 61–90, 90+ days.

A smaller group (~1.5%) should progress to `terminated-early` or `evicted`, so
the chain from payment behaviour through to lease outcome and turn cost is
traceable end to end.

Some at-risk residents should sit in homes that are **also** under market, and
some in homes that are not. If those two problems always coincide, the
dashboard cannot demonstrate that they are different questions.

## Generation rules

- Fixed seed, written into the generator. Regenerating must not reshuffle ids.
- Rent derived from the community's REAL `startingRent`, varied by beds and
  sqft. The 3 communities with no published rent stay explicitly unanchored —
  do not invent an observed value.
- Reconcile derived values AFTER generation, not during. Target Air's stock-outs
  were hardcoded indices chosen before shortages existed.
- Dates internally consistent: no lease before acquisition, no payment before
  its lease, no tax bill outside its assessment year.
- City is ALWAYS qualified by state. "The Reserve" is in Dallas, **Georgia**,
  while a separate Dallas market exists in Texas.

## AIP

Two different things travel under the AIP name and they have opposite data
requirements. Keeping them apart decides what we build and what we may claim.

### 1. AIP Logic, agents, natural-language questions — needs description, not volume

These reason over the ontology at query time. They do not learn from the data
and they do not need scale: they would work on 200 properties. What they need
is an ontology that **describes itself**. An LLM asked "which residents are at
risk and why" can only answer if the ontology says what `daysLate` measures,
that `Resident` reaches `RentPayment` through `Lease`, and that `status`
`missed` is worse than `partial`.

**Therefore, a build rule, not an afterthought:** every object type, every
property and every link gets a written description as it is created in
Developer Console. Not later, not "once it works". This is the cheapest
single thing that makes AIP useful here, and retrofitting descriptions across
12 object types is the kind of job that never gets done.

Descriptions should say what a field MEANS and its units, not restate its name.
"daysLate — whole days between dueDate and paidDate; 0 when paid on or before
the due date; null while unpaid" is useful. "Days late" is not.

### 2. Trained predictive models — need volume, history, labels, AND HONESTY

Forecasting delinquency, renewal probability or rent optimisation is ordinary
ML. The spec supports it: 3 years of time-ordered payments, leases resolving to
renewed / terminated-early / evicted as labels, and features that genuinely
precede the outcome.

**The trap, stated plainly so nobody walks into it in a demo:**

A model trained on synthetic data cannot be validated by that data. The
generator creates the at-risk cohort with an explicit rule (~8% degrade from
on-time → late → partial → missed). Any model trained on the output will
recover that rule and score extremely well. The accuracy figure measures how
faithfully the model reverse-engineered our own generator. It says nothing
about real residents.

**Never present a model accuracy number derived from this data.** Anyone with
ML experience will see the circularity immediately, and it would discredit the
parts of the prototype that ARE real.

What IS honest to demonstrate: the pipeline. The ontology supports the feature
engineering, a model trains against it, predictions write back onto the objects,
the UI surfaces them, and a user can act on one. That is a genuine Foundry
capability demonstration and it is what a prototype should show.

### 3. The at-risk score ships RULES-BASED first

Not ML. Transparent, works on day one, and for a CFO a score explainable in one
sentence beats a black box that is marginally better. It is also what property
managers actually use.

Computed per Resident from payment history across ALL their leases:

| Signal | Weight | Definition |
|---|---|---|
| Current arrears | 40 | Largest ageing bucket with a balance: current 0, 1–30 10, 31–60 20, 61–90 30, 90+ 40 |
| Recent trend | 25 | Late/partial/missed count in the last 6 payments, scaled 0–25 |
| Direction | 15 | 15 if the last 3 payments are worse than the prior 3 (this is what separates "degrading" from "consistently untidy") |
| Payment ratio | 10 | Share of amountDue actually paid across the current lease, inverted |
| Lease stage | 10 | Rises within 90 days of endDate — exposure is concentrated near renewal |

Bands: 0–24 healthy, 25–49 watch, 50–74 at risk, 75–100 critical.

Deliberate choices worth defending:
- **Direction is its own signal.** A resident consistently paying on day 3 is
  not the same risk as one who paid on time for a year and has now missed
  twice, even if their arrears match today.
- **History spans leases, not the current lease.** A renewal must not reset
  someone's record to clean.
- **Buckets computed at read time** from `daysLate`, so thresholds can change
  without regenerating 108,000 payment rows.

### 4. AIP Logic on top, for narrative

Once the score exists, AIP Logic earns its place doing what LLMs are good at
and models are not: "summarise why this resident is flagged, what the exposure
is, and what the options are." It reads the score and the underlying objects
rather than computing risk itself, which keeps the number auditable and the
explanation fluent. No training data required.

## Open

- Homes per community: proposed ~3,000 total, weighted by community. Confirm.
- Whether Vendor and Expense are needed for v1 or can follow the first
  dashboard.
- County assignment needs a real ZIP → county geocode; page coordinates are a
  default map centre and unusable.
