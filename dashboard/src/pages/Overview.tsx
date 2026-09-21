import React from "react";
import { Link } from "react-router-dom";
import { usePortfolio } from "@/data/usePortfolio";
import css from "./Overview.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

function monthLabel(month: string): string {
  if (!month) {return "";}
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function Overview(): React.ReactElement {
  const { data, loading, error } = usePortfolio();

  if (error) {
    return (
      <div className={css.page}>
        <h1 className={css.title}>Portfolio overview</h1>
        <div className={css.error}>
          <strong>Could not load the portfolio.</strong> {error.message}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className={css.page}>
        <h1 className={css.title}>Portfolio overview</h1>
        <div className={css.status}>Loading portfolio…</div>
      </div>
    );
  }

  const top = data.rows.slice(0, 25);

  return (
    <div className={css.page}>
      <div className={css.masthead}>
        <h1 className={css.title}>Portfolio overview</h1>
        <div className={css.asOf}>Market rents as of {monthLabel(data.asOfMonth)}</div>
      </div>

      <p className={css.syntheticNotice}>
        Invitation Homes is a real company. This data is not. The 76 communities,
        their markets, cities and advertised starting rents were read from
        invitationhomes.com; every home, resident, lease and payment below that
        level is generated.
      </p>

      <p className={css.verdict}>
        {data.underMarketCount === 0 ? (
          <>No occupied home is currently priced below its local market median.</>
        ) : (
          <>
            <span className={css.verdictFigure}>{num.format(data.underMarketCount)}</span> of{" "}
            {num.format(data.occupied)} occupied homes are priced below their city and
            bedroom-count median, worth{" "}
            <span className={css.verdictFigure}>
              {usd0.format(data.underMarketAnnual)}
            </span>{" "}
            a year. Whether that is a pricing problem or a cost problem depends on what
            each home is absorbing in maintenance and tax.
          </>
        )}
      </p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>Homes</div>
          <div className={css.figureValue}>{num.format(data.homes)}</div>
          <div className={css.figureNote}>76 communities, 9 states</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Occupancy</div>
          <div className={css.figureValue}>{pct0(data.occupancyPct)}</div>
          <div className={css.figureNote}>
            {num.format(data.vacantOrTurn)} vacant or in turn
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Under market</div>
          <div className={css.figureValue}>{num.format(data.underMarketCount)}</div>
          <div className={css.figureNote}>
            {pct0(data.occupied ? data.underMarketCount / data.occupied : 0)} of occupied
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Monthly gap</div>
          <div className={css.figureValue}>{usd0.format(data.underMarketMonthly)}</div>
          <div className={css.figureNote}>rent forgone each month</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Annualised</div>
          <div className={css.figureValue}>{usd0.format(data.underMarketAnnual)}</div>
          <div className={css.figureNote}>at current gaps</div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>The other question</h2>
      <p className={css.sectionNote}>
        Rent forgone is one exposure. Rent owed is the other, and it is a different
        population: some of the homes below are also occupied by residents falling behind,
        and most are not.{" "}
        <Link to="/at-risk" className={css.rowLink}>
          Residents at risk &rarr;
        </Link>
      </p>

      <h2 className={css.sectionTitle}>Largest gaps to market</h2>
      <p className={css.sectionNote}>
        Contract rent on the active lease against the median for that home&rsquo;s city
        and bedroom count. Compared by city rather than by market: the tampa market
        alone spans Fort Myers to Tampa proper, so a market-level comparison would
        report homes as under market when the only difference is geography.
      </p>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Address</th>
              <th>City</th>
              <th className={css.num}>Beds</th>
              <th className={css.num}>Contract</th>
              <th className={css.num}>Market</th>
              <th className={css.num}>Gap / mo</th>
              <th className={css.num}>Gap</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.propertyId}>
                <td className={css.address}>
                  <Link to={`/property/${r.propertyId}`} className={css.rowLink}>
                    {r.streetAddress}
                  </Link>
                </td>
                <td>
                  {r.city} <span className={css.state}>{r.state}</span>
                </td>
                <td className={css.num}>{r.beds}</td>
                <td className={css.num}>{usd0.format(r.contractRent)}</td>
                <td className={css.num}>{usd0.format(r.marketMedian)}</td>
                <td className={`${css.num} ${css.gap}`}>{usd0.format(r.gapPerMonth)}</td>
                <td className={css.num}>{pct0(r.gapPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rows.length > top.length && (
        <p className={css.sectionNote}>
          Showing the 25 largest of {num.format(data.rows.length)}.{" "}
          <Link to="/properties?show=under" className={css.rowLink}>
            See all {num.format(data.rows.length)} under market &rarr;
          </Link>{" "}
          or{" "}
          <Link to="/properties" className={css.rowLink}>
            browse every home &rarr;
          </Link>
        </p>
      )}
    </div>
  );
}

export default Overview;
