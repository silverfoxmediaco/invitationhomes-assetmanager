import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Communities,
  Counties,
  Expenses,
  Leases,
  MaintenanceWorkOrders,
  MarketRateComps,
  Properties,
  RentPayments,
  Residents,
  TaxBills,
} from "@invitation-homes-asset-management/sdk";
import { fetchWhere } from "./fetchAll";

/**
 * One community, every home in it.
 *
 * The end of the drill-through: portfolio verdict, then the community that
 * caused it, then the home, then the resident. Everything here is filtered in
 * Foundry on `communitySlug` or on this community's own property ids — nothing
 * pulls a whole object type across the wire to render forty houses.
 *
 * The county is fetched because it explains the tax column. `reassessmentCycle`
 * is the difference between a community whose tax bill creeps and one whose
 * bill is re-cut every year, and no amount of good management changes which of
 * those a home sits in.
 */

export interface CommunityHome {
  propertyId: string;
  streetAddress: string;
  beds: number;
  baths: number;
  sqft: number;
  status: string;
  contractRent: number | null;
  marketMedian: number | null;
  gapPerMonth: number | null;
  residentName: string | null;
  leaseEndDate: string | null;
  /** Unpaid rent on the active lease, trailing 13 months. */
  balance: number;
}

export interface CommunityDetail {
  slug: string;
  name: string;
  market: string;
  city: string;
  state: string;
  county: string;
  /** How the county reassesses: annual, biennial, capped-prop13 and so on. */
  reassessmentCycle: string | null;
  millRate: number | null;

  startingRent: number | null;
  rentAnchor: string;
  features: string;

  homes: CommunityHome[];
  homeCount: number;
  occupied: number;
  occupancyPct: number;
  comped: number;
  underMarket: number;
  gapPerMonth: number;
  belowAdvertised: number;

  maintenancePerHome: number;
  capexPerHome: number;
  opexPerHome: number;
  taxPerHome: number;
  costPerHome: number;

  rentRollPerMonth: number;
  arrearsTotal: number;
  residentsBehind: number;

  asOfMonth: string;
}

type PropertyRow = {
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  beds: number;
  baths: number;
  sqft: number;
  status: string;
  currentLeaseId: string;
};
type LeaseRow = {
  leaseId: string;
  propertyId: string;
  residentId: string;
  monthlyRent: number;
  endDate: string;
  status: string;
};

const iso = (d: unknown): string =>
  typeof d === "string"
    ? d.slice(0, 10)
    : d instanceof Date
      ? d.toISOString().slice(0, 10)
      : "";

function monthsBack(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

export function useCommunity(slug: string | undefined): {
  data: CommunityDetail | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [data, setData] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!slug) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id: string = slug;

    (async () => {
      try {
        const fetchSince = monthsBack(13);
        const countSince = monthsBack(12);

        const community = await client(Communities).fetchOne(id);
        if (cancelled) {
          return;
        }

        const bySlug = { communitySlug: { $eq: id } };
        const [properties, expenses, county] = await Promise.all([
          fetchWhere<PropertyRow>(client, Properties, bySlug, {
            select: [
              "propertyId",
              "streetAddress",
              "city",
              "state",
              "beds",
              "baths",
              "sqft",
              "status",
              "currentLeaseId",
            ],
          }),
          fetchWhere<{ propertyId: string; category: string; amount: number; date: string }>(
            client,
            Expenses,
            { communitySlug: { $eq: id }, date: { $gte: fetchSince } },
            { select: ["propertyId", "category", "amount", "date"] }
          ),
          community.countyId
            ? client(Counties)
                .fetchOne(community.countyId as string)
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        if (cancelled) {
          return;
        }

        const propertyIds = properties.map((p) => p.propertyId);
        const inThisCommunity = { propertyId: { $in: propertyIds } };

        // $in over ~40 property ids, not a full-table read. Leases covers every
        // lease these homes have ever held; only the active ones are used here,
        // but filtering on status as well would cost a second round trip for no
        // gain at this size.
        const [leases, workOrders, bills, comps] = await Promise.all([
          fetchWhere<LeaseRow>(client, Leases, inThisCommunity, {
            select: [
              "leaseId",
              "propertyId",
              "residentId",
              "monthlyRent",
              "endDate",
              "status",
            ],
          }),
          fetchWhere<{ propertyId: string; responsibility: string; cost: number; openedDate: string }>(
            client,
            MaintenanceWorkOrders,
            { propertyId: { $in: propertyIds }, openedDate: { $gte: fetchSince } },
            { select: ["propertyId", "responsibility", "cost", "openedDate"] }
          ),
          fetchWhere<{ propertyId: string; taxYear: number; amountDue: number }>(
            client,
            TaxBills,
            inThisCommunity,
            { select: ["propertyId", "taxYear", "amountDue"] }
          ),
          fetchWhere<{ city: string; state: string; beds: number; month: string; medianRent: number }>(
            client,
            MarketRateComps,
            { city: { $eq: community.city as string }, state: { $eq: community.state as string } },
            { select: ["city", "state", "beds", "month", "medianRent"] }
          ),
        ]);

        if (cancelled) {
          return;
        }

        const activeLeases = leases.filter((l) => l.status === "active");
        const leaseById = new Map(activeLeases.map((l) => [l.leaseId, l]));

        const [residents, payments] = await Promise.all([
          activeLeases.length
            ? fetchWhere<{ residentId: string; displayName: string }>(
                client,
                Residents,
                { residentId: { $in: activeLeases.map((l) => l.residentId) } },
                { select: ["residentId", "displayName"] }
              )
            : Promise.resolve([]),
          activeLeases.length
            ? fetchWhere<{
                leaseId: string;
                amountDue: number;
                amountPaid: number;
                status: string;
                dueDate: string;
              }>(
                client,
                RentPayments,
                {
                  leaseId: { $in: activeLeases.map((l) => l.leaseId) },
                  dueDate: { $gte: fetchSince },
                },
                { select: ["leaseId", "amountDue", "amountPaid", "status", "dueDate"] }
              )
            : Promise.resolve([]),
        ]);

        if (cancelled) {
          return;
        }

        const residentName = new Map(residents.map((r) => [r.residentId, r.displayName]));

        const balanceByLease = new Map<string, number>();
        for (const p of payments) {
          if (p.status === "waived") {
            continue;
          }
          const owed = p.amountDue - p.amountPaid;
          if (owed > 0) {
            balanceByLease.set(p.leaseId, (balanceByLease.get(p.leaseId) ?? 0) + owed);
          }
        }

        const asOfMonth = comps.reduce((max, c) => (c.month > max ? c.month : max), "");
        const medianByBeds = new Map<number, number>();
        for (const c of comps) {
          if (c.month === asOfMonth) {
            medianByBeds.set(c.beds, c.medianRent);
          }
        }

        let maintenance = 0;
        for (const w of workOrders) {
          if (w.responsibility === "landlord" && iso(w.openedDate) >= countSince) {
            maintenance += w.cost;
          }
        }

        let capex = 0;
        let opex = 0;
        for (const e of expenses) {
          if (iso(e.date) < countSince) {
            continue;
          }
          if (e.category === "CapEx") {
            capex += e.amount;
          } else {
            opex += e.amount;
          }
        }

        const latestBill = new Map<string, { taxYear: number; amountDue: number }>();
        for (const b of bills) {
          const held = latestBill.get(b.propertyId);
          if (!held || b.taxYear > held.taxYear) {
            latestBill.set(b.propertyId, b);
          }
        }
        let taxTotal = 0;
        for (const b of latestBill.values()) {
          taxTotal += b.amountDue;
        }

        const advertised =
          community.rentAnchor === "scraped" ? (community.startingRent as number) : null;

        let occupied = 0;
        let comped = 0;
        let underMarket = 0;
        let gapPerMonth = 0;
        let belowAdvertised = 0;
        let rentRollPerMonth = 0;
        let arrearsTotal = 0;
        let residentsBehind = 0;

        const homes: CommunityHome[] = properties.map((p) => {
          const lease = p.currentLeaseId ? leaseById.get(p.currentLeaseId) : undefined;
          const median = medianByBeds.get(p.beds) ?? null;
          const balance = lease ? (balanceByLease.get(lease.leaseId) ?? 0) : 0;

          if (lease) {
            occupied++;
            rentRollPerMonth += lease.monthlyRent;
            if (advertised && lease.monthlyRent < advertised) {
              belowAdvertised++;
            }
            if (median != null) {
              comped++;
              if (median > lease.monthlyRent) {
                underMarket++;
                gapPerMonth += median - lease.monthlyRent;
              }
            }
            if (balance > 0) {
              arrearsTotal += balance;
              residentsBehind++;
            }
          }

          return {
            propertyId: p.propertyId,
            streetAddress: p.streetAddress,
            beds: p.beds,
            baths: p.baths,
            sqft: p.sqft,
            status: p.status,
            contractRent: lease?.monthlyRent ?? null,
            marketMedian: median,
            gapPerMonth: lease && median != null ? median - lease.monthlyRent : null,
            residentName: lease ? (residentName.get(lease.residentId) ?? null) : null,
            leaseEndDate: lease ? iso(lease.endDate) : null,
            balance,
          };
        });

        homes.sort((a, b) => (b.gapPerMonth ?? -1e9) - (a.gapPerMonth ?? -1e9));

        const n = properties.length || 1;

        setData({
          slug: id,
          name: community.communityName as string,
          market: community.market as string,
          city: community.city as string,
          state: community.state as string,
          county: community.county as string,
          reassessmentCycle: (county?.reassessmentCycle as string) ?? null,
          millRate: (county?.millRate as number) ?? null,
          startingRent: advertised,
          rentAnchor: community.rentAnchor as string,
          features: (community.features as string) ?? "",
          homes,
          homeCount: properties.length,
          occupied,
          occupancyPct: properties.length ? occupied / properties.length : 0,
          comped,
          underMarket,
          gapPerMonth,
          belowAdvertised,
          maintenancePerHome: maintenance / n,
          capexPerHome: capex / n,
          opexPerHome: opex / n,
          taxPerHome: taxTotal / n,
          costPerHome: (maintenance + capex + opex + taxTotal) / n,
          rentRollPerMonth,
          arrearsTotal,
          residentsBehind,
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
  }, [client, slug]);

  return { data, loading, error };
}
