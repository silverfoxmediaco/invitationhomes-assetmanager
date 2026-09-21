/**
 * The at-risk resident score. Rules-based, not a model.
 *
 * A CFO can act on a number they can argue with. The weights below are a
 * judgement call written down in one place, and every scored resident carries
 * the reasons that produced their number, so a property manager can disagree
 * with the score on the specifics rather than on principle.
 *
 * It ships rules-based FIRST on purpose. The data supports training a
 * delinquency model, and a model trained here would score beautifully — because
 * it would be recovering the generator's own rule for who pays late. That
 * accuracy figure would measure nothing about real residents. See the AIP
 * section of ontology-spec.md.
 *
 * Signals and weights, from the spec:
 *
 *   Current arrears  40   oldest ageing bucket carrying a balance
 *   Recent trend     25   late/partial/missed among the last 6 payments
 *   Direction        15   the last 3 payments worse than the 3 before them
 *   Payment ratio    10   share of rent actually paid, inverted
 *   Lease stage      10   rises inside the last 90 days of the lease
 *
 * Bands: 0-24 healthy, 25-49 watch, 50-74 at risk, 75-100 critical.
 *
 * Direction earns its own weight because it is the signal the other four miss.
 * A resident who has always paid on day 3 and a resident who paid on time for a
 * year and has now missed twice can show identical arrears today, and they are
 * not the same problem. One is untidy; the other is going somewhere.
 *
 * Two scoping decisions that are not arbitrary:
 *
 * ARREARS are scoped to the CURRENT lease. A balance left behind on a tenancy
 * that ended two years ago is a write-off, not current arrears, and ageing it
 * forward would pin 40 points on anyone who ever missed a payment.
 *
 * TREND and DIRECTION span ALL leases. A renewal is a new lease, so scoping
 * these to the current one would hand every renewing resident a clean record on
 * the day they sign — which is precisely when their history matters most.
 */

export type Band = "healthy" | "watch" | "at risk" | "critical";
export type AgeBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface ScoredPayment {
  /** ISO yyyy-mm-dd. */
  dueDate: string;
  leaseId: string;
  amountDue: number;
  amountPaid: number;
  status: string;
}

export interface RiskInput {
  /** Every payment we hold for this resident, any order, across all leases. */
  payments: ScoredPayment[];
  /** The lease they are in now. Arrears and payment ratio are scoped to it. */
  currentLeaseId: string;
  /** Contract rent on the current lease. Arrears are read in months of rent,
   *  so the score needs to know what a month costs. */
  monthlyRent: number;
  /** ISO yyyy-mm-dd, the current lease's end date. */
  leaseEndDate: string;
  /** ISO yyyy-mm-dd. Passed in rather than read from the clock so the score is
   *  deterministic and testable, and so the page can date what it shows. */
  asOf: string;
}

export interface RiskResult {
  score: number;
  band: Band;
  /** Unpaid rent on the current lease, in dollars. */
  balance: number;
  /** Oldest bucket carrying a balance. */
  bucket: AgeBucket;
  /** Balance expressed in months of contract rent. */
  monthsOwed: number;
  /** Non-clean payments among the last six, across all leases. */
  recentIssues: number;
  /** True when the last 3 payments are worse than the 3 before them. */
  degrading: boolean;
  paymentRatio: number;
  daysToLeaseEnd: number;
  parts: {
    arrears: number;
    trend: number;
    direction: number;
    ratio: number;
    stage: number;
  };
  /** Plain-language reasons, ordered by how much they contributed. */
  reasons: string[];
}

/**
 * Waived is NOT a missed payment. It is a concession month the company granted,
 * carrying amountDue with amountPaid of 0, and counting it as non-payment would
 * flag residents for a discount their own landlord gave them.
 */
const CLEAN = new Set(["paid", "waived"]);

/** How bad a payment is, for comparing one stretch of history to another. */
function severity(status: string): number {
  switch (status) {
    case "missed":
      return 3;
    case "partial":
      return 2;
    case "late":
      return 1;
    default:
      return 0;
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }
  return Math.round((to - from) / 86_400_000);
}

export function bucketFor(ageDays: number): AgeBucket {
  if (ageDays <= 0) {
    return "current";
  }
  if (ageDays <= 30) {
    return "1-30";
  }
  if (ageDays <= 60) {
    return "31-60";
  }
  if (ageDays <= 90) {
    return "61-90";
  }
  return "90+";
}

const BUCKET_POINTS: Record<AgeBucket, number> = {
  current: 0,
  "1-30": 10,
  "31-60": 20,
  "61-90": 30,
  "90+": 40,
};

const BUCKET_ORDER: AgeBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export function bandFor(score: number): Band {
  if (score >= 75) {
    return "critical";
  }
  if (score >= 50) {
    return "at risk";
  }
  if (score >= 25) {
    return "watch";
  }
  return "healthy";
}

export function scoreResident(input: RiskInput): RiskResult {
  const { payments, currentLeaseId, monthlyRent, leaseEndDate, asOf } = input;

  // Newest first. Every sequence signal below reads from the front.
  const history = [...payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const currentLease = history.filter((p) => p.leaseId === currentLeaseId);

  // --- Current arrears (40) ------------------------------------------------
  // The oldest bucket still carrying a balance, not the newest and not the sum:
  // one payment ninety days unpaid is a worse signal than three that are a
  // fortnight behind, even where the dollars run the other way.
  let balance = 0;
  let worstBucket: AgeBucket = "current";
  for (const p of currentLease) {
    if (p.status === "waived") {
      continue;
    }
    const owed = p.amountDue - p.amountPaid;
    if (owed <= 0) {
      continue;
    }
    balance += owed;
    const b = bucketFor(daysBetween(p.dueDate, asOf));
    if (BUCKET_ORDER.indexOf(b) > BUCKET_ORDER.indexOf(worstBucket)) {
      worstBucket = b;
    }
  }

  // The age bucket alone says nothing about size, and on real ledgers that is
  // the difference between a risk and a rounding error. A resident who short-
  // paid one month by $400 and a resident three whole months behind both land
  // in 90+, and scoring them identically flagged reliable residents for a
  // residual they left behind last year. Arrears are therefore read in MONTHS
  // OF RENT and saturate at one: a full month unpaid earns the bucket's whole
  // weight, and a sixth of a month earns a sixth of it.
  const monthsOwed = monthlyRent > 0 ? balance / monthlyRent : 0;
  const materiality = Math.min(1, monthsOwed);
  const arrearsPoints = BUCKET_POINTS[worstBucket] * materiality;

  // --- Recent trend (25) ---------------------------------------------------
  const lastSix = history.slice(0, 6);
  const recentIssues = lastSix.filter((p) => !CLEAN.has(p.status)).length;
  const trendPoints = lastSix.length ? (recentIssues / lastSix.length) * 25 : 0;

  // --- Direction (15) ------------------------------------------------------
  // Needs six payments to compare three against three. With fewer there is no
  // direction to read, and guessing one from a two-month record would flag
  // residents for being new.
  //
  // The comparison needs a threshold, not just "worse". Reading it as any
  // increase at all fired on one payment three days late after a clean year,
  // which is not a direction, it is a Tuesday. A gap of 2 is the smallest
  // move that cannot be a single late payment: it takes a partial, a missed,
  // or two lates where there were none.
  const DEGRADING_GAP = 2;
  const recentThree = history.slice(0, 3);
  const priorThree = history.slice(3, 6);
  const sev = (rows: ScoredPayment[]) => rows.reduce((s, p) => s + severity(p.status), 0);
  const degrading =
    priorThree.length === 3 && sev(recentThree) - sev(priorThree) >= DEGRADING_GAP;
  const directionPoints = degrading ? 15 : 0;

  // --- Payment ratio (10) --------------------------------------------------
  // Waived months leave both sides of the ratio: nothing was owed, so nothing
  // being paid is not a shortfall.
  let due = 0;
  let paid = 0;
  for (const p of currentLease) {
    if (p.status === "waived") {
      continue;
    }
    due += p.amountDue;
    paid += p.amountPaid;
  }
  const paymentRatio = due > 0 ? paid / due : 1;
  const ratioPoints = Math.max(0, Math.min(10, (1 - paymentRatio) * 10));

  // --- Lease stage (10) ----------------------------------------------------
  // Exposure concentrates at renewal: a resident in arrears with eight months
  // to run is a collections problem, and the same resident three weeks from
  // expiry is a decision about whether to renew at all.
  const daysToLeaseEnd = daysBetween(asOf, leaseEndDate);
  const stagePoints =
    daysToLeaseEnd <= 0 ? 10 : daysToLeaseEnd >= 90 ? 0 : (10 * (90 - daysToLeaseEnd)) / 90;

  const parts = {
    arrears: arrearsPoints,
    trend: trendPoints,
    direction: directionPoints,
    ratio: ratioPoints,
    stage: stagePoints,
  };
  const score = Math.round(
    Math.min(100, parts.arrears + parts.trend + parts.direction + parts.ratio + parts.stage)
  );

  const reasons: string[] = [];
  if (arrearsPoints > 0) {
    const owed = `${monthsOwed.toFixed(1)} months' rent`;
    reasons.push(
      worstBucket === "90+"
        ? `${owed} outstanding, more than 90 days past due`
        : `${owed} outstanding, ${worstBucket} days past due`
    );
  }
  if (degrading) {
    reasons.push("Payment behavior worsening over the last 3 months");
  }
  if (recentIssues > 0) {
    reasons.push(
      `${recentIssues} of the last ${lastSix.length} payments late, partial or missed`
    );
  }
  if (ratioPoints > 1) {
    reasons.push(`Only ${Math.round(paymentRatio * 100)}% of rent collected on this lease`);
  }
  if (daysToLeaseEnd <= 90) {
    reasons.push(
      daysToLeaseEnd <= 0
        ? "Lease has passed its end date"
        : `Lease ends in ${daysToLeaseEnd} days`
    );
  }
  if (reasons.length === 0) {
    reasons.push("No arrears and no recent payment issues");
  }

  return {
    score,
    band: bandFor(score),
    balance,
    bucket: worstBucket,
    monthsOwed,
    recentIssues,
    degrading,
    paymentRatio,
    daysToLeaseEnd,
    parts,
    reasons,
  };
}
