# Invitation Homes — Asset Management Platform

A prototype operations and C-suite platform for a single-family rental
portfolio, built on a Palantir Foundry ontology with a React front end.

**The company is real. The data is not.** Invitation Homes (NYSE: INVH) is a
public single-family rental REIT. The 76 communities here, with their markets,
cities, states, advertised starting rents and amenity lists, were read from
invitationhomes.com on 21 September 2026. Everything below the community level
is generated: properties, residents, leases, payments, work orders, expenses and
tax records. Nothing in this project comes from their systems, and nothing in it
should be presented as their actual operations.

## The question it answers

```
Community → Property → Lease → RentPayment
                   ↘ MaintenanceWorkOrder → Vendor
                   ↘ Expense
                   ↘ TaxAssessment → TaxBill
         Lease → Resident (many leases per resident)
         City + beds + month → MarketRateComp
```

Two things no single system can answer alone.

**Which homes are under market, and is it a pricing problem or a cost problem?**
A property management system knows the lease says $2,150. A market feed knows
comparable homes now go for $2,480. The ledger knows this home absorbed $6,400
of maintenance and a 12% reassessment. Only the join tells you which of those is
the story.

**Which residents are at risk?** Payment history across every lease a resident
has held, not just the current one. A renewal is a new lease pointing back at
the old one, so history stays continuous.

## Scope

The build-to-rent communities portfolio only: 76 communities across 9 states and
14 markets, 2,997 homes, three years of history to September 2026. Florida is
41% of communities and Texas 25%. The scattered single-family portfolio, around
80,000 homes across 19 markets, is out of scope.

## Layout

| Path | What it is |
|---|---|
| `CLAUDE.md` | Project context, design system, Foundry gotchas, conventions |
| `ontology-spec.md` | 12 object types, 15 links, seasonality, the AIP section |
| `object-type-checklist.md` | Per-screen values used to build the ontology |
| `property-descriptions.md` | All 118 property descriptions |
| `editsummary.txt` | Change log, appended at the bottom |
| `scripts/generate.py` | Synthetic data generator, deterministic, seed 1947 |
| `scripts/validate.py` | 25 integrity checks, non-zero exit so it can gate an upload |
| `data/reference/` | Scraped from invitationhomes.com: communities, rents, city→county |
| `data/generated/` | The 12 CSVs uploaded to Foundry |
| `brand/` | Client logo and favicons, reference only |

## Regenerating the data

```bash
python3 scripts/generate.py   # ~3 seconds
python3 scripts/validate.py   # 25 checks, exits non-zero on failure
```

Deterministic: same seed, same rows, same ids. Regenerating must never reshuffle
ids or every uploaded dataset and every Foundry link breaks. `data/generated/`
is committed rather than ignored so the exact rows now in the ontology stay
recoverable even if the generator changes.

## Foundry

Ontology Manager is at `/workspace/ontology` (not `/workspace/ontology-manager`,
which 404s). The ontology is shared with two other projects, so link types are
subject to a 60 one-to-many quota across all of them.

12 object types, 15 link types, 4 action types. Actions map only decision
properties — appeal status, close date, who pays, waiver — so the ontology
refuses to let a user rewrite a fact. "Allow edits" is enabled on exactly four
object types for that reason, and deliberately off on the other eight.
