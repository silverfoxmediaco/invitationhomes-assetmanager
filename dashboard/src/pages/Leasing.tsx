import React from "react";
import { Link } from "react-router-dom";
import { useLeasing } from "@/data/useLeasing";
import css from "./Overview.module.css";
import own from "./Leasing.module.css";
import det from "./PropertyDetail.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

function monthShort(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function dayLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Leasing(): React.ReactElement {
  const { data, loading, error } = useLeasing();

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not load leasing.</strong> {error.message}
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
        <div className={css.status}>Loading leasing…</div>
      </div>
    );
  }

  const gaining = data.outpacePct > 0;
  const peak = data.activity.reduce(
    (max, a) => Math.max(max, a.newLeases + a.renewals),
    1
  );

  return (
    <div className={css.page}>
      <Link to="/" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>Leasing</h1>
        <div className={css.asOf}>
          as at {data.today} &middot; market rents through {data.asOfMonth}
        </div>
      </div>

      <p className={css.verdict}>
        Renewals signed in the last twelve months went up{" "}
        <span className={css.verdictFigure}>{pct1(data.renewalIncreasePct)}</span> while the
        market moved {pct1(data.marketGrowthPct)}.{" "}
        {gaining ? (
          <>
            Renewal pricing is running <strong>{pct1(data.outpacePct)}</strong> ahead of the
            market, so the gap the portfolio page reports is closing rather than widening —
            slowly, because a 24-month lease only reprices twice in four years.
          </>
        ) : (
          <>
            Renewal pricing is running <strong>{pct1(data.outpacePct)}</strong> behind the
            market, so every renewal quietly widens the gap the portfolio page reports.
          </>
        )}
      </p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>Move-ins scheduled</div>
          <div className={css.figureValue}>{num.format(data.moveIns.length)}</div>
          <div className={css.figureNote}>
            {num.format(data.moveInsNew)} new, {num.format(data.moveInsRenewal)} renewing
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Rent committed</div>
          <div className={css.figureValue}>{usd0.format(data.moveInRentPerMonth)}</div>
          <div className={css.figureNote}>
            a month, {usd0.format(data.moveInRentPerMonth * 12)} a year
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Renewals, 12 mo</div>
          <div className={css.figureValue}>{num.format(data.renewals12m)}</div>
          <div className={css.figureNote}>
            {usd0.format(data.renewalUpliftPerYear)} of added rent
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Ahead of market</div>
          <div className={`${css.figureValue} ${gaining ? own.good : det.bad}`}>
            {pct1(data.outpacePct)}
          </div>
          <div className={css.figureNote}>renewal increase less market</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Retention</div>
          <div className={css.figureValue}>{pct0(data.retentionPct)}</div>
          <div className={css.figureNote}>
            {num.format(data.renewed12m)} of {num.format(data.expired12m)} re-signed
          </div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>The other half of it</h2>
      <p className={css.sectionNote}>
        Renewal pricing is working. Retention is not: {pct0(data.retentionPct)} of the leases
        that ended in the last twelve months were re-signed, so the portfolio replaced roughly{" "}
        {num.format(data.expired12m - data.renewed12m)} households. That churn cost{" "}
        <strong>{usd0.format(data.churnCost)}</strong> — {usd0.format(data.turnCost)} across{" "}
        {num.format(data.turnEvents)} turns, {usd0.format(data.marketingCost)} of marketing,
        and {usd0.format(data.vacancyUtilities)} of utilities on homes standing empty, which
        the landlord only pays while nobody lives there.
      </p>
      <p className={css.sectionNote}>
        Set against {usd0.format(data.renewalUpliftPerYear)} of rent added by renewal
        increases, that is the trade worth arguing about. What this data{" "}
        <strong>cannot</strong> show is whether the two are connected: residents who left have
        no recorded offer to compare against, so nothing here establishes that the increases
        drove the departures. Both numbers are real; the causal link is not in the ontology.
      </p>

      <h2 className={css.sectionTitle}>Leases signed, last 18 months</h2>
      <p className={css.sectionNote}>
        Leasing follows the school calendar, not the weather — the summer peak and the
        February trough are the same pattern every year, and staffing a turn crew against the
        average means being short in August. The final bar is the month in progress and stops
        at today, so it is short for calendar reasons rather than business ones.
      </p>

      <div className={own.chart}>
        {data.activity.map((a) => {
          const total = a.newLeases + a.renewals;
          return (
            <div key={a.month} className={`${own.bar} ${a.partial ? own.barPartial : ""}`}>
              <div
                className={own.barStack}
                title={
                  a.partial
                    ? `${total} leases so far this month`
                    : `${total} leases`
                }
              >
                <div
                  className={own.barNew}
                  style={{ height: `${(a.newLeases / peak) * 100}%` }}
                />
                <div
                  className={own.barRenewal}
                  style={{ height: `${(a.renewals / peak) * 100}%` }}
                />
              </div>
              <div className={own.barValue}>{total}</div>
              <div className={own.barLabel}>
                {monthShort(a.month)}
                {a.partial && <span className={own.partialMark}>so far</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className={own.legend}>
        <span className={own.keyNew} /> New lease
        <span className={own.keyRenewal} /> Renewal
      </p>

      <h2 className={css.sectionTitle}>
        Moving in ({num.format(data.moveIns.length)})
      </h2>
      <p className={css.sectionNote}>
        Leases already signed whose start date has not arrived. {num.format(data.vacant)} homes
        are vacant and {num.format(data.inTurn)} are in turn, so this is the part of that
        pipeline already committed.
      </p>

      {data.moveIns.length === 0 ? (
        <p className={css.sectionNote}>No move-ins are currently scheduled.</p>
      ) : (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Starts</th>
                <th>Address</th>
                <th>City</th>
                <th>Resident</th>
                <th>Type</th>
                <th className={css.num}>Term</th>
                <th className={css.num}>Rent</th>
              </tr>
            </thead>
            <tbody>
              {data.moveIns.map((m) => (
                <tr key={m.leaseId}>
                  <td className={own.date}>{dayLabel(m.startDate)}</td>
                  <td className={css.address}>
                    <Link to={`/property/${m.propertyId}`} className={css.rowLink}>
                      {m.streetAddress}
                    </Link>
                  </td>
                  <td>
                    {m.city} <span className={css.state}>{m.state}</span>
                  </td>
                  <td>{m.residentName}</td>
                  <td>
                    <span className={m.isRenewal ? own.tagRenewal : own.tagNew}>
                      {m.isRenewal ? "renewal" : "new"}
                    </span>
                  </td>
                  <td className={css.num}>{m.termMonths} mo</td>
                  <td className={css.num}>{usd0.format(m.monthlyRent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Leasing;
