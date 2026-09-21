import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Properties,
  Communities,
  Leases,
  RentPayments,
  MaintenanceWorkOrders,
  Expenses,
  TaxAssessments,
  TaxBills,
  MarketRateComps,
  Residents,
} from "@invitation-homes-asset-management/sdk";
import { fetchWhere } from "./fetchAll";

/**
 * Everything about one home, and the answer to the second half of the thesis.
 *
 * The overview says a home is under market. This says whether that matters:
 * a home $300 below market that costs nothing to run is a pricing decision,
 * and the same home carrying $9,000 of maintenance and a 12% reassessment is
 * a different conversation entirely.
 *
 * Costs are LANDLORD costs. Work orders the resident is responsible for are
 * counted and shown, but kept out of the cost total — lawn care, pest control
 * and air filters are theirs under Invitation Homes' published split, and
 * folding them in would overstate what the home actually costs to own.
 */

export interface PropertyDetail {
  property: {
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
    marketRent: number;
    acquisitionDate: string;
    acquisitionPrice: number;
    communitySlug: string;
  };
  communityName: string;
  market: string;
  county: string;

  /** Rent side */
  contractRent: number | null;
  marketMedian: number | null;
  gapPerMonth: number | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  residentName: string | null;
  residentId: string | null;

  /** Cost side, trailing 12 months */
  maintenanceLandlord: number;
  maintenanceResident: number;
  workOrderCount: number;
  neglectCount: number;
  expenses12m: number;
  /** Episodic capital spend, split out: it is most of the expense line and it
   *  is not a run rate. The community pages split it the same way. */
  capex12m: number;
  taxAnnual: number;
  taxLatest: number | null;
  taxChangePct: number | null;
  appealStatus: string | null;

  /** Net */
  annualRent: number | null;
  annualCost: number;
  netPerYear: number | null;

  /** Payment behaviour on the current lease */
  paymentsOnTime: number;
  paymentsLate: number;
  paymentsMissed: number;

  workOrders: {
    workOrderId: string;
    category: string;
    responsibility: string;
    openedDate: string;
    closedDate: string;
    cost: number;
    contributingNeglect: boolean;
  }[];
}

type WO = {
  workOrderId: string;
  propertyId: string;
  category: string;
  responsibility: string;
  chargedToResident: boolean;
  contributingNeglect: boolean;
  openedDate: string;
  closedDate: string;
  cost: number;
};

const iso = (d: unknown): string =>
  typeof d === "string" ? d.slice(0, 10) : d instanceof Date ? d.toISOString().slice(0, 10) : "";

export function useProperty(propertyId: string | undefined): {
  data: PropertyDetail | null;
  loading: boolean;
  error: Error | null;
} {
  const client = useOsdkClient();
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!propertyId) {
      return;
    }
    let cancelled = false;
    setLoading(true);

    // Captured so TypeScript keeps the narrowing from the guard above inside
    // the async closure.
    const id: string = propertyId;

    (async () => {
      try {
        const property = await client(Properties).fetchOne(id);
        if (cancelled) {
          return;
        }

        // Server-side filters. Every one of these object types is far too
        // large to pull across the wire for a single home: 95,467 rent
        // payments, 81,548 expenses, 26,477 work orders. The filter runs in
        // Foundry and what comes back is only this property's rows.
        const pid = { propertyId: { $eq: id } };
        const [community, leases, workOrders, expenses, assessments, bills, comps] = await Promise.all([
          // Every property has a community, but the SDK types every property
          // as optional, so this is a type guard rather than a real case.
          property.communitySlug
            ? client(Communities).fetchOne(property.communitySlug).catch(() => null)
            : Promise.resolve(null),
          fetchWhere<{ leaseId: string; propertyId: string; residentId: string; monthlyRent: number; startDate: string; endDate: string; status: string }>(
            client, Leases, pid,
            { select: ["leaseId", "propertyId", "residentId", "monthlyRent", "startDate", "endDate", "status"] }
          ),
          fetchWhere<WO>(client, MaintenanceWorkOrders, pid, {
            select: ["workOrderId", "propertyId", "category", "responsibility", "chargedToResident", "contributingNeglect", "openedDate", "closedDate", "cost"],
          }),
          fetchWhere<{ propertyId: string; amount: number; date: string; scope: string; category: string }>(
            client, Expenses, pid, { select: ["propertyId", "amount", "date", "scope", "category"] }
          ),
          fetchWhere<{ propertyId: string; taxYear: number; assessedValue: number; changePct: number; appealStatus: string }>(
            client, TaxAssessments, pid,
            { select: ["propertyId", "taxYear", "assessedValue", "changePct", "appealStatus"] }
          ),
          fetchWhere<{ propertyId: string; taxYear: number; amountDue: number; status: string }>(
            client, TaxBills, pid, { select: ["propertyId", "taxYear", "amountDue", "status"] }
          ),
          // Comps are keyed on city/beds, not property, so this one filters on
          // those instead. 36 months for one city and bed count is ~36 rows.
          fetchWhere<{ city: string; state: string; beds: number; month: string; medianRent: number }>(
            client, MarketRateComps,
            { city: { $eq: property.city }, state: { $eq: property.state }, beds: { $eq: property.beds } },
            { select: ["city", "state", "beds", "month", "medianRent"] }
          ),
        ]);

        if (cancelled) {
          return;
        }

        const mine = leases;
        const active = mine.find((l) => l.status === "active") ?? null;

        let residentName: string | null = null;
        if (active?.residentId) {
          const r = await client(Residents).fetchOne(active.residentId).catch(() => null);
          residentName = (r?.displayName as string) ?? null;
        }
        if (cancelled) {
          return;
        }

        const asOfMonth = comps.reduce((max, c) => (c.month > max ? c.month : max), "");
        const marketMedian =
          comps.find(
            (c) =>
              c.month === asOfMonth &&
              c.city === property.city &&
              c.state === property.state &&
              c.beds === property.beds
          )?.medianRent ?? null;

        const myWos = workOrders;
        const landlordWos = myWos.filter((w) => w.responsibility === "landlord");
        const residentWos = myWos.filter((w) => w.responsibility === "resident");

        const myExpenses = expenses.filter((e) => e.scope === "property");

        // Trailing twelve months from the newest month the comps cover, so the
        // cost window and the rent benchmark describe the same period.
        const cutoff = `${Number(asOfMonth.slice(0, 4)) - 1}-${asOfMonth.slice(5, 7)}-01`;
        const recent = <T extends { openedDate?: string; date?: string }>(rows: T[], key: "openedDate" | "date") =>
          rows.filter((r) => iso(r[key]) >= cutoff);

        const maintenanceLandlord = recent(landlordWos, "openedDate").reduce((s, w) => s + w.cost, 0);
        const maintenanceResident = recent(residentWos, "openedDate").reduce((s, w) => s + w.cost, 0);
        const recentExpenses = recent(myExpenses, "date");
        const capex12m = recentExpenses
          .filter((e) => e.category === "CapEx")
          .reduce((s, e) => s + e.amount, 0);
        const expenses12m = recentExpenses
          .filter((e) => e.category !== "CapEx")
          .reduce((s, e) => s + e.amount, 0);

        const myAssessments = [...assessments].sort((a, b) => b.taxYear - a.taxYear);
        const latestAssessment = myAssessments[0] ?? null;

        let onTime = 0;
        let late = 0;
        let missed = 0;
        if (active) {
          const payments = await fetchWhere<{ leaseId: string; status: string }>(
            client, RentPayments, { leaseId: { $eq: active.leaseId } },
            { select: ["leaseId", "status"] }
          );
          if (cancelled) {
            return;
          }
          for (const p of payments) {
            if (p.status === "paid" || p.status === "waived") {
              onTime++;
            } else if (p.status === "missed") {
              missed++;
            } else {
              late++;
            }
          }
        }

        // Most recent tax bill. Property tax sits in neither the maintenance
        // nor the expense totals, so it has to be added explicitly — an
        // earlier version left a placeholder here that added zero, which
        // quietly understated the cost of every home by its whole tax bill.
        const latestBill = [...bills].sort((a, b) => b.taxYear - a.taxYear)[0] ?? null;
        const taxAnnual = latestBill?.amountDue ?? 0;

        const annualRent = active ? active.monthlyRent * 12 : null;
        const annualCost = maintenanceLandlord + capex12m + expenses12m + taxAnnual;

        setData({
          property: {
            propertyId: property.propertyId as string,
            streetAddress: property.streetAddress as string,
            city: property.city as string,
            state: property.state as string,
            zip: property.zip as number,
            beds: property.beds as number,
            baths: property.baths as number,
            sqft: property.sqft as number,
            yearBuilt: property.yearBuilt as number,
            status: property.status as string,
            marketRent: property.marketRent as number,
            acquisitionDate: iso(property.acquisitionDate),
            acquisitionPrice: property.acquisitionPrice as number,
            communitySlug: property.communitySlug as string,
          },
          communityName: (community?.communityName as string) ?? property.communitySlug,
          market: (community?.market as string) ?? "",
          county: (community?.county as string) ?? "",
          contractRent: active?.monthlyRent ?? null,
          marketMedian,
          gapPerMonth: active && marketMedian != null ? marketMedian - active.monthlyRent : null,
          leaseStart: active ? iso(active.startDate) : null,
          leaseEnd: active ? iso(active.endDate) : null,
          residentName,
          residentId: active?.residentId ?? null,
          maintenanceLandlord,
          maintenanceResident,
          workOrderCount: myWos.length,
          neglectCount: myWos.filter((w) => w.contributingNeglect).length,
          expenses12m,
          capex12m,
          taxAnnual,
          taxLatest: latestAssessment?.assessedValue ?? null,
          taxChangePct: latestAssessment?.changePct ?? null,
          appealStatus: latestAssessment?.appealStatus ?? null,
          annualRent,
          annualCost,
          netPerYear: annualRent != null ? annualRent - annualCost : null,
          paymentsOnTime: onTime,
          paymentsLate: late,
          paymentsMissed: missed,
          workOrders: myWos
            .sort((a, b) => iso(b.openedDate).localeCompare(iso(a.openedDate)))
            .slice(0, 20)
            .map((w) => ({
              workOrderId: w.workOrderId,
              category: w.category,
              responsibility: w.responsibility,
              openedDate: iso(w.openedDate),
              closedDate: iso(w.closedDate),
              cost: w.cost,
              contributingNeglect: w.contributingNeglect,
            })),
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
  }, [client, propertyId]);

  return { data, loading, error };
}
