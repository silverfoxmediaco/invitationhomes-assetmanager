import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  MaintenanceWorkOrders,
  Properties,
  Vendors,
} from "@invitation-homes-asset-management/sdk";
import { aggregate } from "./aggregate";
import { fetchAll, fetchWhere } from "./fetchAll";

/**
 * Maintenance, and the one chain in it that needs an ontology to see.
 *
 * Invitation Homes publishes a split: the company maintains the home, the
 * resident handles lawn care, pest control, minor clogs and — through the Lease
 * Easy bundle, which literally posts them filters — changing the air filters.
 *
 * A maintenance system knows an air conditioner failed. The lease terms know
 * whose job the filter was. Only the join says the second caused the first and
 * what it cost the landlord, which is the whole argument for modelling
 * responsibility on the work order rather than inferring it from a category.
 *
 * THE COST IS IN THE FREQUENCY, NOT THE SEVERITY. A neglect-contributed HVAC
 * failure costs almost exactly what any other one costs — $1,663 against
 * $1,666 across the full history. Skipped filters do not make a repair worse,
 * they make it happen more often. That decides what the lever is: there is
 * nothing to save per call, only calls to avoid.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT CLAIM: that vendors miss their stated
 * turnaround. Measured against the work orders, not one of the 96 vendors runs
 * slower than its own `avgTurnaroundDays` and the mean gap is -0.7 days. That
 * is not vendor discipline, it is the generator — the vendor's stated average
 * is what produced the close dates. Turnaround is therefore reported as
 * description, never as a finding, and no vendor is ranked or blamed on it.
 */

export interface CategoryCost {
  category: string;
  orders: number;
  cost: number;
  responsibility: string;
}

export interface SeasonPoint {
  /** "01".."12" */
  month: string;
  cooling: number;
  heating: number;
}

export interface OpenOrder {
  workOrderId: string;
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  category: string;
  priority: string;
  openedDate: string;
  ageDays: number;
  cost: number;
}

export interface Maintenance {
  /** Trailing 12 months. */
  orders12m: number;
  landlordCost12m: number;
  residentChargedBack12m: number;

  /** Full history — the neglect chain needs the volume to be worth stating. */
  hvacOrders: number;
  hvacCost: number;
  neglectOrders: number;
  neglectCost: number;
  neglectSharePct: number;
  neglectMeanCost: number;
  otherHvacMeanCost: number;
  /** Air-filter jobs billed to residents. The duty that was meant to prevent it. */
  filterOrders: number;

  categories: CategoryCost[];
  landlordOrders: number;
  residentOrders: number;

  season: SeasonPoint[];

  open: OpenOrder[];
  openCount: number;
  openEmergency: number;

  /** Descriptive only — see the note above. */
  emergencyMeanDays: number;
  urgentMeanDays: number;
  routineMeanDays: number;
  vendorCount: number;

  today: string;
}

type WorkOrderRow = {
  workOrderId: string;
  propertyId: string;
  category: string;
  responsibility: string;
  contributingNeglect: boolean;
  priority: string;
  isEmergency: boolean;
  openedDate: string;
  closedDate: string;
  cost: number;
};
type PropertyRow = {
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
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

function daysBetween(a: string, b: string): number {
  const x = Date.parse(`${a}T00:00:00Z`);
  const y = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return 0;
  }
  return Math.round((y - x) / 86_400_000);
}

const mean = (v: number[]): number => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);

export function useMaintenance(): {
  data: Maintenance | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [data, setData] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const today = todayIso();
        const countSince = monthsBack(12);

        // Counted in Foundry, not in the browser. At 20,000 homes the work
        // order table is ~200,000 rows, four times the row guard. Every
        // figure on this page except close times is a count, sum or mean
        // over a grouping, which is exactly what /aggregate is for.
        const WO = MaintenanceWorkOrders.apiName;
        const HVAC = ["HVAC - not cooling", "HVAC - not heating"];
        const [byCategory12m, byCategoryAll, hvacSplit, hvacByMonth, openRows, recentClosed, properties, vendors] =
          await Promise.all([
            aggregate<{ category: string; responsibility: string }>(
              WO,
              [{ type: "count", name: "n" }, { type: "sum", field: "cost", name: "cost" }],
              [{ field: "category", type: "exact" }, { field: "responsibility", type: "exact" }],
              { type: "gte", field: "openedDate", value: countSince }
            ),
            aggregate<{ category: string; responsibility: string }>(
              WO,
              [{ type: "count", name: "n" }],
              [{ field: "category", type: "exact" }, { field: "responsibility", type: "exact" }]
            ),
            // The neglect chain reads the whole history. 538 orders over three
            // years is a pattern; the same number sliced to twelve months is
            // an anecdote.
            aggregate<{ contributingNeglect: string }>(
              WO,
              [{ type: "count", name: "n" }, { type: "sum", field: "cost", name: "cost" }],
              [{ field: "contributingNeglect", type: "exact" }],
              { type: "in", field: "category", value: HVAC }
            ),
            // Seasonality across all three years, folded to calendar month below.
            aggregate<{ openedDate: string; category: string }>(
              WO,
              [{ type: "count", name: "n" }],
              [
                { field: "openedDate", type: "duration", value: 1, unit: "MONTHS" },
                { field: "category", type: "exact" },
              ],
              { type: "in", field: "category", value: HVAC }
            ),
            fetchWhere<WorkOrderRow>(client, MaintenanceWorkOrders, { closedDate: { $isNull: true } }, {
              select: ["workOrderId", "propertyId", "category", "priority", "openedDate", "cost"],
            }),
            // Close times need each order's own dates, which cannot be
            // aggregated, so they come from the last six months of closed
            // orders (~33,000 rows at 20,000 homes) rather than all three years.
            fetchWhere<{ priority: string; openedDate: string; closedDate: string }>(
              client,
              MaintenanceWorkOrders,
              { $and: [{ openedDate: { $gte: monthsBack(6) } }, { closedDate: { $isNull: false } }] },
              { select: ["priority", "openedDate", "closedDate"] }
            ),
            fetchAll<PropertyRow>(client, Properties, {
              select: ["propertyId", "streetAddress", "city", "state"],
            }),
            fetchAll<{ vendorId: string }>(client, Vendors, { select: ["vendorId"] }),
          ]);

        if (cancelled) {
          return;
        }

        const propertyById = new Map(properties.map((p) => [p.propertyId, p]));

        let orders12m = 0;
        let landlordCost12m = 0;
        let residentChargedBack12m = 0;
        const categories: CategoryCost[] = byCategory12m.map((g) => {
          const orders = g.metrics.n ?? 0;
          const cost = g.metrics.cost ?? 0;
          orders12m += orders;
          if (g.group.responsibility === "landlord") {
            landlordCost12m += cost;
          } else {
            residentChargedBack12m += cost;
          }
          return {
            category: g.group.category,
            orders,
            cost,
            responsibility: g.group.responsibility,
          };
        });

        let landlordOrders = 0;
        let residentOrders = 0;
        let filterOrders = 0;
        for (const g of byCategoryAll) {
          const n = g.metrics.n ?? 0;
          if (g.group.responsibility === "landlord") {
            landlordOrders += n;
          } else {
            residentOrders += n;
          }
          if (g.group.category === "Air filter") {
            filterOrders += n;
          }
        }

        // Grouping on a boolean returns the key as a string or a boolean
        // depending on the backend version; compare loosely.
        const isNeglect = (v: unknown) => String(v) === "true";
        let neglectOrders = 0;
        let neglectCost = 0;
        let otherOrders = 0;
        let otherCost = 0;
        for (const g of hvacSplit) {
          if (isNeglect(g.group.contributingNeglect)) {
            neglectOrders += g.metrics.n ?? 0;
            neglectCost += g.metrics.cost ?? 0;
          } else {
            otherOrders += g.metrics.n ?? 0;
            otherCost += g.metrics.cost ?? 0;
          }
        }
        const hvacOrders = neglectOrders + otherOrders;
        const hvacCost = neglectCost + otherCost;

        const season = new Map<string, SeasonPoint>();
        for (let m = 1; m <= 12; m++) {
          const key = String(m).padStart(2, "0");
          season.set(key, { month: key, cooling: 0, heating: 0 });
        }
        for (const g of hvacByMonth) {
          const point = season.get(iso(g.group.openedDate).slice(5, 7));
          if (!point) {
            continue;
          }
          if (g.group.category === "HVAC - not cooling") {
            point.cooling += g.metrics.n ?? 0;
          } else {
            point.heating += g.metrics.n ?? 0;
          }
        }

        const emergencyDays: number[] = [];
        const urgentDays: number[] = [];
        const routineDays: number[] = [];
        for (const w of recentClosed) {
          const days = daysBetween(iso(w.openedDate), iso(w.closedDate));
          if (w.priority === "emergency") {
            emergencyDays.push(days);
          } else if (w.priority === "urgent") {
            urgentDays.push(days);
          } else {
            routineDays.push(days);
          }
        }

        const open: OpenOrder[] = openRows.map((w) => {
          const p = propertyById.get(w.propertyId);
          const opened = iso(w.openedDate);
          return {
            workOrderId: w.workOrderId,
            propertyId: w.propertyId,
            streetAddress: p?.streetAddress ?? "",
            city: p?.city ?? "",
            state: p?.state ?? "",
            category: w.category,
            priority: w.priority,
            openedDate: opened,
            ageDays: daysBetween(opened, today),
            cost: w.cost,
          };
        });

        open.sort((a, b) => b.ageDays - a.ageDays);

        categories.sort((a, b) => b.cost - a.cost);

        setData({
          orders12m,
          landlordCost12m,
          residentChargedBack12m,
          hvacOrders,
          hvacCost,
          neglectOrders,
          neglectCost,
          neglectSharePct: hvacOrders ? neglectOrders / hvacOrders : 0,
          neglectMeanCost: neglectOrders ? neglectCost / neglectOrders : 0,
          otherHvacMeanCost: otherOrders ? otherCost / otherOrders : 0,
          filterOrders,
          categories,
          landlordOrders,
          residentOrders,
          season: [...season.values()],
          open: open.slice(0, 40),
          openCount: open.length,
          openEmergency: open.filter((o) => o.priority === "emergency").length,
          emergencyMeanDays: mean(emergencyDays),
          urgentMeanDays: mean(urgentDays),
          routineMeanDays: mean(routineDays),
          vendorCount: vendors.length,
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
