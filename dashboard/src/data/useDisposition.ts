import { useEffect, useMemo, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Expenses,
  Leases,
  MaintenanceWorkOrders,
  MarketRateComps,
  Properties,
  RentPayments,
  TaxBills,
} from "@invitation-homes-asset-management/sdk";
import { aggregate } from "./aggregate";
import { fetchAll, fetchLatestComps, fetchWhere } from "./fetchAll";

/**
 * The portfolio as something a buyer would price: one bundle per market, each
 * with a trailing-twelve-month NOI, a cap rate on what was paid for it, and
 * the price an institutional buyer would pay at a given cap rate.
 *
 * NOI here is the standard underwriting line and nothing cleverer:
 *
 *   rent actually COLLECTED (not billed: bad debt is a buyer's first question)
 *   - operating expenses (HOA, insurance, vacant-month utilities, turn,
 *     marketing, legal, plus each community home's share of common-area cost)
 *   - landlord maintenance (resident-responsibility work is charged back)
 *   - property tax (the latest year's bill)
 *   - management, ASSUMED at 6% of collected rent. Invitation Homes manages
 *     its own homes, but a buyer underwrites a fee whether or not one is paid
 *     today, and a price that ignores it is one no buyer will match.
 *
 * CapEx sits below NOI, as it does in every acquisition model, and is shown
 * separately so a bundle that only looks cheap to hold because nobody has
 * replaced a roof is visible as such.
 *
 * Everything is summed in Foundry. A year of payments at 20,000 homes is
 * ~220,000 rows and a year of expenses ~150,000; the browser receives one
 * total per home per measure. Foundry caps a grouping at 10,000 groups, so
 * each per-home sum runs in ten slices by id prefix.
 */

export const MANAGEMENT_FEE = 0.06;
/**
 * Among bundles worth selling, the share of price lost to under-market rent
 * above which rents should be reset first. 3% was the first setting and it
 * fired on 17 of 20 markets, because under-market rent costs every market
 * 3-9% of its price; a signal that is always on says nothing.
 */
export const RESET_THRESHOLD = 0.05;

export const MARKET_NAMES: Record<string, string> = {
  atlanta: "Atlanta",
  austin: "Austin",
  carolinas: "Carolinas",
  chicago: "Chicago",
  dallas: "Dallas",
  denver: "Denver",
  houston: "Houston",
  jacksonville: "Jacksonville",
  "las-vegas": "Las Vegas",
  minneapolis: "Minneapolis",
  nashville: "Nashville",
  "northern-california": "Northern California",
  orlando: "Orlando",
  phoenix: "Phoenix",
  "salt-lake-city": "Salt Lake City",
  "san-antonio": "San Antonio",
  seattle: "Seattle",
  "south-florida": "South Florida",
  "southern-california": "Southern California",
  tampa: "Tampa",
};

export interface MarketBundle {
  market: string;
  name: string;
  homes: number;
  communityHomes: number;
  scatteredHomes: number;
  occupied: number;
  /** Trailing 12 months. */
  billed: number;
  collected: number;
  opex: number;
  maintenance: number;
  tax: number;
  management: number;
  noi: number;
  capex: number;
  /** What was paid for these homes. */
  costBasis: number;
  /** Annual rent the occupied homes would gain at today's market median. */
  underMarketPerYear: number;
}

export interface DispositionData {
  bundles: MarketBundle[];
  asOfMonth: string;
  since: string;
}

type PropertyRow = {
  propertyId: string;
  market: string;
  homeType: string;
  communitySlug: string;
  city: string;
  state: string;
  beds: number;
  acquisitionPrice: number;
  currentLeaseId: string;
};
type LeaseRow = { leaseId: string; monthlyRent: number };
type CompRow = { city: string; state: string; beds: number; month: string; medianRent: number };

function monthsBack(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

/** One metric summed per home, in ten id-prefix slices to stay under Foundry's 10,000-group cap. */
async function sumByProperty(
  objectType: string,
  metrics: { field: string; name: string }[],
  where: Record<string, unknown>[]
): Promise<Map<string, Record<string, number>>> {
  const slices = await Promise.all(
    [..."0123456789"].map((d) =>
      aggregate<{ propertyId: string }>(
        objectType,
        metrics.map((m) => ({ type: "sum" as const, field: m.field, name: m.name })),
        [{ field: "propertyId", type: "exact", maxGroupCount: 10_000 }],
        {
          type: "and",
          value: [{ type: "startsWith", field: "propertyId", value: `PROP-${d}` }, ...where],
        }
      )
    )
  );
  const out = new Map<string, Record<string, number>>();
  for (const g of slices.flat()) {
    out.set(g.group.propertyId, g.metrics);
  }
  return out;
}

export function useDisposition(): {
  data: DispositionData | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [data, setData] = useState<DispositionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const since = monthsBack(12);

        const taxYears = await aggregate<{ taxYear: string }>(
          TaxBills.apiName,
          [{ type: "count", name: "n" }],
          [{ field: "taxYear", type: "exact" }]
        );
        const latestTaxYear = Math.max(...taxYears.map((g) => Number(g.group.taxYear)));

        const [properties, leases, { asOfMonth, rows: comps }, rent, opex, capex, commonArea, maint, bills] =
          await Promise.all([
            fetchAll<PropertyRow>(client, Properties, {
              select: [
                "propertyId",
                "market",
                "homeType",
                "communitySlug",
                "city",
                "state",
                "beds",
                "acquisitionPrice",
                "currentLeaseId",
              ],
            }),
            fetchWhere<LeaseRow>(client, Leases, { status: { $eq: "active" } }, {
              select: ["leaseId", "monthlyRent"],
            }),
            fetchLatestComps<CompRow>(client, MarketRateComps, [
              "city",
              "state",
              "beds",
              "month",
              "medianRent",
            ]),
            sumByProperty(
              RentPayments.apiName,
              [
                { field: "amountDue", name: "billed" },
                { field: "amountPaid", name: "collected" },
              ],
              [{ type: "gte", field: "dueDate", value: since }]
            ),
            sumByProperty(Expenses.apiName, [{ field: "amount", name: "amount" }], [
              { type: "gte", field: "date", value: since },
              { type: "eq", field: "scope", value: "property" },
              { type: "not", value: { type: "eq", field: "category", value: "CapEx" } },
            ]),
            sumByProperty(Expenses.apiName, [{ field: "amount", name: "amount" }], [
              { type: "gte", field: "date", value: since },
              { type: "eq", field: "category", value: "CapEx" },
            ]),
            // Common-area cost belongs to a community, not a home, and is
            // shared across that community's homes below.
            aggregate<{ communitySlug: string }>(
              Expenses.apiName,
              [{ type: "sum", field: "amount", name: "amount" }],
              [{ field: "communitySlug", type: "exact", maxGroupCount: 1_000 }],
              {
                type: "and",
                value: [
                  { type: "gte", field: "date", value: since },
                  { type: "eq", field: "scope", value: "community" },
                ],
              }
            ),
            sumByProperty(MaintenanceWorkOrders.apiName, [{ field: "cost", name: "cost" }], [
              { type: "gte", field: "openedDate", value: since },
              { type: "eq", field: "responsibility", value: "landlord" },
            ]),
            fetchWhere<{ propertyId: string; amountDue: number }>(
              client,
              TaxBills,
              { taxYear: { $eq: latestTaxYear } },
              { select: ["propertyId", "amountDue"] }
            ),
          ]);

        if (cancelled) {
          return;
        }

        const rentById = new Map(leases.map((l) => [l.leaseId, l.monthlyRent]));
        const compByKey = new Map(
          comps.map((c) => [`${c.city}|${c.state}|${c.beds}`, c.medianRent])
        );
        const taxById = new Map(bills.map((b) => [b.propertyId, b.amountDue]));

        const homesInCommunity = new Map<string, number>();
        for (const p of properties) {
          if (p.communitySlug) {
            homesInCommunity.set(p.communitySlug, (homesInCommunity.get(p.communitySlug) ?? 0) + 1);
          }
        }
        const commonPerHome = new Map(
          commonArea
            .filter((g) => g.group.communitySlug)
            .map((g) => [
              g.group.communitySlug,
              (g.metrics.amount ?? 0) / Math.max(1, homesInCommunity.get(g.group.communitySlug) ?? 1),
            ])
        );

        const byMarket = new Map<string, MarketBundle>();
        let unassigned = 0;
        for (const p of properties) {
          if (!p.market) {
            unassigned++;
            continue;
          }
          const b =
            byMarket.get(p.market) ??
            ({
              market: p.market,
              name: MARKET_NAMES[p.market] ?? p.market,
              homes: 0,
              communityHomes: 0,
              scatteredHomes: 0,
              occupied: 0,
              billed: 0,
              collected: 0,
              opex: 0,
              maintenance: 0,
              tax: 0,
              management: 0,
              noi: 0,
              capex: 0,
              costBasis: 0,
              underMarketPerYear: 0,
            } satisfies MarketBundle);
          b.homes++;
          if (p.homeType === "community") {
            b.communityHomes++;
          } else {
            b.scatteredHomes++;
          }
          b.costBasis += p.acquisitionPrice ?? 0;

          const r = rent.get(p.propertyId);
          b.billed += r?.billed ?? 0;
          b.collected += r?.collected ?? 0;
          b.opex += (opex.get(p.propertyId)?.amount ?? 0) + (commonPerHome.get(p.communitySlug) ?? 0);
          b.capex += capex.get(p.propertyId)?.amount ?? 0;
          b.maintenance += maint.get(p.propertyId)?.cost ?? 0;
          b.tax += taxById.get(p.propertyId) ?? 0;

          const contract = p.currentLeaseId ? rentById.get(p.currentLeaseId) : undefined;
          if (contract != null) {
            b.occupied++;
            const median = compByKey.get(`${p.city}|${p.state}|${p.beds}`);
            if (median != null && median > contract) {
              b.underMarketPerYear += (median - contract) * 12;
            }
          }
          byMarket.set(p.market, b);
        }

        // Every home must belong to a market or the bundles do not add up to
        // the portfolio, and a sale package built on a partial count is wrong
        // in the one direction that matters: it understates what is for sale.
        if (unassigned > 0) {
          throw new Error(
            `${unassigned.toLocaleString()} homes have no market. The Properties object ` +
              `type needs its market property mapped (Ontology Manager) before this page ` +
              `can price bundles.`
          );
        }

        const bundles = [...byMarket.values()].map((b) => {
          b.management = b.collected * MANAGEMENT_FEE;
          b.noi = b.collected - b.opex - b.maintenance - b.tax - b.management;
          return b;
        });

        setData({ bundles, asOfMonth, since });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return { data, loading, error };
}

export interface PricedBundle extends MarketBundle {
  capOnCost: number;
  impliedPrice: number;
  gainOverCost: number;
  /** Sale price lost because in-place rents sit under market. */
  rentDiscount: number;
  signal: "reset" | "sell" | "hold";
}

/** Price every bundle at a buyer's cap rate. Pure, so the slider costs no fetch. */
export function usePriced(
  bundles: MarketBundle[] | undefined,
  buyerCap: number
): { rows: PricedBundle[]; portfolioCapOnCost: number } {
  return useMemo(() => {
    const list = bundles ?? [];
    const noi = list.reduce((s, b) => s + b.noi, 0);
    const cost = list.reduce((s, b) => s + b.costBasis, 0);
    const portfolioCapOnCost = cost > 0 ? noi / cost : 0;

    const rows = list.map((b) => {
      const impliedPrice = buyerCap > 0 ? b.noi / buyerCap : 0;
      // Added rent flows to NOI less the management fee charged on it.
      const rentDiscount =
        buyerCap > 0 ? (b.underMarketPerYear * (1 - MANAGEMENT_FEE)) / buyerCap : 0;
      const capOnCost = b.costBasis > 0 ? b.noi / b.costBasis : 0;
      // Whether to sell comes first: a bundle earning less on what was paid
      // for it than the portfolio does. How to sell comes second: if a buyer
      // would capture a large rent uplift, reset rents before going to market.
      const sellable = capOnCost < portfolioCapOnCost;
      const signal: PricedBundle["signal"] = !sellable
        ? "hold"
        : impliedPrice > 0 && rentDiscount / impliedPrice >= RESET_THRESHOLD
          ? "reset"
          : "sell";
      return {
        ...b,
        capOnCost,
        impliedPrice,
        gainOverCost: impliedPrice - b.costBasis,
        rentDiscount,
        signal,
      };
    });
    return { rows, portfolioCapOnCost };
  }, [bundles, buyerCap]);
}
