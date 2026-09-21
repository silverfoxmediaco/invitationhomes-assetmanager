import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bandFor, bucketFor, scoreResident, type ScoredPayment } from "./riskScore";

/**
 * Two kinds of test here, and the second is the one that matters.
 *
 * The unit tests pin the arithmetic. The cohort test runs the real score over
 * the real generated CSVs and asks whether it actually finds the residents the
 * generator made degrade — which is the single reason
 * `syntheticProfileGroundTruth` exists. A scoring function that compiles, runs
 * and ranks nobody useful would pass every unit test in this file.
 *
 * The ground truth is read ONLY here. It is not a feature, not a column, and
 * not a filter. A model that sees it scores perfectly by reading the answer.
 */

const DATA = join(__dirname, "../../../data/generated");

function readCsv(name: string): Record<string, string>[] {
  const text = readFileSync(join(DATA, name), "utf8").trim();
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((line) => {
    // The generator quotes nothing that contains a comma in these five files;
    // a naive split is safe here and this is a test, not the read path.
    const cells = line.split(",");
    const row: Record<string, string> = {};
    cols.forEach((c, i) => {
      row[c] = cells[i] ?? "";
    });
    return row;
  });
}

describe("scoreResident", () => {
  const clean = (dueDate: string, leaseId = "L1"): ScoredPayment => ({
    dueDate,
    leaseId,
    amountDue: 2000,
    amountPaid: 2000,
    status: "paid",
  });

  it("scores a spotless resident mid-lease as healthy", () => {
    const r = scoreResident({
      payments: [
        clean("2026-09-01"),
        clean("2026-08-01"),
        clean("2026-07-01"),
        clean("2026-06-01"),
        clean("2026-05-01"),
        clean("2026-04-01"),
      ],
      currentLeaseId: "L1",
      monthlyRent: 2000,
      leaseEndDate: "2027-04-01",
      asOf: "2026-09-01",
    });
    expect(r.score).toBe(0);
    expect(r.band).toBe("healthy");
    expect(r.balance).toBe(0);
  });

  it("does not treat a waived concession month as non-payment", () => {
    const waived: ScoredPayment = {
      dueDate: "2026-09-01",
      leaseId: "L1",
      amountDue: 2000,
      amountPaid: 0,
      status: "waived",
    };
    const r = scoreResident({
      payments: [waived, clean("2026-08-01"), clean("2026-07-01"), clean("2026-06-01")],
      currentLeaseId: "L1",
      monthlyRent: 2000,
      leaseEndDate: "2027-06-01",
      asOf: "2026-09-01",
    });
    expect(r.balance).toBe(0);
    expect(r.paymentRatio).toBe(1);
    expect(r.band).toBe("healthy");
  });

  it("ages arrears to the oldest bucket carrying a balance", () => {
    const missed: ScoredPayment = {
      dueDate: "2026-05-01",
      leaseId: "L1",
      amountDue: 2000,
      amountPaid: 0,
      status: "missed",
    };
    const r = scoreResident({
      payments: [clean("2026-09-01"), clean("2026-08-01"), missed],
      currentLeaseId: "L1",
      monthlyRent: 2000,
      leaseEndDate: "2027-05-01",
      asOf: "2026-09-01",
    });
    expect(r.bucket).toBe("90+");
    expect(r.parts.arrears).toBe(40);
    expect(r.balance).toBe(2000);
  });

  it("separates a degrading resident from a consistently untidy one", () => {
    const late = (dueDate: string): ScoredPayment => ({
      dueDate,
      leaseId: "L1",
      amountDue: 2000,
      amountPaid: 2000,
      status: "late",
    });
    const months = [
      "2026-09-01",
      "2026-08-01",
      "2026-07-01",
      "2026-06-01",
      "2026-05-01",
      "2026-04-01",
    ];

    // Always three days late, every month, for six months.
    const untidy = scoreResident({
      payments: months.map(late),
      currentLeaseId: "L1",
      monthlyRent: 2000,
      leaseEndDate: "2027-04-01",
      asOf: "2026-09-01",
    });

    // Clean for three months, then slipping.
    const slipping = scoreResident({
      payments: [
        { dueDate: "2026-09-01", leaseId: "L1", amountDue: 2000, amountPaid: 0, status: "missed" },
        { dueDate: "2026-08-01", leaseId: "L1", amountDue: 2000, amountPaid: 900, status: "partial" },
        late("2026-07-01"),
        clean("2026-06-01"),
        clean("2026-05-01"),
        clean("2026-04-01"),
      ],
      currentLeaseId: "L1",
      monthlyRent: 2000,
      leaseEndDate: "2027-04-01",
      asOf: "2026-09-01",
    });

    expect(untidy.degrading).toBe(false);
    expect(slipping.degrading).toBe(true);
    expect(slipping.score).toBeGreaterThan(untidy.score);
  });

  it("reads direction across a renewal, not just the current lease", () => {
    // Renewed last month. The two leases together tell the story; the new lease
    // on its own says nothing at all.
    const r = scoreResident({
      payments: [
        { dueDate: "2026-09-01", leaseId: "L2", amountDue: 2000, amountPaid: 0, status: "missed" },
        { dueDate: "2026-08-01", leaseId: "L1", amountDue: 2000, amountPaid: 900, status: "partial" },
        { dueDate: "2026-07-01", leaseId: "L1", amountDue: 2000, amountPaid: 2000, status: "late" },
        clean("2026-06-01"),
        clean("2026-05-01"),
        clean("2026-04-01"),
      ],
      currentLeaseId: "L2",
      monthlyRent: 2000,
      leaseEndDate: "2027-09-01",
      asOf: "2026-09-01",
    });
    expect(r.degrading).toBe(true);
    // Arrears are scoped to the new lease, so only the missed month counts.
    expect(r.balance).toBe(2000);
  });

  it("does not call a brand-new resident degrading", () => {
    const r = scoreResident({
      payments: [clean("2026-09-01"), clean("2026-08-01")],
      currentLeaseId: "L1",
      monthlyRent: 2000,
      leaseEndDate: "2027-08-01",
      asOf: "2026-09-01",
    });
    expect(r.degrading).toBe(false);
  });

  it("raises lease stage as the end date approaches", () => {
    const at = (leaseEndDate: string) =>
      scoreResident({
        payments: [clean("2026-09-01")],
        currentLeaseId: "L1",
        monthlyRent: 2000,
        leaseEndDate,
        asOf: "2026-09-01",
      }).parts.stage;
    expect(at("2027-03-01")).toBe(0);
    expect(at("2026-10-16")).toBeGreaterThan(0);
    expect(at("2026-09-15")).toBeGreaterThan(at("2026-10-16"));
    expect(at("2026-08-01")).toBe(10);
  });

  it("maps buckets and bands at their boundaries", () => {
    expect(bucketFor(0)).toBe("current");
    expect(bucketFor(1)).toBe("1-30");
    expect(bucketFor(30)).toBe("1-30");
    expect(bucketFor(31)).toBe("31-60");
    expect(bucketFor(91)).toBe("90+");
    expect(bandFor(24)).toBe("healthy");
    expect(bandFor(25)).toBe("watch");
    expect(bandFor(50)).toBe("at risk");
    expect(bandFor(75)).toBe("critical");
  });
});

describe("the score against the generator's answer key", () => {
  // Mirrors what the dashboard does: active leases only, and only the payments
  // inside the trailing 12-month window the hook fetches.
  const leases = readCsv("leases.csv");
  const payments = readCsv("rent_payments.csv");
  const residents = readCsv("residents.csv");

  const asOf = payments.reduce((max, p) => (p.dueDate > max ? p.dueDate : max), "");
  const windowStart = `${Number(asOf.slice(0, 4)) - 1}-${asOf.slice(5, 7)}-01`;

  const activeByResident = new Map<string, Record<string, string>>();
  for (const l of leases) {
    if (l.status === "active") {
      activeByResident.set(l.residentId, l);
    }
  }

  const byResident = new Map<string, ScoredPayment[]>();
  for (const p of payments) {
    if (p.dueDate < windowStart) {
      continue;
    }
    if (!activeByResident.has(p.residentId)) {
      continue;
    }
    const list = byResident.get(p.residentId) ?? [];
    list.push({
      dueDate: p.dueDate,
      leaseId: p.leaseId,
      amountDue: Number(p.amountDue),
      amountPaid: Number(p.amountPaid),
      status: p.status,
    });
    byResident.set(p.residentId, list);
  }

  const truth = new Map(residents.map((r) => [r.residentId, r.syntheticProfileGroundTruth]));

  const scored = [...activeByResident.entries()].map(([residentId, lease]) => ({
    residentId,
    truth: truth.get(residentId) ?? "unknown",
    ...scoreResident({
      payments: byResident.get(residentId) ?? [],
      currentLeaseId: lease.leaseId,
      monthlyRent: Number(lease.monthlyRent),
      leaseEndDate: lease.endDate,
      asOf,
    }),
  }));

  const flagged = scored.filter((s) => s.band === "at risk" || s.band === "critical");
  const troubled = new Set(["degrading", "severe"]);
  const sum = (rows: typeof scored) => rows.reduce((t, s) => t + s.balance, 0);

  it("has a resident population to score", () => {
    expect(scored.length).toBeGreaterThan(2_000);
  });

  it("flags a cohort small enough to be worth a person's morning", () => {
    // A risk list nobody can work through is a risk list nobody works through.
    const share = flagged.length / scored.length;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.15);
  });

  it("concentrates the money: a twentieth of residents, half the arrears", () => {
    // The test that decides whether the list is worth opening. Precision
    // against the label is interesting; this is what a controller cares about.
    const concentration = sum(flagged) / sum(scored);
    expect(flagged.length / scored.length).toBeLessThan(0.08);
    expect(concentration).toBeGreaterThan(0.4);
  });

  it("puts genuinely troubled residents at the top of the list", () => {
    // Precision is measured at the TOP, not across the whole flagged set,
    // because that is how the list gets used: someone works down it from the
    // top and stops when the morning ends.
    const top50 = [...scored].sort((a, b) => b.score - a.score).slice(0, 50);
    const hits = top50.filter((s) => troubled.has(s.truth)).length;
    expect(hits).toBeGreaterThanOrEqual(35);
    expect(top50.filter((s) => s.truth === "severe").length).toBeGreaterThan(0);
  });

  it("ranks the four generated profiles in order", () => {
    const mean = (label: string) => {
      const rows = scored.filter((s) => s.truth === label);
      return rows.reduce((t, s) => t + s.score, 0) / (rows.length || 1);
    };
    expect(mean("reliable")).toBeLessThan(mean("occasionally_late"));
    expect(mean("occasionally_late")).toBeLessThan(mean("degrading"));
    expect(mean("degrading")).toBeLessThan(mean("severe"));
    // Degrading residents must clear the occasionally-late ones by a real
    // margin, not a rounding error, or the Direction and Trend weights are
    // decoration.
    expect(mean("degrading") - mean("occasionally_late")).toBeGreaterThan(5);
  });

  it("mostly leaves reliable residents alone", () => {
    // Not zero, and it should not be. The generator gives reliable residents
    // real missed payments too, and one of those sitting unpaid for three
    // months is a resident to call regardless of the label on them.
    const reliable = scored.filter((s) => s.truth === "reliable");
    const falseAlarms = reliable.filter((s) => s.band === "at risk" || s.band === "critical");
    expect(falseAlarms.length / reliable.length).toBeLessThan(0.03);
    // Every one of them should be flagged for money actually outstanding.
    expect(falseAlarms.every((s) => s.balance > 0)).toBe(true);
  });

  it("detects the degrading cohort more often than it misfires", () => {
    // Direction is a weak signal inside a 12-month window: the generator
    // slides these residents downhill over three years, so a 3-against-3
    // comparison sees only the sharp slips. It stays because the ratio is
    // real, but it is not the weight carrying this score — Trend is.
    const rate = (label: string) => {
      const rows = scored.filter((s) => s.truth === label);
      return rows.filter((s) => s.degrading).length / (rows.length || 1);
    };
    expect(rate("degrading")).toBeGreaterThan(rate("reliable") * 3);
  });
});
