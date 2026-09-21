import { useEffect, useState } from "react";
import { aggregate } from "./aggregate";

/**
 * Rent collection, month by month, computed in Foundry.
 *
 * THE FINDING THIS PAGE EXISTS FOR: January is not expensive, it is laborious.
 * The share of rent eventually collected barely moves across the year — 95.3%
 * in January against 97.4% in April. The share paid ON TIME swings three times
 * as far, 83.7% against 92.0%. Almost the same money arrives; it arrives late,
 * after someone has chased it.
 *
 * Those two lines are therefore plotted together and never blended. A single
 * "collections" number would show a flat, healthy portfolio and hide the
 * entire staffing problem, which is that the January book needs roughly half
 * again as many chasing hours as the April one for the same revenue.
 *
 * Waived months are excluded from both. A concession the company granted is
 * not rent the resident failed to pay, and counting it as a collection miss
 * would penalise the portfolio for its own marketing.
 */

export interface CollectionMonth {
  /** "2026-01" */
  month: string;
  due: number;
  paid: number;
  /** Share of billed rent actually received. */
  collectedPct: number;
  /** Share of payments that arrived on time and in full. */
  onTimePct: number;
  payments: number;
  late: number;
  partial: number;
  missed: number;
  waived: number;
  outstanding: number;
}

export interface Collections {
  months: CollectionMonth[];
  /** The same months folded onto the calendar, so a season shows as a season. */
  byCalendarMonth: { month: string; collectedPct: number; onTimePct: number }[];
  worstMonth: CollectionMonth | null;
  bestMonth: CollectionMonth | null;
  collected12m: number;
  due12m: number;
  collectedPct12m: number;
  onTimePct12m: number;
  outstanding12m: number;
  /** Spread between the best and worst calendar month, both measures. */
  collectedSpread: number;
  onTimeSpread: number;
}

type Group = { dueDate: string; status: string };

const MONTH_LABEL = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function useCollections(): {
  data: Collections | null;
  loading: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<Collections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // One request. 36 months by 5 statuses is 165 groups, against 95,663
        // payment rows if this were done in the browser.
        const groups = await aggregate<Group>(
          "RentPayments",
          [
            { type: "sum", field: "amountDue", name: "due" },
            { type: "sum", field: "amountPaid", name: "paid" },
            { type: "count", name: "n" },
          ],
          [
            { field: "dueDate", type: "duration", value: 1, unit: "MONTHS" },
            { field: "status", type: "exact" },
          ]
        );

        if (cancelled) {
          return;
        }

        const byMonth = new Map<string, CollectionMonth>();
        for (const g of groups) {
          const month = String(g.group.dueDate ?? "").slice(0, 7);
          if (!month) {
            continue;
          }
          const row =
            byMonth.get(month) ??
            ({
              month,
              due: 0,
              paid: 0,
              collectedPct: 0,
              onTimePct: 0,
              payments: 0,
              late: 0,
              partial: 0,
              missed: 0,
              waived: 0,
              outstanding: 0,
            } as CollectionMonth);

          const status = g.group.status;
          const n = g.metrics.n ?? 0;

          if (status === "waived") {
            // Counted so the page can say how much was conceded, but kept out
            // of both ratios: a concession is not a collection failure.
            row.waived += n;
            byMonth.set(month, row);
            continue;
          }

          row.due += g.metrics.due ?? 0;
          row.paid += g.metrics.paid ?? 0;
          row.payments += n;
          if (status === "late") {
            row.late += n;
          } else if (status === "partial") {
            row.partial += n;
          } else if (status === "missed") {
            row.missed += n;
          }
          byMonth.set(month, row);
        }

        const months = [...byMonth.values()]
          .map((m) => ({
            ...m,
            collectedPct: m.due > 0 ? m.paid / m.due : 1,
            onTimePct:
              m.payments > 0
                ? (m.payments - m.late - m.partial - m.missed) / m.payments
                : 1,
            outstanding: m.due - m.paid,
          }))
          .sort((a, b) => a.month.localeCompare(b.month));

        // Fold onto the calendar. Three Januaries averaged is a season; one is
        // a bad month.
        const cal = new Map<string, { due: number; paid: number; n: number; clean: number }>();
        for (const m of months) {
          const key = m.month.slice(5, 7);
          const c = cal.get(key) ?? { due: 0, paid: 0, n: 0, clean: 0 };
          c.due += m.due;
          c.paid += m.paid;
          c.n += m.payments;
          c.clean += m.payments - m.late - m.partial - m.missed;
          cal.set(key, c);
        }
        const byCalendarMonth = [...cal.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, c]) => ({
            month: MONTH_LABEL[Number(key) - 1] ?? key,
            collectedPct: c.due > 0 ? c.paid / c.due : 1,
            onTimePct: c.n > 0 ? c.clean / c.n : 1,
          }));

        // The trailing twelve months, skipping the month in progress: it is
        // billed but only part collected, and it would drag every total down
        // for calendar reasons.
        const complete = months.slice(0, -1);
        const last12 = complete.slice(-12);
        const due12m = last12.reduce((s, m) => s + m.due, 0);
        const collected12m = last12.reduce((s, m) => s + m.paid, 0);
        const payments12m = last12.reduce((s, m) => s + m.payments, 0);
        const clean12m = last12.reduce(
          (s, m) => s + (m.payments - m.late - m.partial - m.missed),
          0
        );

        const ranked = [...byCalendarMonth].sort((a, b) => a.onTimePct - b.onTimePct);
        const worstKey = ranked[0]?.month;
        const bestKey = ranked[ranked.length - 1]?.month;

        setData({
          months,
          byCalendarMonth,
          worstMonth:
            complete.find((m) => MONTH_LABEL[Number(m.month.slice(5, 7)) - 1] === worstKey) ??
            null,
          bestMonth:
            complete.find((m) => MONTH_LABEL[Number(m.month.slice(5, 7)) - 1] === bestKey) ??
            null,
          collected12m,
          due12m,
          collectedPct12m: due12m > 0 ? collected12m / due12m : 1,
          onTimePct12m: payments12m > 0 ? clean12m / payments12m : 1,
          outstanding12m: due12m - collected12m,
          collectedSpread:
            Math.max(...byCalendarMonth.map((c) => c.collectedPct)) -
            Math.min(...byCalendarMonth.map((c) => c.collectedPct)),
          onTimeSpread:
            Math.max(...byCalendarMonth.map((c) => c.onTimePct)) -
            Math.min(...byCalendarMonth.map((c) => c.onTimePct)),
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
  }, []);

  return { data, loading, error };
}
