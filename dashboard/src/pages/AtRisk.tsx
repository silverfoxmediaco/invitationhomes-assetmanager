import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAtRisk } from "@/data/useAtRisk";
import type { Band } from "@/data/riskScore";
import css from "./Overview.module.css";
import own from "./AtRisk.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

const BAND_CLASS: Record<Band, string> = {
  healthy: own.bandHealthy,
  watch: own.bandWatch,
  "at risk": own.bandAtRisk,
  critical: own.bandCritical,
};

type Filter = "flagged" | "watch" | "all";

function AtRisk(): React.ReactElement {
  const { data, loading, error } = useAtRisk();
  const [filter, setFilter] = useState<Filter>("flagged");

  const visible = useMemo(() => {
    if (!data) {
      return [];
    }
    if (filter === "all") {
      return data.rows;
    }
    if (filter === "watch") {
      return data.rows.filter((r) => r.risk.band !== "healthy");
    }
    return data.rows.filter((r) => r.risk.band === "at risk" || r.risk.band === "critical");
  }, [data, filter]);

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not score residents.</strong> {error.message}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className={css.page}>
        <Link to="/" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.status}>
          Scoring residents against twelve months of payment history…
        </div>
      </div>
    );
  }

  const flagged = data.bands["at risk"] + data.bands.critical;
  const shown = visible.slice(0, 100);

  return (
    <div className={css.page}>
      <Link to="/" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>Residents at risk</h1>
        <div className={css.asOf}>
          {num.format(data.scored)} active leases &middot; payments through {data.dataThrough}
        </div>
      </div>

      {data.staleDays > 45 && (
        <p className={own.stale}>
          <strong>The rent ledger is {num.format(data.staleDays)} days stale.</strong> Arrears
          below are aged against today, so every balance has drifted older than the data
          supports. Treat the ageing as indicative until payments are refreshed.
        </p>
      )}

      <p className={css.verdict}>
        <span className={css.verdictFigure}>{num.format(flagged)}</span> of{" "}
        {num.format(data.scored)} residents are scored at risk or critical. They hold{" "}
        <span className={css.verdictFigure}>{usd0.format(data.totalBalance * data.concentration)}</span>{" "}
        of the {usd0.format(data.totalBalance)} outstanding across the portfolio —{" "}
        {pct0(data.concentration)} of the arrears from {pct0(flagged / data.scored)} of the
        residents.
      </p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>At risk or critical</div>
          <div className={css.figureValue}>{num.format(flagged)}</div>
          <div className={css.figureNote}>{pct0(flagged / data.scored)} of active leases</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>On watch</div>
          <div className={css.figureValue}>{num.format(data.bands.watch)}</div>
          <div className={css.figureNote}>not yet a problem</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Total outstanding</div>
          <div className={css.figureValue}>{usd0.format(data.totalBalance)}</div>
          <div className={css.figureNote}>unpaid rent, active leases</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Held by flagged</div>
          <div className={css.figureValue}>{pct0(data.concentration)}</div>
          <div className={css.figureNote}>of all arrears</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Rent at stake</div>
          <div className={css.figureValue}>{usd0.format(data.rentExposed)}</div>
          <div className={css.figureNote}>monthly, flagged leases</div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>Delinquency ageing</h2>
      <p className={css.sectionNote}>
        Each resident counted once, in the oldest bucket carrying a balance. Buckets are
        computed at read time from the due date, so the thresholds can move without
        regenerating 95,000 payment rows.
      </p>

      <div className={own.ageing}>
        {data.ageing.map((a) => (
          <div key={a.bucket} className={own.ageBucket}>
            <div className={own.ageLabel}>{a.bucket === "90+" ? "90+ days" : `${a.bucket} days`}</div>
            <div className={own.ageValue}>{usd0.format(a.balance)}</div>
            <div className={own.ageNote}>{num.format(a.residents)} residents</div>
          </div>
        ))}
      </div>

      <h2 className={css.sectionTitle}>The list</h2>
      <p className={css.sectionNote}>
        Scored on arrears, recent payment trend, direction of travel, collection rate and how
        close the lease is to expiry. Every number is explainable: the reasons column is what
        produced it. Direction is weighted separately from arrears on purpose — a resident who
        always pays on day three and one who paid on time for a year and has now missed twice
        can owe the same money today, and they are not the same problem.
      </p>

      <div className={own.filters}>
        {(
          [
            ["flagged", `At risk and critical (${num.format(flagged)})`],
            ["watch", `Include watch (${num.format(flagged + data.bands.watch)})`],
            ["all", `All active leases (${num.format(data.scored)})`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${own.filterButton} ${filter === key ? own.filterActive : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th className={css.num}>Score</th>
              <th>Band</th>
              <th>Resident</th>
              <th>Home</th>
              <th className={css.num}>Rent</th>
              <th className={css.num}>Owed</th>
              <th>Oldest</th>
              <th>Lease ends</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.residentId}>
                <td className={`${css.num} ${own.score}`}>{r.risk.score}</td>
                <td>
                  <span className={`${own.band} ${BAND_CLASS[r.risk.band]}`}>{r.risk.band}</span>
                </td>
                <td className={own.name}>
                  {r.displayName}
                  {r.risk.degrading && (
                    <span className={own.trendFlag} title="Payment behavior worsening">
                      worsening
                    </span>
                  )}
                </td>
                <td>
                  <Link to={`/property/${r.propertyId}`} className={css.rowLink}>
                    {r.streetAddress}
                  </Link>{" "}
                  <span className={css.state}>
                    {r.city}, {r.state}
                  </span>
                </td>
                <td className={css.num}>{usd0.format(r.monthlyRent)}</td>
                <td className={`${css.num} ${r.risk.balance > 0 ? css.gap : ""}`}>
                  {r.risk.balance > 0 ? usd0.format(r.risk.balance) : "—"}
                </td>
                <td className={own.bucket}>{r.risk.balance > 0 ? r.risk.bucket : "—"}</td>
                <td className={r.risk.daysToLeaseEnd <= 90 ? own.soon : undefined}>
                  {r.leaseEndDate}
                </td>
                <td className={own.reasons}>{r.risk.reasons.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length > shown.length && (
        <p className={css.sectionNote}>
          Showing the {num.format(shown.length)} highest-scoring of {num.format(visible.length)}.
        </p>
      )}
      {visible.length === 0 && (
        <p className={css.sectionNote}>No residents in this band.</p>
      )}

      <p className={own.method}>
        Rules-based, not a model. The data would support training one — three years of
        time-ordered payments with lease outcomes as labels — but it is generated, so a model
        trained on it would recover the generator&rsquo;s own rule for who pays late and score
        near-perfectly against it. That accuracy would measure nothing about real residents. A
        transparent score a controller can argue with is the honest version, and it is also
        what property managers actually use.
      </p>
    </div>
  );
}

export default AtRisk;
