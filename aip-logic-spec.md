# AIP Logic function — `portfolio-advisor`

What to build in AIP Logic, exactly. James builds it in the no-code builder;
the dashboard calls it through the OSDK.

## Why a Logic function and not something else

Three things could power an AI suggestions panel and only one of them is right
here.

**AIP Logic** builds a *Function* over the ontology. It gets published, added
to the SDK, and the React app calls it like it calls `Properties` today. It
reasons at query time over the ontology's structure and the descriptions
written into every object type, property and link. That is what the
description discipline in `ontology-spec.md` was for.

**A live-in agent** (AIP Chatbot Studio, AIP Analyst) is conversational and
ad hoc. Good for exploration, wrong for a fixed panel that answers the same
question every time the page opens.

**Calling an LLM API straight from the React app** would work and is the wrong
call: the key cannot live in a browser, it bypasses Foundry's permissions
entirely, and it throws away the ontology context that makes the answers
worth reading.

## The honesty position, stated once

The model does **not** learn from this data. It reasons at query time. So it
would work identically against real Invitation Homes data — the capability is
genuine and transfers unchanged; only the inputs are synthetic.

That is the opposite of the ML trap recorded in `ontology-spec.md`, where a
trained model would only be recovering the generator's own rules and any
accuracy figure would be meaningless. Here the reasoning is the deliverable.

The panel still carries the prototype marker, same as every other screen.

## Signature

Keep it string-in, string-out. AIP Logic supports structured I/O, but a single
JSON string on each side is far quicker to assemble in the no-code builder and
cannot drift out of sync with the TypeScript types as the payload grows.

| | |
|---|---|
| **Function name** | `portfolioAdvisor` |
| **Input** | `snapshot` — String. JSON, the shape under "Input payload" below. |
| **Output** | String. JSON, the shape under "Output" below. |

After publishing: **Developer Console → Ontology SDK → Resources → add the
function**, then generate a new SDK version. It will not appear in the SDK
until you do — the same trap as action types (CLAUDE.md gotcha 1).

## The rule that matters most

**The model reasons over figures the dashboard already computed. It does not
query the ontology for its own numbers.**

If the panel cites $1,352,880 and the page above it shows $1,352,880, the
reader trusts both. If the model runs its own query and lands a few thousand
off — different rounding, different window, different comp month — the whole
screen loses credibility, and it loses it in a demo.

So the app passes a snapshot and the prompt forbids inventing anything else.

## Input payload

```jsonc
{
  "asOfMonth": "2026-09",        // month the market comps cover
  "today": "2026-09-21",
  "portfolio": {
    "homes": 3001, "occupied": 2760, "vacantOrTurn": 241,
    "underMarketCount": 1281,
    "underMarketMonthly": 112740, "underMarketAnnual": 1352880
  },
  "communities": {
    "total": 76, "majorityUnderMarket": 33,
    "belowAdvertisedHomes": 52, "belowAdvertisedCommunities": 17,
    "costPerHomeMedian": 19905,
    "taxShareOfCostSpread": 0.50, "capexShareOfCostSpread": 0.26,
    "dearest":  { "name": "Silos", "city": "San Antonio", "state": "TX",
                  "county": "Bexar", "costPerHome": 26253, "taxPerHome": 8308 },
    "cheapest": { "name": "Cedar Landing", "city": "Lebanon", "state": "TN",
                  "county": "Wilson", "costPerHome": 14846, "taxPerHome": 2654 },
    "worstGaps": [ { "name": "...", "market": "...", "underMarketPct": 0.79,
                     "gapPerMonth": 3870 } ]   // top 5
  },
  "residents": {
    "activeLeases": 2760, "flagged": 165,
    "totalArrears": 1673783, "arrearsHeldByFlagged": 0.47,
    "rentExposedMonthly": 418280,
    "ageing": { "1-30": 128475, "31-60": 136059, "61-90": 138122, "90+": 1271127 }
  },
  "leasing": {
    "renewals12m": 1072, "renewalIncreasePct": 0.046, "marketGrowthPct": 0.031,
    "retentionPct": 0.46, "churnCost12m": 8725532,
    "renewalUpliftPerYear": 1457400,
    "pendingMoveIns": 60, "pendingMoveInRentMonthly": 158395
  },
  "collections": {
    "collectedPct12m": 0.966, "onTimePct12m": 0.887,
    "outstanding12m": 2881849,
    "worstCalendarMonth": "Jan", "worstOnTimePct": 0.841, "onTimeSpread": 0.075
  },
  "maintenance": {
    "landlordCost12m": 9453381, "chargedBack12m": 713152,
    "neglectOrders": 538, "neglectCost3y": 894480, "neglectCostPerYear": 298160,
    "neglectMeanCost": 1663, "otherHvacMeanCost": 1666,
    "filterVisitsBilled": 1080, "openWorkOrders": 113
  }
}
```

## Output

```jsonc
{
  "suggestions": [
    {
      "title": "Reprice Arcilla Ridge at renewal",     // imperative, <= 60 chars
      "rationale": "79% of comped homes ...",           // 1–2 sentences, cites input figures
      "impact": "$46,440 a year",                       // or a count; "" if not quantifiable
      "impactBasis": "3,870/mo gap x 12",               // how impact was derived
      "confidence": "high",                             // high | medium | low
      "horizon": "renewal cycle",                       // now | 90 days | renewal cycle | annual
      "action": "file-tax-appeal",                      // one of the four, or null
      "target": { "kind": "community", "id": "arcilla-ridge" }  // or property/county/null
    }
  ],
  "notes": "..."   // optional: what the model could NOT assess from this snapshot
}
```

## Prompt

Paste this as the Logic block's instruction.

> You advise the asset management team of a single-family rental REIT. You are
> given a JSON snapshot of portfolio figures that a dashboard has already
> computed. Produce ranked, specific recommendations.
>
> **Ground rules, in order of importance.**
>
> 1. **Never invent a number.** Every figure you cite must appear in the input
>    snapshot, or be simple arithmetic on figures in it — and when you do the
>    arithmetic, say so in `impactBasis`. If you cannot support a claim from
>    the snapshot, do not make it.
> 2. **Be specific.** Name the community, the county, the month. "Review
>    underperforming assets" is worthless. "Arcilla Ridge has 79% of its
>    comped homes below market" is a recommendation someone can act on.
> 3. **Fewer, better.** Return at most 5 suggestions, ranked by expected
>    value. If the snapshot only supports 3, return 3. Do not pad.
> 4. **Separate what can be changed from what cannot.** Property tax is set by
>    the county and no operator can negotiate the mill rate — but an
>    assessment can be appealed. Pricing and renewal terms are decisions.
>    CapEx is lumpy history, not a run rate.
> 5. **Do not claim causation the data does not establish.** Renewal increases
>    and resident departures both appear in the snapshot; nothing in it shows
>    one causes the other, because residents who left have no recorded offer.
>    You may note the tension. You may not assert the link.
> 6. **Attach an action where one fits.** Available action types are
>    `file-tax-appeal` (against a county assessment), `waive-rent-payment` (a
>    concession or reduced settlement), `charge-to-resident` (reassign a work
>    order under the published responsibility split), and `close-work-order`.
>    Use `null` when none of them executes the suggestion.
>
> **Context you should use.** The published responsibility split makes lawn
> care, sprinklers, pool, pest control and air filters the resident's, and the
> Lease Easy bundle posts filters to them. Landlord-responsible maintenance is
> a cost of holding the home; resident-responsibility work is charged back and
> is not. Utilities bill only while a home is vacant. A renewal writes a new
> lease rather than extending the old one, so a resident's history spans
> leases.
>
> Return only the JSON object described by the output schema. No prose around
> it, no markdown fence.

## What good output looks like

Grounded in the figures above, a strong answer would find things like:

- **Tax appeals in Bexar County.** Tax is half the spread between the dearest
  and cheapest community to hold, Silos runs $8,308 a home against Cedar
  Landing's $2,654, and `file-tax-appeal` exists. Actionable, with an object.
- **The renewal book is winning; retention is not.** +4.6% against a market
  that moved +3.1%, and 46% retention against $8.7M of churn cost. The right
  output names the tension and stops short of claiming one caused the other.
- **Air filters.** 538 HVAC failures traced to skipped filters, and the mean
  cost of one is identical to any other HVAC call — so the lever is frequency,
  not severity, and the return is the whole $298,160 a year.
- **January is a staffing problem, not a revenue one.** Collections move 2.1%
  across the year; on-time payment moves 7.5%.

If the first run produces generic advice, the fix is almost always rule 2 —
tighten the demand for named specifics before touching anything else.
