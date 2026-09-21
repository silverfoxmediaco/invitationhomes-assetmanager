import { useEffect, useState } from "react";
import { useOsdkClient } from "@osdk/react";
import {
  Leases,
  Properties,
  RentPayments,
  Residents,
} from "@invitation-homes-asset-management/sdk";
import { fetchAll, fetchWhere } from "./fetchAll";
import { bucketFor, scoreResident, type AgeBucket, type Band, type RiskResult } from "./riskScore";

/**
 * Who is behind, who is sliding, and what it is worth.
 *
 * This is the second question the ontology was built to answer, and the one
 * a single system genuinely cannot. A ledger knows a payment is short. A
 * property management system knows whose lease ends in six weeks. Neither
 * knows that the resident who short-paid in March is the same person renewing
 * in November, because a renewal writes a NEW lease and the payment history
 * lives under the old one. Resident is what stitches those together.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS BELONGS, AND WHY IT IS HERE INSTEAD
 *
 * Scoring 2,760 residents against 33,000 payments is a pipeline job. In a
 * production build it would be a Foundry transform writing `riskScore` and
 * `riskBand` back onto Resident, computed once and read by everything: the
 * dashboard, an AIP agent, a scheduled export. Doing it in the browser means
 * every viewer recomputes it, and the score cannot be queried or alerted on.
 *
 * It is in the browser because the scoring rules are still being argued about,
 * and a rule you can edit and reload in two seconds gets argued about honestly.
 * Once the weights settle it moves server-side. The score is already a pure
 * function in riskScore.ts precisely so that move is a transplant, not a
 * rewrite.
 *
 * ---------------------------------------------------------------------------
 * THE TWELVE-MONTH WINDOW
 *
 * Payments are read for the trailing 13 months, not all three years. The full
 * table is 95,000 rows and pulling it into a browser to compute five numbers
 * per resident is indefensible.
 *
 * What the window costs is honest to state: the generator slides its degrading
 * residents downhill over three years, and a 12-month view sees the recent
 * stretch of that slide rather than its whole arc. Measured against the
 * generator's own labels, Direction catches roughly a fifth of them. Trend and
 * arrears carry the score; Direction adds the sharp slips. A server-side
 * implementation would read the whole history and Direction would get stronger.
 */

export interface AtRiskRow {
  residentId: string;
  displayName: string;
  propertyId: string;
  streetAddress: string;
  city: string;
  state: string;
  leaseId: string;
  monthlyRent: number;
  leaseEndDate: string;
  risk: RiskResult;
}

export interface Delinquency {
  bucket: AgeBucket;
  residents: number;
  balance: number;
}

export interface AtRisk {
  /** Every resident in an active lease, scored, worst first. */
  rows: AtRiskRow[];
  scored: number;
  /** Counts by band, healthy through critical. */
  bands: Record<Band, number>;
  /** Rent outstanding across every active lease. */
  totalBalance: number;
  /** Share of that balance held by residents scored at risk or critical. */
  concentration: number;
  /** Monthly rent under leases held by at-risk and critical residents. */
  rentExposed: number;
  /** Delinquency ageing, oldest bucket carrying each resident's balance. */
  ageing: Delinquency[];
  /** ISO date of the newest payment in the data. */
  dataThrough: string;
  /** Days between that and today. Large means the ledger is stale. */
  staleDays: number;
  asOf: string;
}

type LeaseRow = {
  leaseId: string;
  propertyId: string;
  residentId: string;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  status: string;
};
type PaymentRow = {
  leaseId: string;
  residentId: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: string;
};
type ResidentRow = { residentId: string; displayName: string };
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Thirteen months back from today, as a bare yyyy-mm-dd. Thirteen rather than
 * twelve so a full twelve months survives a month boundary.
 *
 * The format is not a style choice. `dueDate` is a LocalDate in the ontology,
 * and a LocalDate has no timezone: appending `T00:00:00Z` to be careful about
 * one is rejected outright with InvalidPropertyValue. The generated SDK types
 * it `datetime`, which is what sent this down the wrong road — the SDK's
 * TypeScript type and the ontology's base type disagree, and the ontology is
 * the one that answers the request. CLAUDE.md records the same trap on action
 * parameters; it applies to read filters too.
 */
function windowStart(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 13);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.round((b - a) / 86_400_000);
}

const BUCKETS: AgeBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export function useAtRisk(): { data: AtRisk | null; loading: boolean; error: Error | null } {
  const client = useOsdkClient();
  const [data, setData] = useState<AtRisk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [leases, payments, residents, properties] = await Promise.all([
          // EVERY lease, not just the active ones. Two reasons: a resident's
          // history spans their renewals, and the lease — not the payment —
          // is the authority on who was living there.
          fetchAll<LeaseRow>(client, Leases, {
            select: [
              "leaseId",
              "propertyId",
              "residentId",
              "monthlyRent",
              "startDate",
              "endDate",
              "status",
            ],
          }),
          fetchWhere<PaymentRow>(
            client,
            RentPayments,
            { dueDate: { $gte: windowStart() } },
            {
              select: ["leaseId", "residentId", "dueDate", "amountDue", "amountPaid", "status"],
            }
          ),
          fetchAll<ResidentRow>(client, Residents, {
            // syntheticProfileGroundTruth is NOT selected, here or anywhere in
            // the read path. It is the generator's answer key. A score that can
            // see it is not a score, and a column that exposes it will end up
            // in someone's training set.
            select: ["residentId", "displayName"],
          }),
          fetchAll<PropertyRow>(client, Properties, {
            select: ["propertyId", "streetAddress", "city", "state"],
          }),
        ]);

        if (cancelled) {
          return;
        }

        const residentName = new Map(residents.map((r) => [r.residentId, r.displayName]));
        const propertyById = new Map(properties.map((p) => [p.propertyId, p]));
        const leaseById = new Map(leases.map((l) => [l.leaseId, l]));
        const activeLeases = leases.filter((l) => l.status === "active");

        // Payments are grouped by LEASE, and the resident is then read off the
        // lease. Not off the payment's own residentId — that field is a
        // denormalization for convenience, and a denormalized key is only as
        // good as the last upload that wrote it. This join goes through the
        // object that owns the fact.
        const paymentsByLease = new Map<string, PaymentRow[]>();
        let dataThrough = "";
        let inTerm = 0;
        let outOfTerm = 0;
        let orphaned = 0;

        for (const p of payments) {
          const due = iso(p.dueDate);
          if (due > dataThrough) {
            dataThrough = due;
          }

          // Integrity check, counted as we go because it is free here and the
          // alternative is a page that quietly reports the wrong number. A
          // payment has to fall inside the term of the lease it belongs to.
          const lease = leaseById.get(p.leaseId);
          if (!lease) {
            orphaned++;
          } else if (due >= iso(lease.startDate) && due <= iso(lease.endDate)) {
            inTerm++;
          } else {
            outOfTerm++;
          }

          const list = paymentsByLease.get(p.leaseId);
          if (list) {
            list.push(p);
          } else {
            paymentsByLease.set(p.leaseId, [p]);
          }
        }

        // Fail loudly rather than render. This exact situation — a rent ledger
        // uploaded from one generation of the data sitting beside leases from
        // another — produced a page reading "$2,940 outstanding" across 2,760
        // homes, with no error anywhere, when the real figure was over a
        // million. Nothing throws on data that is valid and wrong, so the
        // check has to be explicit.
        const checked = inTerm + outOfTerm + orphaned;
        const consistent = checked > 0 ? inTerm / checked : 1;
        if (checked > 0 && consistent < 0.9) {
          throw new Error(
            `The rent ledger does not line up with the leases: ${Math.round(
              (1 - consistent) * 100
            )}% of payments fall outside the term of the lease they belong to ` +
              `(${outOfTerm.toLocaleString()} out of term, ${orphaned.toLocaleString()} ` +
              `pointing at a lease that does not exist). These datasets came from ` +
              `different generations of the synthetic data. Re-upload rent_payments.csv ` +
              `before trusting anything on this page.`
          );
        }

        // A resident's history is every payment across every lease they have
        // held. A renewal writes a new lease, so scoping to the current one
        // would hand each renewing resident a spotless record on signing day.
        const paymentsByResident = new Map<string, PaymentRow[]>();
        for (const [leaseId, rows] of paymentsByLease) {
          const lease = leaseById.get(leaseId);
          if (!lease) {
            continue;
          }
          const list = paymentsByResident.get(lease.residentId);
          if (list) {
            list.push(...rows);
          } else {
            paymentsByResident.set(lease.residentId, [...rows]);
          }
        }

        // Arrears age against today, not against the newest row in the data: a
        // debt gets older whether or not anyone refreshes the dataset. The
        // trade is that a stale ledger would quietly age every resident into
        // 90+, so staleDays is carried out to the page and shown.
        const asOf = todayIso();
        const staleDays = dataThrough ? daysBetween(dataThrough, asOf) : 0;

        const rows: AtRiskRow[] = [];
        for (const lease of activeLeases) {
          const property = propertyById.get(lease.propertyId);
          const history = paymentsByResident.get(lease.residentId) ?? [];

          const risk = scoreResident({
            payments: history.map((p) => ({
              dueDate: iso(p.dueDate),
              leaseId: p.leaseId,
              amountDue: p.amountDue,
              amountPaid: p.amountPaid,
              status: p.status,
            })),
            currentLeaseId: lease.leaseId,
            monthlyRent: lease.monthlyRent,
            leaseEndDate: iso(lease.endDate),
            asOf,
          });

          rows.push({
            residentId: lease.residentId,
            displayName: residentName.get(lease.residentId) ?? lease.residentId,
            propertyId: lease.propertyId,
            streetAddress: property?.streetAddress ?? "",
            city: property?.city ?? "",
            state: property?.state ?? "",
            leaseId: lease.leaseId,
            monthlyRent: lease.monthlyRent,
            leaseEndDate: iso(lease.endDate),
            risk,
          });
        }

        rows.sort((a, b) => b.risk.score - a.risk.score || b.risk.balance - a.risk.balance);

        const bands: Record<Band, number> = {
          healthy: 0,
          watch: 0,
          "at risk": 0,
          critical: 0,
        };
        const ageing = new Map<AgeBucket, Delinquency>(
          BUCKETS.map((b) => [b, { bucket: b, residents: 0, balance: 0 }])
        );

        let totalBalance = 0;
        let flaggedBalance = 0;
        let rentExposed = 0;

        for (const r of rows) {
          bands[r.risk.band]++;
          totalBalance += r.risk.balance;
          if (r.risk.band === "at risk" || r.risk.band === "critical") {
            flaggedBalance += r.risk.balance;
            rentExposed += r.monthlyRent;
          }
          if (r.risk.balance > 0) {
            const entry = ageing.get(r.risk.bucket);
            if (entry) {
              entry.residents++;
              entry.balance += r.risk.balance;
            }
          }
        }

        setData({
          rows,
          scored: rows.length,
          bands,
          totalBalance,
          concentration: totalBalance > 0 ? flaggedBalance / totalBalance : 0,
          rentExposed,
          ageing: BUCKETS.map((b) => ageing.get(b)!).filter((d) => d.bucket !== "current"),
          dataThrough,
          staleDays,
          asOf,
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

export { bucketFor };
