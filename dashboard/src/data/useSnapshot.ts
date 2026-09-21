import { useMemo } from "react";
import { useCommunities } from "./useCommunities";
import { useAtRisk } from "./useAtRisk";
import { useLeasing } from "./useLeasing";
import { useCollections } from "./useCollections";
import { useMaintenance } from "./useMaintenance";
import type { AdvisorSnapshot } from "./useAdvisor";

/**
 * Everything the advisor is allowed to know, gathered from the hooks that draw
 * the pages.
 *
 * Deliberately composed from the EXISTING hooks rather than re-querying. Every
 * figure the model sees is therefore the same figure a reader can find on a
 * screen and check. Writing a separate set of queries for the advisor would be
 * faster to read and would eventually disagree with the dashboard by a few
 * thousand dollars, which is the single worst thing this panel could do.
 *
 * It costs five parallel hook loads. That is why the panel renders
 * independently of the page it sits on: the overview paints immediately and
 * this fills in behind it, rather than holding the whole screen hostage to the
 * slowest read.
 */

export function useSnapshot(): {
  snapshot: AdvisorSnapshot | null;
  loading: boolean;
  error: Error | null;
} {
  const communities = useCommunities();
  const atRisk = useAtRisk();
  const leasing = useLeasing();
  const collections = useCollections();
  const maintenance = useMaintenance();

  const loading =
    communities.loading ||
    atRisk.loading ||
    leasing.loading ||
    collections.loading ||
    maintenance.loading;

  const error =
    communities.error ??
    atRisk.error ??
    leasing.error ??
    collections.error ??
    maintenance.error ??
    null;

  const snapshot = useMemo<AdvisorSnapshot | null>(() => {
    const c = communities.data;
    const r = atRisk.data;
    const l = leasing.data;
    const col = collections.data;
    const m = maintenance.data;
    if (!c || !r || !l || !col || !m) {
      return null;
    }

    const flagged = r.bands["at risk"] + r.bands.critical;
    const ageing: Record<string, number> = {};
    for (const bucket of r.ageing) {
      ageing[bucket.bucket] = Math.round(bucket.balance);
    }

    const low = c.costPerHomeLow;
    const high = c.costPerHomeHigh;
    const place = (row: typeof low) =>
      row
        ? {
            name: row.name,
            city: row.city,
            state: row.state,
            county: row.county,
            costPerHome: Math.round(row.costPerHome),
            taxPerHome: Math.round(row.taxPerHome),
            capexPerHome: Math.round(row.capexPerHome),
          }
        : null;

    return {
      asOfMonth: c.asOfMonth,
      today: l.today,

      portfolio: {
        homes: c.homes,
        occupied: c.occupied,
        vacantOrTurn: c.homes - c.occupied,
        underMarketCount: c.underMarketTotal,
        underMarketMonthly: Math.round(c.gapPerMonthTotal),
        underMarketAnnual: Math.round(c.gapPerMonthTotal * 12),
      },

      communities: {
        total: c.communities,
        majorityUnderMarket: c.majorityUnder,
        belowAdvertisedHomes: c.belowAdvertisedTotal,
        belowAdvertisedCommunities: c.belowAdvertisedCommunities,
        costPerHomeMedian: Math.round(c.costPerHomeMedian),
        taxShareOfCostSpread: Number(c.taxShareOfSpread.toFixed(2)),
        capexShareOfCostSpread: Number(c.capexShareOfSpread.toFixed(2)),
        dearest: place(high),
        cheapest: place(low),
        // Top five by rent forgone. Enough for the model to name a specific
        // community; more would pad the prompt without adding a decision.
        worstGaps: [...c.rows]
          .sort((a, b) => b.gapPerMonth - a.gapPerMonth)
          .slice(0, 5)
          .map((row) => ({
            name: row.name,
            slug: row.slug,
            market: row.market,
            county: row.county,
            homes: row.homes,
            underMarketPct: Number(row.underMarketPct.toFixed(2)),
            gapPerMonth: Math.round(row.gapPerMonth),
            taxPerHome: Math.round(row.taxPerHome),
          })),
      },

      residents: {
        activeLeases: r.scored,
        flagged,
        totalArrears: Math.round(r.totalBalance),
        arrearsHeldByFlagged: Number(r.concentration.toFixed(2)),
        rentExposedMonthly: Math.round(r.rentExposed),
        ageing,
      },

      leasing: {
        renewals12m: l.renewals12m,
        renewalIncreasePct: Number(l.renewalIncreasePct.toFixed(3)),
        marketGrowthPct: Number(l.marketGrowthPct.toFixed(3)),
        retentionPct: Number(l.retentionPct.toFixed(2)),
        churnCost12m: Math.round(l.churnCost),
        renewalUpliftPerYear: Math.round(l.renewalUpliftPerYear),
        pendingMoveIns: l.moveIns.length,
        pendingMoveInRentMonthly: Math.round(l.moveInRentPerMonth),
        vacant: l.vacant,
        inTurn: l.inTurn,
      },

      collections: {
        collectedPct12m: Number(col.collectedPct12m.toFixed(3)),
        onTimePct12m: Number(col.onTimePct12m.toFixed(3)),
        outstanding12m: Math.round(col.outstanding12m),
        worstCalendarMonth:
          col.byCalendarMonth.length > 0
            ? col.byCalendarMonth.reduce((w, x) => (x.onTimePct < w.onTimePct ? x : w)).month
            : null,
        worstOnTimePct:
          col.byCalendarMonth.length > 0
            ? Number(Math.min(...col.byCalendarMonth.map((x) => x.onTimePct)).toFixed(3))
            : null,
        onTimeSpread: Number(col.onTimeSpread.toFixed(3)),
        collectedSpread: Number(col.collectedSpread.toFixed(3)),
      },

      maintenance: {
        landlordCost12m: Math.round(m.landlordCost12m),
        chargedBack12m: Math.round(m.residentChargedBack12m),
        neglectOrders: m.neglectOrders,
        neglectCost3y: Math.round(m.neglectCost),
        neglectCostPerYear: Math.round(m.neglectCost / 3),
        neglectMeanCost: Math.round(m.neglectMeanCost),
        otherHvacMeanCost: Math.round(m.otherHvacMeanCost),
        neglectSharePct: Number(m.neglectSharePct.toFixed(2)),
        filterVisitsBilled: m.filterOrders,
        openWorkOrders: m.openCount,
      },
    };
  }, [communities.data, atRisk.data, leasing.data, collections.data, maintenance.data]);

  return { snapshot, loading, error };
}
