import React from "react";
import { Link } from "react-router-dom";
import { useCollections } from "@/data/useCollections";
import css from "./Overview.module.css";
import own from "./Collections.module.css";
import det from "./PropertyDetail.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function Collections(): React.ReactElement {
  const { data, loading, error } = useCollections();

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not load collections.</strong> {error.message}
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
        <div className={css.status}>Aggregating payments in Foundry…</div>
      </div>
    );
  }

  const cal = data.byCalendarMonth;
  const lo = Math.min(...cal.map((c) => c.onTimePct)) - 0.02;
  const hi = 1.0;
  const y = (v: number) => `${((hi - v) / (hi - lo)) * 100}%`;
  const recent = data.months.slice(-25, -1);

  return (
    <div className={css.page}>
      <Link to="/" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>Rent collection</h1>
        <div className={css.asOf}>
          {num.format(data.months.length)} months &middot; aggregated in Foundry
        </div>
      </div>

      <p className={css.verdict}>
        January is not expensive, it is laborious. The share of rent eventually
        collected moves {pct1(data.collectedSpread)} across the year. The share paid{" "}
        <span className={css.verdictFigure}>on time</span> moves{" "}
        <span className={css.verdictFigure}>{pct1(data.onTimeSpread)}</span> — roughly three
        times as far. Almost the same money arrives; in winter it arrives after somebody has
        chased it.
      </p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>Collected, 12 mo</div>
          <div className={css.figureValue}>{pct1(data.collectedPct12m)}</div>
          <div className={css.figureNote}>{usd0.format(data.collected12m)} of billed rent</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Paid on time</div>
          <div className={css.figureValue}>{pct1(data.onTimePct12m)}</div>
          <div className={css.figureNote}>in full, by the due date</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Not collected</div>
          <div className={`${css.figureValue} ${det.bad}`}>
            {usd0.format(data.outstanding12m)}
          </div>
          <div className={css.figureNote}>billed and unpaid, 12 mo</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Hardest month</div>
          <div className={css.figureValue}>
            {cal.length
              ? cal.reduce((w, c) => (c.onTimePct < w.onTimePct ? c : w)).month
              : "—"}
          </div>
          <div className={css.figureNote}>
            {pct1(Math.min(...cal.map((c) => c.onTimePct)))} on time
          </div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>The same season, three years running</h2>
      <p className={css.sectionNote}>
        Every month of the history folded onto the calendar, so one bad January reads as a
        season rather than an incident. Both lines are plotted because a single
        &ldquo;collections&rdquo; figure would show a flat, healthy portfolio and hide the
        staffing problem entirely.
      </p>

      <div className={own.chart}>
        {cal.map((c) => (
          <div key={c.month} className={own.col}>
            <div className={own.track}>
              <div className={own.dotCollected} style={{ top: y(c.collectedPct) }} />
              <div className={own.dotOnTime} style={{ top: y(c.onTimePct) }} />
              <div
                className={own.span}
                style={{ top: y(c.collectedPct), bottom: `${100 - parseFloat(y(c.onTimePct))}%` }}
              />
            </div>
            <div className={own.colLabel}>{c.month}</div>
            <div className={own.colValue}>{pct1(c.onTimePct)}</div>
          </div>
        ))}
      </div>
      <p className={own.legend}>
        <span className={own.keyCollected} /> Rent collected
        <span className={own.keyOnTime} /> Paid on time
      </p>

      <h2 className={css.sectionTitle}>Month by month</h2>
      <p className={css.sectionNote}>
        The current month is excluded from the totals above: it is billed but only part
        collected, so including it would drag every figure down for calendar reasons rather
        than business ones. Waived months are excluded from both ratios — a concession the
        company granted is not rent a resident failed to pay.
      </p>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Month</th>
              <th className={css.num}>Billed</th>
              <th className={css.num}>Collected</th>
              <th className={css.num}>Rate</th>
              <th className={css.num}>On time</th>
              <th className={css.num}>Late</th>
              <th className={css.num}>Partial</th>
              <th className={css.num}>Missed</th>
              <th className={css.num}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {[...recent].reverse().map((m) => (
              <tr key={m.month}>
                <td className={css.address}>{m.month}</td>
                <td className={css.num}>{usd0.format(m.due)}</td>
                <td className={css.num}>{usd0.format(m.paid)}</td>
                <td className={css.num}>{pct1(m.collectedPct)}</td>
                <td className={`${css.num} ${m.onTimePct < 0.86 ? css.gap : ""}`}>
                  {pct1(m.onTimePct)}
                </td>
                <td className={css.num}>{num.format(m.late)}</td>
                <td className={css.num}>{num.format(m.partial)}</td>
                <td className={css.num}>{num.format(m.missed)}</td>
                <td className={css.num}>{usd0.format(m.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={own.method}>
        These figures are computed by Foundry, not in this browser. Monthly totals over 95,663
        payments are three numbers a month; fetching the rows to add them up here would move
        megabytes to answer a question the platform can answer where the data already sits.
        One request returns 165 groups — every month by every payment status. The response
        carries an accuracy flag and this page refuses anything Foundry marks approximate,
        because a collection rate shown to a decimal place must not be an estimate.
      </p>
    </div>
  );
}

export default Collections;
