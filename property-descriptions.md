# Property descriptions — all 12 object types

Paste into the Description field on each property: Ontology Manager → Object
type → Properties tab → click the property → Description.

Listed in the alphabetical order Foundry shows them, so you can work top to
bottom. Foundry display names on the left, CSV column in brackets where they
differ.

Why bother: AIP Logic and any natural-language question over this ontology can
only reason about fields it has a description for. A description should say what
a field MEANS and its units, not restate its name.

---

## Communities (15)

**Beds Max** — Largest bedroom count offered in this community.

**Beds Min** — Smallest bedroom count offered in this community.

**City** — City name. Always use with state: "The Reserve" is in Dallas, Georgia, while a separate Dallas market exists in Texas.

**Community Name** — Display name, for example "Higley Park".

**County Id** — Foreign key to County, the jurisdiction that assesses and bills property tax.

**County Name** *(county)* — County name as plain text, for example Hillsborough. The County object itself is reached through the county link.

**Feature Count** — Number of amenities listed on the community page.

**Features** — Amenities from their site, semicolon separated, for example "Fenced yard; Granite countertops; Community pool".

**Market** — Invitation Homes' operating region, for example tampa. NOT a metro area: the tampa market covers Fort Myers, Cape Coral and Port Charlotte, over 100 miles away, and spans $1,759 to $2,919 in starting rent. Too coarse for rent comparison; compare by city.

**Property Count** — Homes generated in this community. Synthetic.

**Rent Anchor** — Either scraped or estimated. 73 communities publish a starting rent; 3 do not and fall back to their market median. Never present an estimated value as observed.

**Slug** — URL identifier from invitationhomes.com, for example higley-park. Primary key, and the join key used by Properties and Expenses.

**Starting Rent** — Lowest advertised monthly rent in USD. A floor, not an average: no home in this community is priced below it.

**State** — Two-letter code. Nine states: FL, TX, NC, GA, TN, CO, AZ, UT, CA.

**Zip** — Primary ZIP code for the community's city.

---

## Counties (7)

**Appeal Window Days** — Days after an assessment in which an appeal may be filed. 30, 45 or 60.

**Assessment Drift** — Typical annual growth in assessed value, as a decimal. 0.085 means 8.5% a year.

**County Id** — Identifier, for example CTY-001. Primary key.

**County Name** — County name without the word "County", for example Hillsborough, Maricopa, Tarrant.

**Mill Rate** — Property tax rate as a decimal. 0.0218 means 2.18% of assessed value, applied to assessed value less any successful appeal saving.

**Reassessment Cycle** — How often assessed value is revised, set by state regime rather than county preference. One of annual, biennial, quadrennial, octennial, capped-prop13. California caps growth at 2% a year until a sale resets it; Texas reassesses annually and aggressively; North Carolina revalues every eight years so values hold flat between cycles.

**State** — Two-letter code. Counties are unique per state: Montgomery exists in both TN and TX.

---

## Properties (16)

**Acquisition Date** — When the home entered the portfolio. No lease may start before this date.

**Acquisition Price** — Purchase price in USD. Tax assessments are anchored to a fraction of this.

**Baths** — Bathroom count, may be a half, for example 2.5.

**Beds** — Bedroom count. Used with city and month to find the matching market comp.

**City** — City name, denormalised from Community so comp joins do not need a second hop. Must stay consistent with the community.

**Community Slug** — Foreign key to Community.

**County Id** — Foreign key to County, denormalised from Community so tax rollups do not need a second hop.

**Current Lease Id** — The active lease. Empty when the home is vacant or in turn.

**Market Rent** — Current asking rent in USD per month. Never below the community's starting rent, because "starting at" is a floor.

**Property Id** — Identifier, for example PROP-00123. Primary key.

**Sqft** — Interior floor area in square feet.

**State** — Two-letter code, denormalised from Community.

**Status** — occupied, vacant or turn. Turn means between tenancies and being made ready.

**Street Address** — Street address. Synthetic, like the rest of the home.

**Year Built** — Year of construction, 2016 to 2024. These are build-to-rent communities, so the stock is new.

**Zip** — ZIP code.

---

## Residents (6)

**Credit Tier At Application** — A to D, recorded at application. Point in time, never updated, so it does not reflect payment behaviour since.

**Display Name** — Resident name. Synthetic.

**Has Pets** — Whether the household has pets. Up to 3 are permitted.

**Household Size** — Number of occupants.

**Resident Id** — Identifier, for example RES-00123. Primary key.

**Synthetic Profile Ground Truth** — GENERATOR ANSWER KEY, NOT AN OBSERVATION. This is the label used to decide who pays late when the data was created. It is not derived from anything a resident did. Never use it as a model feature, a dashboard column, or a user-facing filter. A model trained on data containing this field scores perfectly by reading the answer, which proves nothing. Its only legitimate use is checking whether the rules-based risk score correctly identifies the declining cohort.

---

## Leases (11)

**Concession Months** — Free months granted at signing, 0 or 1. The matching rent payment carries status waived, not missed.

**Deposit** — Security deposit in USD, typically half or one month's rent.

**End Date** — Last day of the contracted term. Turn cost and vacancy follow 12 to 24 months behind the start, so they inherit the same seasonal rhythm.

**Lease Id** — Identifier, for example LSE-000123. Primary key.

**Monthly Rent** — Contracted rent in USD per month. Compare against the market comp for the home's city, bedroom count and month to find homes below market.

**Property Id** — Foreign key to the home leased.

**Renewal Of Lease Id** — The prior lease this one renews. Empty on a resident's first lease at that home, which is why it is optional. Self-reference to Lease.

**Resident Id** — Foreign key to the renter. One resident can hold several leases over time, through renewal or by moving to another home in the portfolio.

**Start Date** — First day of the tenancy. Never earlier than the home's acquisition date. Move-ins cluster May to August, about 41% of all starts.

**Status** — active, expired, terminated-early or evicted. There is deliberately no "renewed" value: a renewal is a NEW lease pointing back through Renewal Of Lease Id, which is what keeps a resident's history continuous.

**Term Months** — 12, 18 or 24, matching their published 12 to 24 month range. Whole-year terms dominate; 18 is rare because it shifts a start month by six and walks a summer lease into winter on each renewal.

---

## Rent Payments (10)

**Amount Due** — Rent owed for the month in USD.

**Amount Paid** — Actually received in USD. Zero when missed, less than due when partial.

**Days Late** — Whole days between due date and paid date. Zero when on time, empty while unpaid. The raw material for delinquency ageing: buckets of 30, 60 and 90 days are computed when read rather than stored, so thresholds can change without regenerating 95,467 rows.

**Due Date** — First of the month the rent covers.

**Lease Id** — Foreign key to the lease.

**Paid Date** — When payment was received. Empty when missed.

**Payment Id** — Identifier, for example PAY-0001234. Primary key.

**Property Id** — Foreign key to the home, denormalised from the lease so delinquency queries do not hop per row.

**Resident Id** — Foreign key to the renter, denormalised from the lease for the same reason.

**Status** — paid, late, partial, missed or waived. Waived is a signing concession, not a failure to pay. On-time rates run 92 to 96% for most of the year and fall to about 84% in January.

---

## Vendors (6)

**Avg Turnaround Days** — Mean days from work order opened to closed.

**Category** — Trade, for example HVAC, Plumbing, Roof, Turn.

**Market** — The operating region this vendor serves.

**On Time Pct** — Share of work completed within target, as a decimal 0 to 1.

**Vendor Id** — Identifier, for example VEN-0012. Primary key.

**Vendor Name** — Contractor name. Synthetic.

---

## Maintenance Work Orders (13)

**Category** — One of 19 values following Invitation Homes' published responsibility split, for example "HVAC - not cooling", "Plumbing - leak", "Lawn maintenance".

**Charged To Resident** — True when the resident pays. Anything computing LANDLORD operating cost must exclude these: 8,098 orders worth $2.0M over three years.

**Closed Date** — When the work was completed. Empty while still open.

**Contributing Neglect** — HVAC failures where the resident skipped their own air-filter duty and the landlord paid for the result anyway. 562 orders, $932,682. Resident responsibility becoming landlord cost.

**Cost** — Cost of the work in USD. Landlord total $26.6M over three years.

**Is Emergency** — Whether this was handled as an emergency. ProCare offers 24/7 emergency service.

**Opened Date** — When the request was raised. HVAC spikes June to September in FL, TX and AZ; freeze-driven plumbing spikes December to February in TX, CO, TN and NC.

**Priority** — routine, urgent or emergency.

**Property Id** — Foreign key to the home.

**Resident Reported** — Whether the resident raised it, as opposed to an inspection or turn.

**Responsibility** — landlord or resident, per invitationhomes.com/resident-responsibilities. Landlord covers heating and cooling, roofing, fences, garage doors, water heaters, plumbing leaks and hardware, major clogs and appliances. Resident covers lawn care, sprinklers, pool, pest control, air filters and minor clogs.

**Vendor Id** — Foreign key to the contractor who did the work.

**Work Order Id** — Identifier, for example WO-001234. Primary key.

---

## Expenses (8)

**Amount** — Cost in USD. CapEx and Turn are 4% of rows and 57% of the money; HOA is 43% of rows and under 10% of the money.

**Category** — CapEx, Turn, Insurance, HOA, Legal, Marketing, Utilities, or Common area landscaping.

**Community Slug** — Foreign key to Community. Populated on every row, both property and community scope.

**Date** — Billing date. Cadence follows real invoicing: HOA quarterly, Insurance annual, Utilities monthly, the rest as they occur. Gaps in a monthly series are correct, not missing data.

**Expense Id** — Identifier, for example EXP-000123. Primary key.

**Gl Code** — General ledger code derived from category, for example GL-CAPEX.

**Property Id** — Foreign key to the home. EMPTY on community-scope rows, which is expected: 912 of 81,548 rows are shared costs belonging to no single home.

**Scope** — property or community. Anything summing landlord cost per home must exclude community-scope rows or it will double count. Utilities appear only while a home is VACANT, because residents pay their own; Lease Easy sells "utility management" as a convenience, not as the landlord absorbing the bill.

---

## Tax Assessments (9)

**Appeal Savings** — Reduction in assessed value in USD when an appeal succeeded, otherwise zero.

**Appeal Status** — none, filed, won or lost. Appeals only appear where the year-on-year change exceeded roughly 9%, which is where an owner would realistically contest.

**Assessed Value** — County's valuation of the home for tax purposes, in USD.

**Assessment Id** — Identifier, for example ASM-000123. Primary key.

**Change Pct** — Year-on-year change in assessed value, as a decimal. 0.085 means an 8.5% increase.

**County Id** — Foreign key to the assessing county.

**Prior Assessed Value** — Previous year's valuation in USD. Empty in the first year on record.

**Property Id** — Foreign key to the home.

**Tax Year** — 2024, 2025 or 2026. One assessment per home per year.

---

## Tax Bills (9)

**Amount Due** — Tax owed in USD: assessed value less any successful appeal saving, multiplied by the county mill rate.

**Assessment Id** — Foreign key to the assessment this bill was calculated from.

**Bill Id** — Identifier, for example TAX-000123. Primary key.

**County Id** — Foreign key to the billing county.

**Due Date** — 1 November of the tax year.

**Paid Date** — When the bill was settled. Empty while outstanding.

**Property Id** — Foreign key to the home.

**Status** — paid or outstanding. 2024 and 2025 bills are settled; 2026 bills fall due after the current data window and remain outstanding, which is expected rather than a collection problem.

**Tax Year** — 2024, 2025 or 2026.

---

## Market Rate Comps (8)

**Beds** — Bedroom count this comp applies to. Part of the comp key.

**City** — City this comp applies to. Part of the comp key. Keyed on CITY, not market: the tampa market spans $1,759 to $2,919 because it covers Fort Myers and Port Charlotte alongside Tampa proper, so comparing at market level would report homes as below market when the only difference is geography.

**Comp Id** — Identifier, for example CMP-000123. Primary key.

**Median Rent** — Median market rent in USD per month for this city, bedroom count and month. The benchmark a lease is measured against.

**Month** — Month this comp covers, as YYYY-MM. 36 months to September 2026, with rents drifting about 12% upward across the period.

**Sample Size** — Comparable homes behind the median.

**Source** — Always "synthetic". These comps are generated, not sourced from a market data provider.

**State** — Two-letter code. Part of the comp key, because city names repeat across states.
