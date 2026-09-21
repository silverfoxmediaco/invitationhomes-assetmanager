import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Communities,
  Leases,
  MarketRateComps,
  Properties,
} from "@invitation-homes-asset-management/sdk";
import { fetchAll, fetchWhere } from "./fetchAll";

/**
 * Every home in the portfolio, unfiltered.
 *
 * The overview ranks the twenty-five widest gaps to market, which answers
 * "where is the money" and nothing else. It cannot answer "what about this
 * house", and an asset manager asked about one specific address should not
 * have to guess which summary it happens to fall inside. So this is the
 * unfiltered list: all 3,001 homes, vacant ones included, with the same
 * rent-against-market join applied to each.
 *
 * VACANT AND IN-TURN HOMES BELONG HERE and are deliberately not hidden. They
 * have no contract rent, so they carry no gap and vanish from every
 * under-market figure on the dashboard — which is correct for those figures
 * and wrong as a picture of the portfolio. A home earning nothing is the most
 * expensive kind there is.
 *
 * Filtering and sorting happen in the browser on purpose. 3,001 rows of nine
 * fields is a small payload, the whole set is needed for the counts on the
 * filter buttons to be true, and a server round trip per keystroke would make
 * the search worse. This is the one screen where holding everything is the
 * right call rather than a shortcut.
 */

export interface PropertyRow {
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  status: string;
  communitySlug: string;
  communityName: string;
  market: string;
  county: string;

  /** Null when the home is vacant or in turn. */
  contractRent: number | null;
  marketMedian: number | null;
  /** Positive means BELOW market by this much a month. Null without both. */
  gapPerMonth: number | null;
  gapPct: number | null;
  leaseEndDate: string | null;
}

export interface PropertyList {
  rows: PropertyRow[];
  total: number;
  occupied: number;
  vacant: number;
  inTurn: number;
  underMarket: number;
  markets: string[];
  asOfMonth: string;
}

type PropertyObj = {
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  status: string;
  communitySlug: string;
  currentLeaseId: string;
};
type LeaseObj = {
  leaseId: string;
  propertyId: string;
  monthlyRent: number;
  endDate: string;
  status: string;
};
type CompObj = { city: string; state: string; beds: number; month: string; medianRent: number };
type CommunityObj = { slug: string; communityName: string; market: string; county: string };

const compKey = (city: string, state: string, beds: number) => `${city}|${state}|${beds}`;

const iso = (d: unknown): string =>
  typeof d === "string"
    ? d.slice(0, 10)
    : d instanceof Date
      ? d.toISOString().slice(0, 10)
      : "";

export function useProperties(): {
  data: PropertyList | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [data, setData] = useState<PropertyList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [properties, leases, comps, communities] = await Promise.all([
          fetchAll<PropertyObj>(client, Properties, {
            select: [
              "propertyId",
              "streetAddress",
              "city",
              "state",
              "zip",
              "beds",
              "baths",
              "sqft",
              "yearBuilt",
              "status",
              "communitySlug",
              "currentLeaseId",
            ],
          }),
          fetchWhere<LeaseObj>(
            client,
            Leases,
            { status: { $eq: "active" } },
            { select: ["leaseId", "propertyId", "monthlyRent", "endDate", "status"] }
          ),
          fetchAll<CompObj>(client, MarketRateComps, {
            select: ["city", "state", "beds", "month", "medianRent"],
          }),
          fetchAll<CommunityObj>(client, Communities, {
            select: ["slug", "communityName", "market", "county"],
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

        const leaseById = new Map(leases.map((l) => [l.leaseId, l]));
        const communityBySlug = new Map(communities.map((c) => [c.slug, c]));

        let occupied = 0;
        let vacant = 0;
        let inTurn = 0;
        let underMarket = 0;

        const rows: PropertyRow[] = properties.map((p) => {
          const lease = p.currentLeaseId ? leaseById.get(p.currentLeaseId) : undefined;
          const community = communityBySlug.get(p.communitySlug);
          const median = compByKey.get(compKey(p.city, p.state, p.beds)) ?? null;

          if (lease) {
            occupied++;
          } else if (p.status === "turn") {
            inTurn++;
          } else {
            vacant++;
          }

          const gap = lease && median != null ? median - lease.monthlyRent : null;
          if (gap != null && gap > 0) {
            underMarket++;
          }

          return {
            propertyId: p.propertyId,
            streetAddress: p.streetAddress,
            city: p.city,
            state: p.state,
            zip: p.zip,
            beds: p.beds,
            baths: p.baths,
            sqft: p.sqft,
            yearBuilt: p.yearBuilt,
            status: p.status,
            communitySlug: p.communitySlug,
            communityName: community?.communityName ?? p.communitySlug,
            market: community?.market ?? "",
            county: community?.county ?? "",
            contractRent: lease?.monthlyRent ?? null,
            marketMedian: median,
            gapPerMonth: gap,
            gapPct: gap != null && median ? gap / median : null,
            leaseEndDate: lease ? iso(lease.endDate) : null,
          };
        });

        rows.sort((a, b) => (b.gapPerMonth ?? -1e9) - (a.gapPerMonth ?? -1e9));

        setData({
          rows,
          total: rows.length,
          occupied,
          vacant,
          inTurn,
          underMarket,
          markets: [...new Set(rows.map((r) => r.market).filter(Boolean))].sort(),
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
