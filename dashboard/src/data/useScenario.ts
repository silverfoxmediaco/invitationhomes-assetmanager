import { useEffect, useMemo, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Expenses,
  Leases,
  MarketRateComps,
  Properties,
} from "@invitation-homes-asset-management/sdk";
import { fetchAll, fetchWhere } from "./fetchAll";

/**
 * "What if we raised renewals by X%" — modelled honestly.
 *
 * THE THING THIS DELIBERATELY DOES NOT DO: predict how residents respond to a
 * rent increase. There is no elasticity in this data and there cannot be —
 * residents who left have no recorded offer, so nothing anywhere says what
 * increase they walked away from. A tool that answered "a 2.5% rise costs you
 * 4% of your renewals" would be inventing the single number the whole question
 * turns on, and inventing it with a confident face.
 *
 * So the model runs the other way round. It computes what the increase is
 * WORTH, computes what losing a resident COSTS, and reports the BREAK-EVEN:
 * how many extra departures wipe the gain out, and how many points of
 * retention that is. The executive brings their own judgement about whether
 * the market will bear it; the tool supplies the arithmetic they would
 * otherwise do on a napkin, and supplies it correctly.
 *
 * That is a more useful answer than a forecast, and it is one the data can
 * actually support.
 *
 * WHAT A TURN COSTS is derived, not assumed. Turn work and marketing come from
 * the expense ledger per turn event. Vacancy is measurable because utilities
 * bill ONLY while a home is empty — residents pay their own — so the count of
 * utility rows per turn is the number of vacant months, and the rent forgone
 * over those months is the largest component of the total.
 */

export interface ScenarioInputs {
  /** Rent increase applied at renewal, as a fraction. 0.025 = 2.5%. */
  increasePct: number;
  /** How far ahead to look for expiring leases, in days. */
  horizonDays: number;
}

export interface TurnCost {
  turnWork: number;
  marketing: number;
  utilities: number;
  lostRent: number;
  vacantMonths: number;
  total: number;
  /** Turn events in the trailing 12 months, the denominator for the above. */
  events: number;
}

export interface Scenario {
  leases: number;
  rentRollMonthly: number;

  addedMonthly: number;
  addedAnnual: number;

  /** Homes whose rent would sit ABOVE their city/beds median after the rise. */
  aboveMarketAfter: number;
  aboveMarketBefore: number;
  /** Homes still BELOW market even after the rise — headroom left on the table. */
  belowMarketAfter: number;
  headroomMonthly: number;

  turnCost: TurnCost;

  /** Extra departures that would wipe out the added rent. */
  breakEvenTurns: number;
  /** Those departures as a share of the leases in the window. */
  breakEvenPct: number;

  /** Current portfolio retention, for reference — NOT used in the model. */
  currentRetentionPct: number;

  asOfMonth: string;
  today: string;
}

type LeaseRow = {
  leaseId: string;
  propertyId: string;
  monthlyRent: number;
  endDate: string;
  status: string;
};
type PropertyRow = { propertyId: string; city: string; state: string; beds: number };
type CompRow = { city: string; state: string; beds: number; month: string; medianRent: number };
type ExpenseRow = { category: string; amount: number; date: string };

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

function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const compKey = (city: string, state: string, beds: number) => `${city}|${state}|${beds}`;

interface Loaded {
  leases: LeaseRow[];
  propertyById: Map<string, PropertyRow>;
  compByKey: Map<string, number>;
  turnCost: TurnCost;
  retentionPct: number;
  asOfMonth: string;
}

export function useScenario(inputs: ScenarioInputs): {
  data: Scenario | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // The reads happen once. Moving a slider re-runs the arithmetic, not the
  // queries — a scenario tool that hits the network on every keystroke is one
  // nobody explores with.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const since = monthsBack(12);
        const [allLeases, properties, comps, expenses] = await Promise.all([
          fetchAll<LeaseRow>(client, Leases, {
            select: ["leaseId", "propertyId", "monthlyRent", "endDate", "status"],
          }),
          fetchAll<PropertyRow>(client, Properties, {
            select: ["propertyId", "city", "state", "beds"],
          }),
          fetchAll<CompRow>(client, MarketRateComps, {
            select: ["city", "state", "beds", "month", "medianRent"],
          }),
          fetchWhere<ExpenseRow>(
            client,
            Expenses,
            { date: { $gte: since } },
            { select: ["category", "amount", "date"] }
          ),
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

        const active = allLeases.filter((l) => l.status === "active");

        // --- What a turn costs -------------------------------------------------
        let turnWork = 0;
        let turnEvents = 0;
        let marketing = 0;
        let utilities = 0;
        let vacantMonthRows = 0;
        for (const e of expenses) {
          if (e.category === "Turn") {
            turnWork += e.amount;
            turnEvents++;
          } else if (e.category === "Marketing") {
            marketing += e.amount;
          } else if (e.category === "Utilities") {
            // One row is one month of a home standing empty.
            utilities += e.amount;
            vacantMonthRows++;
          }
        }
        const events = Math.max(1, turnEvents);
        const vacantMonths = vacantMonthRows / events;
        const avgRent =
          active.reduce((s, l) => s + l.monthlyRent, 0) / Math.max(1, active.length);
        const lostRent = avgRent * vacantMonths;

        const turnCost: TurnCost = {
          turnWork: turnWork / events,
          marketing: marketing / events,
          utilities: utilities / events,
          vacantMonths,
          lostRent,
          total: turnWork / events + marketing / events + utilities / events + lostRent,
          events: turnEvents,
        };

        // --- Retention, for reference only -------------------------------------
        const renewedFrom = new Set(
          allLeases
            .map((l) => (l as LeaseRow & { renewalOfLeaseId?: string }).renewalOfLeaseId)
            .filter(Boolean)
        );
        let ended = 0;
        let renewed = 0;
        const today = iso(new Date().toISOString());
        for (const l of allLeases) {
          const end = iso(l.endDate);
          if (l.status === "active" || end < since || end > today) {
            continue;
          }
          ended++;
          if (renewedFrom.has(l.leaseId)) {
            renewed++;
          }
        }

        setLoaded({
          leases: active,
          propertyById: new Map(properties.map((p) => [p.propertyId, p])),
          compByKey,
          turnCost,
          retentionPct: ended ? renewed / ended : 0,
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

  const data = useMemo<Scenario | null>(() => {
    if (!loaded) {
      return null;
    }
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = addDays(inputs.horizonDays);

    let count = 0;
    let rentRoll = 0;
    let aboveBefore = 0;
    let aboveAfter = 0;
    let belowAfter = 0;
    let headroom = 0;

    for (const l of loaded.leases) {
      const end = iso(l.endDate);
      if (end < today || end > cutoff) {
        continue;
      }
      count++;
      rentRoll += l.monthlyRent;

      const p = loaded.propertyById.get(l.propertyId);
      if (!p) {
        continue;
      }
      const median = loaded.compByKey.get(compKey(p.city, p.state, p.beds));
      if (median == null) {
        continue;
      }
      const after = l.monthlyRent * (1 + inputs.increasePct);
      if (l.monthlyRent > median) {
        aboveBefore++;
      }
      if (after > median) {
        aboveAfter++;
      } else {
        belowAfter++;
        headroom += median - after;
      }
    }

    const addedMonthly = rentRoll * inputs.increasePct;
    const addedAnnual = addedMonthly * 12;
    const breakEvenTurns =
      loaded.turnCost.total > 0 ? addedAnnual / loaded.turnCost.total : 0;

    return {
      leases: count,
      rentRollMonthly: rentRoll,
      addedMonthly,
      addedAnnual,
      aboveMarketBefore: aboveBefore,
      aboveMarketAfter: aboveAfter,
      belowMarketAfter: belowAfter,
      headroomMonthly: headroom,
      turnCost: loaded.turnCost,
      breakEvenTurns,
      breakEvenPct: count ? breakEvenTurns / count : 0,
      currentRetentionPct: loaded.retentionPct,
      asOfMonth: loaded.asOfMonth,
      today,
    };
  }, [loaded, inputs.increasePct, inputs.horizonDays]);

  return { data, loading, error };
}
