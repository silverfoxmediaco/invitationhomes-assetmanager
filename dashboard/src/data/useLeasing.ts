import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Expenses,
  Leases,
  MarketRateComps,
  Properties,
  Residents,
} from "@invitation-homes-asset-management/sdk";
import { fetchAll, fetchWhere } from "./fetchAll";

/**
 * The leasing pipeline: what is coming in, what is being re-signed, and what
 * leaving costs.
 *
 * Every other screen in this dashboard reports a problem, which is what
 * operations dashboards are for and also how they end up unread. This one
 * carries the side of the business that is working — and it earns the right to
 * by putting the honest counterweight on the same page rather than a different
 * one.
 *
 * THE COMPARISON THAT MATTERS is renewal pricing against market movement. The
 * portfolio page says a great many homes sit below market; the obvious next
 * question is whether that gap is opening or closing. A renewal book running
 * ahead of the comps is closing it. Reporting the renewal increase on its own
 * would be a number with no scale: +4% sounds strong and is weak in a market
 * that moved 6%.
 *
 * ON CAUSATION, stated because the two halves of this screen invite the leap:
 * renewal increases and resident departures both appear here, and this data
 * cannot show that one causes the other. Residents who leave have no recorded
 * offer to compare against. The page reports both and says so.
 */

export interface MoveIn {
  leaseId: string;
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  residentName: string;
  monthlyRent: number;
  startDate: string;
  termMonths: number;
  /** A renewal keeps a resident; a new lease replaces one. */
  isRenewal: boolean;
}

export interface MonthActivity {
  month: string;
  newLeases: number;
  renewals: number;
  /** True for the month in progress: the count stops at today, so the bar is
   *  short for calendar reasons rather than for business reasons. */
  partial: boolean;
}

export interface Leasing {
  /** Leases whose start date has not arrived yet. */
  moveIns: MoveIn[];
  moveInRentPerMonth: number;
  moveInsNew: number;
  moveInsRenewal: number;

  /** Renewals signed in the trailing 12 months. */
  renewals12m: number;
  renewalIncreasePct: number;
  /** Market movement over the same 12 months, from the comps. */
  marketGrowthPct: number;
  /** Renewal increase less market growth. Positive means gaining ground. */
  outpacePct: number;
  renewalUpliftPerYear: number;

  /** Leases that ended in the trailing 12 months, and how many re-signed. */
  expired12m: number;
  renewed12m: number;
  retentionPct: number;

  /** What the departures cost, trailing 12 months. */
  turnCost: number;
  turnEvents: number;
  marketingCost: number;
  vacancyUtilities: number;
  churnCost: number;

  /** Homes not currently earning. */
  vacant: number;
  inTurn: number;

  activity: MonthActivity[];
  asOfMonth: string;
  today: string;
}

type LeaseRow = {
  leaseId: string;
  propertyId: string;
  residentId: string;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  termMonths: number;
  status: string;
  renewalOfLeaseId: string;
};
type PropertyRow = {
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useLeasing(): { data: Leasing | null; loading: boolean; error: Error | null } {
  const client = useOsdkClient();
  const [data, setData] = useState<Leasing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const today = todayIso();
        const fetchSince = monthsBack(13);
        const countSince = monthsBack(12);

        const [leases, properties, comps, expenses] = await Promise.all([
          // Every lease. Renewal chains and retention both need the history,
          // and at 8,299 rows of eight columns this is a cheap read.
          fetchAll<LeaseRow>(client, Leases, {
            select: [
              "leaseId",
              "propertyId",
              "residentId",
              "monthlyRent",
              "startDate",
              "endDate",
              "termMonths",
              "status",
              "renewalOfLeaseId",
            ],
          }),
          fetchAll<PropertyRow>(client, Properties, {
            select: ["propertyId", "streetAddress", "city", "state", "status"],
          }),
          fetchAll<{ month: string; medianRent: number }>(client, MarketRateComps, {
            select: ["month", "medianRent"],
          }),
          fetchWhere<{ category: string; amount: number; date: string }>(
            client,
            Expenses,
            { date: { $gte: fetchSince } },
            { select: ["category", "amount", "date"] }
          ),
        ]);

        if (cancelled) {
          return;
        }

        const leaseById = new Map(leases.map((l) => [l.leaseId, l]));
        const propertyById = new Map(properties.map((p) => [p.propertyId, p]));

        // --- Market movement -------------------------------------------------
        // Median of every comp in a month, then this month against the same
        // month a year ago. Median rather than mean so one expensive city with
        // many comps cannot stand in for the market.
        const byMonth = new Map<string, number[]>();
        for (const c of comps) {
          const list = byMonth.get(c.month);
          if (list) {
            list.push(c.medianRent);
          } else {
            byMonth.set(c.month, [c.medianRent]);
          }
        }
        const monthKeys = [...byMonth.keys()].sort();
        const asOfMonth = monthKeys[monthKeys.length - 1] ?? "";
        const yearAgoMonth = monthKeys[monthKeys.length - 13] ?? monthKeys[0] ?? "";
        const medianOf = (m: string): number => {
          const v = [...(byMonth.get(m) ?? [])].sort((a, b) => a - b);
          if (!v.length) {
            return 0;
          }
          const mid = Math.floor(v.length / 2);
          return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
        };
        const nowMedian = medianOf(asOfMonth);
        const thenMedian = medianOf(yearAgoMonth);
        const marketGrowthPct = thenMedian > 0 ? nowMedian / thenMedian - 1 : 0;

        // --- Renewals signed in the window -----------------------------------
        let renewals12m = 0;
        let upliftSum = 0;
        let pctSum = 0;
        for (const l of leases) {
          if (!l.renewalOfLeaseId || iso(l.startDate) < countSince) {
            continue;
          }
          const prior = leaseById.get(l.renewalOfLeaseId);
          if (!prior || !prior.monthlyRent) {
            continue;
          }
          renewals12m++;
          pctSum += (l.monthlyRent - prior.monthlyRent) / prior.monthlyRent;
          upliftSum += (l.monthlyRent - prior.monthlyRent) * 12;
        }
        const renewalIncreasePct = renewals12m ? pctSum / renewals12m : 0;

        // --- Retention -------------------------------------------------------
        // A lease was retained if some later lease points back to it. That is
        // the only honest test available: the renewal IS a new lease, so
        // counting statuses would miss it entirely.
        const renewedFrom = new Set(
          leases.map((l) => l.renewalOfLeaseId).filter((id): id is string => Boolean(id))
        );
        let expired12m = 0;
        let renewed12m = 0;
        for (const l of leases) {
          const end = iso(l.endDate);
          if (l.status === "active" || end < countSince || end > today) {
            continue;
          }
          expired12m++;
          if (renewedFrom.has(l.leaseId)) {
            renewed12m++;
          }
        }

        // --- What leaving costs ----------------------------------------------
        let turnCost = 0;
        let turnEvents = 0;
        let marketingCost = 0;
        let vacancyUtilities = 0;
        for (const e of expenses) {
          if (iso(e.date) < countSince) {
            continue;
          }
          if (e.category === "Turn") {
            turnCost += e.amount;
            turnEvents++;
          } else if (e.category === "Marketing") {
            marketingCost += e.amount;
          } else if (e.category === "Utilities") {
            // Utilities bill only while a home is empty — residents pay their
            // own — so this line is a direct read on vacancy.
            vacancyUtilities += e.amount;
          }
        }

        // --- Pending move-ins -------------------------------------------------
        const pending = leases
          .filter((l) => iso(l.startDate) > today)
          .sort((a, b) => iso(a.startDate).localeCompare(iso(b.startDate)));

        const residents = pending.length
          ? await fetchWhere<{ residentId: string; displayName: string }>(
              client,
              Residents,
              { residentId: { $in: pending.map((l) => l.residentId) } },
              { select: ["residentId", "displayName"] }
            )
          : [];
        if (cancelled) {
          return;
        }
        const residentName = new Map(residents.map((r) => [r.residentId, r.displayName]));

        const moveIns: MoveIn[] = pending.map((l) => {
          const p = propertyById.get(l.propertyId);
          return {
            leaseId: l.leaseId,
            propertyId: l.propertyId,
            streetAddress: p?.streetAddress ?? "",
            city: p?.city ?? "",
            state: p?.state ?? "",
            residentName: residentName.get(l.residentId) ?? l.residentId,
            monthlyRent: l.monthlyRent,
            startDate: iso(l.startDate),
            termMonths: l.termMonths,
            isRenewal: Boolean(l.renewalOfLeaseId),
          };
        });

        // --- Activity by month -------------------------------------------------
        const activityMap = new Map<string, MonthActivity>();
        for (const l of leases) {
          const start = iso(l.startDate);
          if (start < monthsBack(18) || start > today) {
            continue;
          }
          const key = start.slice(0, 7);
          const row = activityMap.get(key) ?? {
            month: key,
            newLeases: 0,
            renewals: 0,
            partial: key === today.slice(0, 7),
          };
          if (l.renewalOfLeaseId) {
            row.renewals++;
          } else {
            row.newLeases++;
          }
          activityMap.set(key, row);
        }
        const activity = [...activityMap.values()].sort((a, b) =>
          a.month.localeCompare(b.month)
        );

        setData({
          moveIns,
          moveInRentPerMonth: moveIns.reduce((s, m) => s + m.monthlyRent, 0),
          moveInsNew: moveIns.filter((m) => !m.isRenewal).length,
          moveInsRenewal: moveIns.filter((m) => m.isRenewal).length,
          renewals12m,
          renewalIncreasePct,
          marketGrowthPct,
          outpacePct: renewalIncreasePct - marketGrowthPct,
          renewalUpliftPerYear: upliftSum,
          expired12m,
          renewed12m,
          retentionPct: expired12m ? renewed12m / expired12m : 0,
          turnCost,
          turnEvents,
          marketingCost,
          vacancyUtilities,
          churnCost: turnCost + marketingCost + vacancyUtilities,
          vacant: properties.filter((p) => p.status === "vacant").length,
          inTurn: properties.filter((p) => p.status === "turn").length,
          activity,
          asOfMonth,
          today,
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
