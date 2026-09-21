# Object type creation checklist

Exact values per screen, so this is clicking rather than deciding. Created
2026-09-21, after the CSVs uploaded.

## Before you start

**Write the descriptions as you go.** Not afterwards. AIP Logic and any
natural-language question over this ontology can only reason about fields it has
a description for, and retrofitting twelve object types is the job that never
gets done. The description should say what a field MEANS and its units, not
restate its name.

**Verify row counts after each type indexes.** They must match the source
exactly. A raw upload carries no schema, so the ontology can silently serve
stale data if a type is rebuilt against an older file. `readTable` diagnoses it.

**Check date parsing on the first type you create.** Foundry usually infers
dates correctly from ISO strings, but confirm it on `properties.acquisitionDate`
before trusting it across the other eleven.

---

## 1. Community — `communities.csv` — 76 rows

Primary key `slug`. Title property `communityName`.

> A build-to-rent neighborhood. These 76 are REAL, scraped from
> invitationhomes.com on 2026-09-21; every object below Community is synthetic.

| Property | Description to write |
|---|---|
| `slug` | URL identifier from their site, e.g. `higley-park`. Primary key. |
| `communityName` | Display name, e.g. "Higley Park". |
| `market` | Their operating region, e.g. `tampa`. NOT a metro: the tampa market includes Fort Myers and Port Charlotte, 100+ miles away. Too coarse a key for rent comparison. |
| `city` / `state` | Always use together. "The Reserve" is in Dallas, GEORGIA, while a separate Dallas market exists in Texas. |
| `county` / `countyId` | Tax jurisdiction. Assessed and appealed at county level, not state or market. |
| `startingRent` | Lowest advertised monthly rent, USD. A FLOOR, not an average — no property sits below it. |
| `rentAnchor` | `scraped` (73) or `estimated` (3). Three communities publish no rent; theirs is the market median. Never present an `estimated` value as observed. |
| `bedsMin` / `bedsMax` | Bedroom range offered. |
| `featureCount` / `features` | Amenities listed on their page, semicolon separated. |
| `propertyCount` | Homes generated in this community. Synthetic. |

## 2. County — `counties.csv` — 43 rows

Primary key `countyId`. Title property `countyName`.

> US county. Property tax is assessed, billed and appealed here.

| Property | Description to write |
|---|---|
| `millRate` | Tax rate as a decimal, e.g. 0.0218 = 2.18% of assessed value. |
| `assessmentDrift` | Typical annual growth in assessed value, decimal. |
| `reassessmentCycle` | `annual`, `biennial`, `quadrennial`, `octennial` or `capped-prop13`. Set by STATE regime: California caps growth at 2% until a sale resets it; Texas reassesses annually and hard. |
| `appealWindowDays` | Days after assessment in which an appeal may be filed. |

## 3. Property — `properties.csv` — 2,997 rows

Primary key `propertyId`. Title property `streetAddress`.

> A single-family rental home. Entirely synthetic, including the address.

| Property | Description to write |
|---|---|
| `marketRent` | Current asking rent, USD/month. Never below the community's `startingRent`. |
| `acquisitionDate` / `acquisitionPrice` | When the home entered the portfolio and what it cost, USD. No lease may start before this date. |
| `status` | `occupied`, `vacant` or `turn`. |
| `currentLeaseId` | The active lease, empty when not occupied. |
| `city` / `state` / `countyId` | Denormalised from Community so comp and tax queries do not hop. Must stay consistent with the parent. |

## 4. Resident — `residents.csv` — 5,646 rows

Primary key `residentId`. Title property `displayName`.

> A renter. Residents persist ACROSS leases: a renewal is a new lease for the
> same resident, so payment history is continuous and "at risk" is computable.

| Property | Description to write |
|---|---|
| `creditTierAtApplication` | A–D at application. Point in time, never updated. |
| `householdSize` / `hasPets` | Up to 3 pets are permitted. |
| `syntheticProfileGroundTruth` | **GENERATOR ANSWER KEY — NOT AN OBSERVATION.** The label used to decide who pays late. NEVER a model feature, dashboard column or user filter. Its only legitimate use is checking whether the rules-based risk score finds the degrading cohort. A model that sees this scores perfectly by reading the answer. |

Write that last description in full. The name alone will not stop someone
dragging the field into a training set.

## 5. Lease — `leases.csv` — 8,375 rows

Primary key `leaseId`. Title property `leaseId`.

> A tenancy agreement between a Resident and a Property.

| Property | Description to write |
|---|---|
| `termMonths` | 12, 18 or 24. Their published range is 12–24 months. |
| `monthlyRent` | Contracted rent, USD/month. Compare against MarketRateComp to find under-market homes. |
| `concessionMonths` | Free months granted at signing. Those payments carry status `waived`. |
| `renewalOfLeaseId` | The prior lease this renews. There is NO `renewed` status — a renewal is a new lease pointing back, which is what keeps resident history continuous. |
| `status` | `active`, `expired`, `terminated-early` or `evicted`. |

## 6. RentPayment — `rent_payments.csv` — 95,467 rows

Primary key `paymentId`. Title property `paymentId`.

> One month's rent obligation and what was actually paid against it.

| Property | Description to write |
|---|---|
| `dueDate` | First of the month the rent covers. |
| `amountDue` / `amountPaid` | USD. `amountPaid` is 0 when missed, partial when underpaid. |
| `daysLate` | Whole days between due and paid. 0 when on time, empty while unpaid. Raw material for delinquency ageing — buckets (30/60/90+) are computed at READ time so thresholds can change without regenerating 95,467 rows. |
| `status` | `paid`, `late`, `partial`, `missed`, `waived`. |
| `propertyId` / `residentId` | Denormalised from Lease so delinquency queries do not hop per row. |

## 7. Vendor — `vendors.csv` — 92 rows

Primary key `vendorId`. Title property `vendorName`.

| Property | Description to write |
|---|---|
| `avgTurnaroundDays` | Mean days from work order opened to closed. |
| `onTimePct` | Share completed within target, decimal 0–1. |

## 8. MaintenanceWorkOrder — `maintenance_work_orders.csv` — 26,477 rows

Primary key `workOrderId`. Title property `workOrderId`.

> A maintenance request. Includes requests the RESIDENT is responsible for —
> those are logged and charged back, not absorbed.

| Property | Description to write |
|---|---|
| `category` | 19 values following Invitation Homes' published responsibility split. |
| `responsibility` | `landlord` or `resident`, per invitationhomes.com/resident-responsibilities. Landlord: heating/cooling, roof, fences, garage door, water heater, plumbing leaks and hardware, major clogs, appliances. Resident: lawn, sprinklers, pool, pest control, air filters, minor clogs. |
| `chargedToResident` | True when the resident pays. **Landlord operating cost must EXCLUDE these** — 8,098 orders worth $2.0M. |
| `contributingNeglect` | HVAC failures where the resident skipped their own air-filter duty and the landlord paid anyway. 562 orders, $932,682. Resident responsibility becoming landlord cost. |
| `isEmergency` / `priority` | ProCare offers 24/7 emergency service. |
| `cost` | USD. Landlord total $26.6M over 3 years. |

## 9. Expense — `expenses.csv` — 81,548 rows

Primary key `expenseId`. Title property `expenseId`.

> An operating expense, at property OR community scope.

| Property | Description to write |
|---|---|
| `scope` | `property` or `community`. A community-scope row has NO `propertyId` — that is how common-area cost is held. |
| `category` | CapEx, Turn, Insurance, HOA, Legal, Marketing, Utilities, Common area landscaping. |
| `date` | Billing date. Cadence is real: HOA quarterly, Insurance annual, Utilities monthly, the rest episodic. |
| `amount` | USD. Total $94.0M over 3 years, $10,460 per property per year. |

**Utilities appear only while a home is VACANT.** Residents pay their own; Lease
Easy sells "utility management" as a convenience, not as the landlord absorbing
the bill.

## 10. TaxAssessment — `tax_assessments.csv` — 8,991 rows

Primary key `assessmentId`. Title property `assessmentId`.

| Property | Description to write |
|---|---|
| `taxYear` | 2024, 2025 or 2026. |
| `assessedValue` / `priorAssessedValue` | USD. Prior is empty in the first year. |
| `changePct` | Year-on-year change, decimal. Above ~0.09 is where an owner contests. |
| `appealStatus` | `none`, `filed`, `won`, `lost`. |
| `appealSavings` | USD reduction when won, else 0. |

## 11. TaxBill — `tax_bills.csv` — 8,991 rows

Primary key `billId`. Title property `billId`.

| Property | Description to write |
|---|---|
| `amountDue` | USD, assessed value less any appeal saving, times the county mill rate. |
| `status` | `paid` or `outstanding`. |

## 12. MarketRateComp — `market_rate_comps.csv` — 4,212 rows

Primary key `compId`. Title property `compId`.

> Median market rent by city, bedroom count and month. The benchmark a lease is
> measured against.

| Property | Description to write |
|---|---|
| `city` / `state` / `beds` / `month` | The comp key. **Keyed on CITY, not market** — the tampa market spans $1,759–$2,919 because it covers Fort Myers and Port Charlotte. Market-level comps would report under-market gaps that are only geography. |
| `medianRent` | USD/month. |
| `sampleSize` | Comparable homes behind the median. |
| `source` | Always `synthetic`. |

---

## After all twelve exist

Verify row counts match the table above exactly, then build the links in the
order given in `ontology-spec.md`. Start with Community → Property, since
everything else hangs off that spine.

Do NOT enable "Allow edits" yet. That is needed before an action can modify an
object type, and actions come after links are stable.

Action types are NOT in the SDK until they are added in Developer Console →
Ontology SDK → Resources → Action types, and a new SDK version generated.
