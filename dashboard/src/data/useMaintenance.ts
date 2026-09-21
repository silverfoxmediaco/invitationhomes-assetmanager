import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  MaintenanceWorkOrders,
  Properties,
  Vendors,
} from "@invitation-homes-asset-management/sdk";
import { fetchAll } from "./fetchAll";

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

        // The whole table, unfiltered. Seasonality needs three years to show a
        // repeating shape rather than one summer, and at 26,476 rows this sits
        // well inside the row guard. Everything else on this page windows in
        // the browser off the same read.
        const [workOrders, properties, vendors] = await Promise.all([
          fetchAll<WorkOrderRow>(client, MaintenanceWorkOrders, {
            select: [
              "workOrderId",
              "propertyId",
              "category",
              "responsibility",
              "contributingNeglect",
              "priority",
              "isEmergency",
              "openedDate",
              "closedDate",
              "cost",
            ],
          }),
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
        let landlordOrders = 0;
        let residentOrders = 0;

        const categoryMap = new Map<string, CategoryCost>();
        const season = new Map<string, SeasonPoint>();
        for (let m = 1; m <= 12; m++) {
          const key = String(m).padStart(2, "0");
          season.set(key, { month: key, cooling: 0, heating: 0 });
        }

        const hvacNeglect: number[] = [];
        const hvacOther: number[] = [];
        let hvacOrders = 0;
        let hvacCost = 0;
        let neglectOrders = 0;
        let neglectCost = 0;
        let filterOrders = 0;

        const emergencyDays: number[] = [];
        const urgentDays: number[] = [];
        const routineDays: number[] = [];

        const open: OpenOrder[] = [];

        for (const w of workOrders) {
          const opened = iso(w.openedDate);
          const closed = iso(w.closedDate);

          if (w.responsibility === "landlord") {
            landlordOrders++;
          } else {
            residentOrders++;
          }

          if (opened >= countSince) {
            orders12m++;
            if (w.responsibility === "landlord") {
              landlordCost12m += w.cost;
            } else {
              residentChargedBack12m += w.cost;
            }
            const key = `${w.category}|${w.responsibility}`;
            const row = categoryMap.get(key) ?? {
              category: w.category,
              orders: 0,
              cost: 0,
              responsibility: w.responsibility,
            };
            row.orders++;
            row.cost += w.cost;
            categoryMap.set(key, row);
          }

          // The neglect chain reads the whole history. 538 orders over three
          // years is a pattern; the same number sliced to twelve months is an
          // anecdote.
          if (w.category.startsWith("HVAC")) {
            hvacOrders++;
            hvacCost += w.cost;
            if (w.contributingNeglect) {
              neglectOrders++;
              neglectCost += w.cost;
              hvacNeglect.push(w.cost);
            } else {
              hvacOther.push(w.cost);
            }
          }
          if (w.category === "Air filter") {
            filterOrders++;
          }

          // Seasonality across all three years, by calendar month.
          const mm = opened.slice(5, 7);
          const point = season.get(mm);
          if (point) {
            if (w.category === "HVAC - not cooling") {
              point.cooling++;
            } else if (w.category === "HVAC - not heating") {
              point.heating++;
            }
          }

          if (closed) {
            const days = daysBetween(opened, closed);
            if (w.priority === "emergency") {
              emergencyDays.push(days);
            } else if (w.priority === "urgent") {
              urgentDays.push(days);
            } else {
              routineDays.push(days);
            }
          } else {
            const p = propertyById.get(w.propertyId);
            open.push({
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
            });
          }
        }

        open.sort((a, b) => b.ageDays - a.ageDays);

        const categories = [...categoryMap.values()].sort((a, b) => b.cost - a.cost);

        setData({
          orders12m,
          landlordCost12m,
          residentChargedBack12m,
          hvacOrders,
          hvacCost,
          neglectOrders,
          neglectCost,
          neglectSharePct: hvacOrders ? neglectOrders / hvacOrders : 0,
          neglectMeanCost: mean(hvacNeglect),
          otherHvacMeanCost: mean(hvacOther),
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
