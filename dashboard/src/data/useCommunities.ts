import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Communities,
  Expenses,
  Leases,
  MaintenanceWorkOrders,
  MarketRateComps,
  Properties,
  TaxBills,
} from "@invitation-homes-asset-management/sdk";
import { fetchAll, fetchWhere } from "./fetchAll";

/**
 * The portfolio seen as 76 acquisitions rather than 3,001 houses.
 *
 * A community is one decision. Homes in it were bought or built together,
 * priced together, and sit in one county under one tax regime. So the
 * questions that are awkward per-home answer cleanly here: rent set once at
 * acquisition and never revisited shows up as a whole community drifting under
 * market at the same time, and a jurisdiction reassessing hard shows up as
 * every home in it costing more to hold.
 *
 * That is the point of the screen. A per-property view can tell you a house is
 * $300 under market; it cannot tell you that thirty-three of seventy-six
 * communities have more than half their homes there, which is a pricing policy
 * problem rather than thirty-three hundred pricing mistakes.
 *
 * COST IS SPLIT FOUR WAYS rather than totalled, because the split is the
 * finding and a blended figure actively misleads.
 *
 * Only ONE of the four varies systematically by community: property tax. The
 * dearest and cheapest communities to hold differ by roughly $11,000 a home a
 * year, and about half of that is tax — Bexar County against Wilson County,
 * not good management against bad. Insurance, which one would expect to be
 * geographic, is nearly flat here.
 *
 * Most of the REST of the spread is CapEx, and CapEx is episodic. A couple of
 * roofs landing inside the window in a 29-home community move its cost-per-home
 * by thousands; the same spend across 75 homes disappears. So CapEx gets its
 * own column rather than hiding inside operating expenses, because a reader
 * comparing two communities needs to see which part of the difference is a
 * pattern and which part is one expensive quarter.
 *
 * Windows: costs are the trailing TWELVE months, which is what the per-year
 * figures claim. Thirteen are fetched so a month boundary cannot clip the
 * earliest one, and the thirteenth is then dropped — summing what was fetched
 * would inflate every annual figure by about 8%.
 */

export interface CommunityRow {
  slug: string;
  name: string;
  market: string;
  city: string;
  state: string;
  county: string;

  homes: number;
  occupied: number;
  occupancyPct: number;

  /** Occupied homes we hold a comp for. The denominator for underMarket. */
  comped: number;
  underMarket: number;
  underMarketPct: number;
  gapPerMonth: number;

  /** The community's own advertised "starting at" rent, and how it was set. */
  startingRent: number | null;
  rentAnchor: string;
  /** Occupied homes contracted BELOW the rent the community advertises today. */
  belowAdvertised: number;

  /** Trailing 12 months, per home. */
  maintenancePerHome: number;
  /** Episodic capital spend. Lumpy in a small community — read with care. */
  capexPerHome: number;
  /** Recurring operating cost: HOA, insurance, turn, legal, marketing. */
  opexPerHome: number;
  commonAreaPerHome: number;
  taxPerHome: number;
  costPerHome: number;

  /** Contracted rent across active leases, annualised. */
  rentRollPerYear: number;
}

export interface CommunityPortfolio {
  rows: CommunityRow[];
  communities: number;
  homes: number;
  occupied: number;
  /** Communities where more than half the comped homes are under market. */
  majorityUnder: number;
  underMarketTotal: number;
  gapPerMonthTotal: number;
  belowAdvertisedTotal: number;
  /** Communities containing at least one home below its advertised rent. */
  belowAdvertisedCommunities: number;
  costPerHomeMedian: number;
  costPerHomeLow: CommunityRow | null;
  costPerHomeHigh: CommunityRow | null;
  /** Share of the cheapest-to-dearest spread explained by property tax. */
  taxShareOfSpread: number;
  /** Share of that spread explained by episodic capital spend. */
  capexShareOfSpread: number;
  asOfMonth: string;
}

type CommunityObj = {
  slug: string;
  communityName: string;
  market: string;
  city: string;
  state: string;
  county: string;
  startingRent: number;
  rentAnchor: string;
};
type PropertyRow = {
  propertyId: string;
  communitySlug: string;
  city: string;
  state: string;
  beds: number;
  currentLeaseId: string;
};
type LeaseRow = { leaseId: string; propertyId: string; monthlyRent: number; status: string };
type CompRow = { city: string; state: string; beds: number; month: string; medianRent: number };
type WorkOrderRow = {
  propertyId: string;
  responsibility: string;
  cost: number;
  openedDate: string;
};
type ExpenseRow = {
  propertyId: string;
  communitySlug: string;
  scope: string;
  category: string;
  amount: number;
  date: string;
};
type TaxBillRow = { propertyId: string; taxYear: number; amountDue: number };

const compKey = (city: string, state: string, beds: number) => `${city}|${state}|${beds}`;

/** Months back from today, first of that month, as a bare date. `date` and
 *  `openedDate` are LocalDate in the ontology despite the SDK typing them
 *  datetime — a trailing Z is rejected. See CLAUDE.md gotcha 8. */
function monthsBack(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

const iso = (d: unknown): string =>
  typeof d === "string"
    ? d.slice(0, 10)
    : d instanceof Date
      ? d.toISOString().slice(0, 10)
      : "";

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function useCommunities(): {
  data: CommunityPortfolio | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [data, setData] = useState<CommunityPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Fetch thirteen, count twelve. The extra month is boundary slack, not
        // data: counting it would overstate every per-year figure.
        const fetchSince = monthsBack(13);
        const countSince = monthsBack(12);

        const [communities, properties, leases, comps, workOrders, expenses, bills] =
          await Promise.all([
            fetchAll<CommunityObj>(client, Communities, {
              select: [
                "slug",
                "communityName",
                "market",
                "city",
                "state",
                "county",
                "startingRent",
                "rentAnchor",
              ],
            }),
            fetchAll<PropertyRow>(client, Properties, {
              select: ["propertyId", "communitySlug", "city", "state", "beds", "currentLeaseId"],
            }),
            fetchWhere<LeaseRow>(
              client,
              Leases,
              { status: { $eq: "active" } },
              { select: ["leaseId", "propertyId", "monthlyRent", "status"] }
            ),
            fetchAll<CompRow>(client, MarketRateComps, {
              select: ["city", "state", "beds", "month", "medianRent"],
            }),
            // Filtered in Foundry. Unfiltered these are 26,476 and 81,400 rows;
            // the expense table alone would breach fetchAll's row guard.
            fetchWhere<WorkOrderRow>(
              client,
              MaintenanceWorkOrders,
              { openedDate: { $gte: fetchSince } },
              { select: ["propertyId", "responsibility", "cost", "openedDate"] }
            ),
            fetchWhere<ExpenseRow>(
              client,
              Expenses,
              { date: { $gte: fetchSince } },
              { select: ["propertyId", "communitySlug", "scope", "category", "amount", "date"] }
            ),
            fetchAll<TaxBillRow>(client, TaxBills, {
              select: ["propertyId", "taxYear", "amountDue"],
            }),
          ]);

        if (cancelled) {
          return;
        }

        const asOfMonth = comps.reduce((max, c) => (c.month > max ? c.month : max), "");
        const compByKey = new Map<string, number>();
        for (const c of comps) {
          if (c.month === asOfMonth) {
            compByKey.set(compKey(c.city, c.state, c.beds), c.medianRent);
          }
        }

        const activeLease = new Map<string, LeaseRow>();
        for (const l of leases) {
          activeLease.set(l.leaseId, l);
        }

        const communityOf = new Map<string, string>();
        for (const p of properties) {
          communityOf.set(p.propertyId, p.communitySlug);
        }

        // Landlord maintenance only. Resident-responsibility work is charged
        // back and is not a cost of holding the home.
        const maintenance = new Map<string, number>();
        for (const w of workOrders) {
          if (w.responsibility !== "landlord" || iso(w.openedDate) < countSince) {
            continue;
          }
          const slug = communityOf.get(w.propertyId);
          if (slug) {
            maintenance.set(slug, (maintenance.get(slug) ?? 0) + w.cost);
          }
        }

        // Community-scope expenses carry no propertyId — that is how common
        // area cost is held — so they are keyed on their own communitySlug.
        const opex = new Map<string, number>();
        const capex = new Map<string, number>();
        const commonArea = new Map<string, number>();
        for (const e of expenses) {
          if (iso(e.date) < countSince) {
            continue;
          }
          if (e.scope === "community") {
            commonArea.set(e.communitySlug, (commonArea.get(e.communitySlug) ?? 0) + e.amount);
            continue;
          }
          const slug = communityOf.get(e.propertyId) ?? e.communitySlug;
          if (!slug) {
            continue;
          }
          // CapEx is separated because it is episodic. Blended into operating
          // cost it makes a small community look badly run when all that
          // happened is two roofs inside the window.
          const bucket = e.category === "CapEx" ? capex : opex;
          bucket.set(slug, (bucket.get(slug) ?? 0) + e.amount);
        }

        // Most recent bill per property, then summed by community. Taking every
        // bill would total three years of tax against one year of everything
        // else.
        const latestBill = new Map<string, TaxBillRow>();
        for (const b of bills) {
          const held = latestBill.get(b.propertyId);
          if (!held || b.taxYear > held.taxYear) {
            latestBill.set(b.propertyId, b);
          }
        }
        const tax = new Map<string, number>();
        for (const [propertyId, bill] of latestBill) {
          const slug = communityOf.get(propertyId);
          if (slug) {
            tax.set(slug, (tax.get(slug) ?? 0) + bill.amountDue);
          }
        }

        type Tally = {
          homes: number;
          occupied: number;
          comped: number;
          underMarket: number;
          gap: number;
          belowAdvertised: number;
          rentRoll: number;
        };
        const tally = new Map<string, Tally>();
        const blank = (): Tally => ({
          homes: 0,
          occupied: 0,
          comped: 0,
          underMarket: 0,
          gap: 0,
          belowAdvertised: 0,
          rentRoll: 0,
        });

        const communityBySlug = new Map(communities.map((c) => [c.slug, c]));

        for (const p of properties) {
          const t = tally.get(p.communitySlug) ?? blank();
          t.homes++;

          const lease = p.currentLeaseId ? activeLease.get(p.currentLeaseId) : undefined;
          if (lease) {
            t.occupied++;
            t.rentRoll += lease.monthlyRent * 12;

            const advertised = communityBySlug.get(p.communitySlug)?.startingRent;
            if (advertised && lease.monthlyRent < advertised) {
              t.belowAdvertised++;
            }

            const median = compByKey.get(compKey(p.city, p.state, p.beds));
            if (median != null) {
              t.comped++;
              if (median > lease.monthlyRent) {
                t.underMarket++;
                t.gap += median - lease.monthlyRent;
              }
            }
          }
          tally.set(p.communitySlug, t);
        }

        const rows: CommunityRow[] = communities.map((c) => {
          const t = tally.get(c.slug) ?? blank();
          const homes = t.homes || 1;
          const maintenancePerHome = (maintenance.get(c.slug) ?? 0) / homes;
          const capexPerHome = (capex.get(c.slug) ?? 0) / homes;
          const opexPerHome = (opex.get(c.slug) ?? 0) / homes;
          const commonAreaPerHome = (commonArea.get(c.slug) ?? 0) / homes;
          const taxPerHome = (tax.get(c.slug) ?? 0) / homes;

          return {
            slug: c.slug,
            name: c.communityName,
            market: c.market,
            city: c.city,
            state: c.state,
            county: c.county,
            homes: t.homes,
            occupied: t.occupied,
            occupancyPct: t.homes ? t.occupied / t.homes : 0,
            comped: t.comped,
            underMarket: t.underMarket,
            underMarketPct: t.comped ? t.underMarket / t.comped : 0,
            gapPerMonth: t.gap,
            // An `estimated` anchor is not an observation — three communities
            // publish no starting rent and theirs falls back to the market
            // median. Comparing a contract rent against a number we invented
            // would be a finding about our own guess.
            startingRent: c.rentAnchor === "scraped" ? c.startingRent : null,
            rentAnchor: c.rentAnchor,
            belowAdvertised: c.rentAnchor === "scraped" ? t.belowAdvertised : 0,
            maintenancePerHome,
            capexPerHome,
            opexPerHome,
            commonAreaPerHome,
            taxPerHome,
            costPerHome:
              maintenancePerHome + capexPerHome + opexPerHome + commonAreaPerHome + taxPerHome,
            rentRollPerYear: t.rentRoll,
          };
        });

        rows.sort((a, b) => b.gapPerMonth - a.gapPerMonth);

        const byCost = [...rows].sort((a, b) => a.costPerHome - b.costPerHome);
        const low = byCost[0] ?? null;
        const high = byCost[byCost.length - 1] ?? null;
        const spread = low && high ? high.costPerHome - low.costPerHome : 0;
        const taxSpread = low && high ? high.taxPerHome - low.taxPerHome : 0;
        const capexSpread = low && high ? high.capexPerHome - low.capexPerHome : 0;

        setData({
          rows,
          communities: rows.length,
          homes: rows.reduce((s, r) => s + r.homes, 0),
          occupied: rows.reduce((s, r) => s + r.occupied, 0),
          majorityUnder: rows.filter((r) => r.comped > 0 && r.underMarketPct > 0.5).length,
          underMarketTotal: rows.reduce((s, r) => s + r.underMarket, 0),
          gapPerMonthTotal: rows.reduce((s, r) => s + r.gapPerMonth, 0),
          belowAdvertisedTotal: rows.reduce((s, r) => s + r.belowAdvertised, 0),
          belowAdvertisedCommunities: rows.filter((r) => r.belowAdvertised > 0).length,
          costPerHomeMedian: median(rows.map((r) => r.costPerHome)),
          costPerHomeLow: low,
          costPerHomeHigh: high,
          taxShareOfSpread: spread > 0 ? taxSpread / spread : 0,
          capexShareOfSpread: spread > 0 ? capexSpread / spread : 0,
          asOfMonth,
        });
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
