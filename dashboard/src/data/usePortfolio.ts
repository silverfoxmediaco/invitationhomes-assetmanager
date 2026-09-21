import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import { Properties, Leases, MarketRateComps } from "@invitation-homes-asset-management/sdk";
import { fetchAll } from "./fetchAll";

/**
 * The join the whole project exists to serve.
 *
 * A property management system knows the lease says $2,150. A market feed knows
 * comparable homes now go for $2,480. Neither knows the other. This joins an
 * active Lease to the MarketRateComp for its home's city, bedroom count and
 * month, and reports the gap.
 *
 * Keyed on CITY, never market. The tampa market spans $1,759 to $2,919 because
 * it covers Fort Myers, Cape Coral and Port Charlotte alongside Tampa proper.
 * Comparing at market level would report homes as under market when the only
 * difference is geography, which is a confident wrong answer rather than a
 * missing one.
 */

export interface UnderMarketRow {
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  beds: number;
  leaseId: string;
  contractRent: number;
  marketMedian: number;
  /** Positive means the home is BELOW market by this much per month. */
  gapPerMonth: number;
  gapPct: number;
}

export interface Portfolio {
  homes: number;
  occupied: number;
  vacantOrTurn: number;
  occupancyPct: number;
  /** Occupied homes whose contract rent sits below their city/beds median. */
  underMarketCount: number;
  underMarketMonthly: number;
  underMarketAnnual: number;
  /** Latest month present in the comp data, e.g. "2026-09". */
  asOfMonth: string;
  rows: UnderMarketRow[];
}

type PropertyRow = {
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  beds: number;
  status: string;
  currentLeaseId: string;
};
type LeaseRow = { leaseId: string; propertyId: string; monthlyRent: number; status: string };
type CompRow = { city: string; state: string; beds: number; month: string; medianRent: number };

const compKey = (city: string, state: string, beds: number, month: string) =>
  `${city}|${state}|${beds}|${month}`;

export function usePortfolio(): {
  data: Portfolio | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [data, setData] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Three reads in parallel. Only the columns each join actually needs:
        // Properties is 16 columns across 2,997 rows and we want five.
        const [properties, leases, comps] = await Promise.all([
          fetchAll<PropertyRow>(client, Properties, {
            select: ["propertyId", "streetAddress", "city", "state", "beds", "status", "currentLeaseId"],
          }),
          fetchAll<LeaseRow>(client, Leases, {
            select: ["leaseId", "propertyId", "monthlyRent", "status"],
          }),
          fetchAll<CompRow>(client, MarketRateComps, {
            select: ["city", "state", "beds", "month", "medianRent"],
          }),
        ]);

        if (cancelled) {return;}

        // Compare against the most recent month the comps actually contain,
        // not against today. Hardcoding "now" would silently produce an empty
        // dashboard the moment the data stops being refreshed.
        const asOfMonth = comps.reduce((max, c) => (c.month > max ? c.month : max), "");

        const compByKey = new Map<string, number>();
        for (const c of comps) {
          if (c.month !== asOfMonth) {continue;}
          compByKey.set(compKey(c.city, c.state, c.beds, c.month), c.medianRent);
        }

        const leaseById = new Map<string, LeaseRow>();
        for (const l of leases) {
          if (l.status === "active") {leaseById.set(l.leaseId, l);}
        }

        const rows: UnderMarketRow[] = [];
        let occupied = 0;

        for (const p of properties) {
          const lease = p.currentLeaseId ? leaseById.get(p.currentLeaseId) : undefined;
          if (!lease) {continue;}
          occupied++;

          const median = compByKey.get(compKey(p.city, p.state, p.beds, asOfMonth));
          // No comp for this city and bedroom count means we cannot say whether
          // the home is under market. Leave it out rather than treat a missing
          // benchmark as "at market" — that would understate the exposure.
          if (median == null) {continue;}

          const gap = median - lease.monthlyRent;
          if (gap <= 0) {continue;}

          rows.push({
            propertyId: p.propertyId,
            streetAddress: p.streetAddress,
            city: p.city,
            state: p.state,
            beds: p.beds,
            leaseId: lease.leaseId,
            contractRent: lease.monthlyRent,
            marketMedian: median,
            gapPerMonth: gap,
            gapPct: gap / median,
          });
        }

        rows.sort((a, b) => b.gapPerMonth - a.gapPerMonth);

        const underMarketMonthly = rows.reduce((s, r) => s + r.gapPerMonth, 0);

        setData({
          homes: properties.length,
          occupied,
          vacantOrTurn: properties.length - occupied,
          occupancyPct: properties.length ? occupied / properties.length : 0,
          underMarketCount: rows.length,
          underMarketMonthly,
          underMarketAnnual: underMarketMonthly * 12,
          asOfMonth,
          rows,
        });
      } catch (e) {
        if (!cancelled) {setError(e instanceof Error ? e : new Error(String(e)));}
      } finally {
        if (!cancelled) {setLoading(false);}
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return { data, loading, error };
}
