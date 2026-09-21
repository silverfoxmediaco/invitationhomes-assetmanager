import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCommunities, type CommunityRow } from "@/data/useCommunities";
import css from "./Overview.module.css";
import own from "./CommunityList.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

function monthLabel(month: string): string {
  if (!month) {
    return "";
  }
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

type SortKey = "gap" | "underPct" | "cost" | "tax" | "capex" | "occupancy" | "homes";

const SORTS: { key: SortKey; label: string; of: (r: CommunityRow) => number }[] = [
  { key: "gap", label: "Rent forgone", of: (r) => r.gapPerMonth },
  { key: "underPct", label: "Share under market", of: (r) => r.underMarketPct },
  { key: "cost", label: "Cost per home", of: (r) => r.costPerHome },
  { key: "tax", label: "Tax per home", of: (r) => r.taxPerHome },
  { key: "capex", label: "CapEx per home", of: (r) => r.capexPerHome },
  { key: "occupancy", label: "Occupancy", of: (r) => -r.occupancyPct },
  { key: "homes", label: "Size", of: (r) => r.homes },
];

function CommunityList(): React.ReactElement {
  const { data, loading, error } = useCommunities();
  const [sort, setSort] = useState<SortKey>("gap");

  const rows = useMemo(() => {
    if (!data) {
      return [];
    }
    const of = SORTS.find((s) => s.key === sort)?.of ?? SORTS[0].of;
    return [...data.rows].sort((a, b) => of(b) - of(a));
  }, [data, sort]);

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/dashboard" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not load communities.</strong> {error.message}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className={css.page}>
        <Link to="/dashboard" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.status}>Loading communities…</div>
      </div>
    );
  }

  const { costPerHomeLow: low, costPerHomeHigh: high } = data;

  return (
    <div className={css.page}>
      <Link to="/dashboard" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>Communities</h1>
        <div className={css.asOf}>
          {num.format(data.communities)} communities &middot; market rents as of{" "}
          {monthLabel(data.asOfMonth)}
        </div>
      </div>

      <p className={css.verdict}>
        <span className={css.verdictFigure}>{num.format(data.majorityUnder)}</span> of{" "}
        {num.format(data.communities)} communities have more than half their homes priced below
        market. Under-market rent is not scattered across the portfolio — it collects in
        communities where pricing was set at acquisition and has not been revisited since,
        which is one decision each rather than {num.format(data.underMarketTotal)}.
      </p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>Majority under market</div>
          <div className={css.figureValue}>{num.format(data.majorityUnder)}</div>
          <div className={css.figureNote}>of {num.format(data.communities)} communities</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Homes under market</div>
          <div className={css.figureValue}>{num.format(data.underMarketTotal)}</div>
          <div className={css.figureNote}>
            {usd0.format(data.gapPerMonthTotal)} a month forgone
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Below advertised</div>
          <div className={css.figureValue}>{num.format(data.belowAdvertisedTotal)}</div>
          <div className={css.figureNote}>
            homes, across {num.format(data.belowAdvertisedCommunities)} communities
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Median cost per home</div>
          <div className={css.figureValue}>{usd0.format(data.costPerHomeMedian)}</div>
          <div className={css.figureNote}>a year, landlord only</div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>Half the cost spread is the county, not the operator</h2>
      <p className={css.sectionNote}>
        {low && high && (
          <>
            Holding a home in <strong>{high.name}</strong> ({high.city}, {high.state}) costs{" "}
            {usd0.format(high.costPerHome)} a year. In <strong>{low.name}</strong> ({low.city},{" "}
            {low.state}) it costs {usd0.format(low.costPerHome)} — a spread of{" "}
            {usd0.format(high.costPerHome - low.costPerHome)}. Property tax accounts for{" "}
            <strong>{pct0(data.taxShareOfSpread)}</strong> of it and episodic CapEx for a
            further {pct0(data.capexShareOfSpread)}. Routine maintenance differs by only{" "}
            {usd0.format(Math.abs(high.maintenancePerHome - low.maintenancePerHome))}.
          </>
        )}
      </p>
      <p className={css.sectionNote}>
        Which is why the four cost columns are kept apart. Tax is set by the county and no
        operator can move it. CapEx is real money but it arrives in lumps — two roofs inside
        the window in a {low ? low.homes : 30}-home community move its cost per home by
        thousands, while the same spend across seventy-five homes barely registers, so the
        column should be read as history rather than as run rate. Maintenance and recurring
        operating cost are the two an operator actually controls, and they are also the two
        that vary least. Blending all four into one number would bury that.
      </p>

      <h2 className={css.sectionTitle}>Every community</h2>
      <div className={own.sorts}>
        <span className={own.sortLabel}>Rank by</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`${own.sortButton} ${sort === s.key ? own.sortActive : ""}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Community</th>
              <th>Market</th>
              <th className={css.num}>Homes</th>
              <th className={css.num}>Occupied</th>
              <th className={css.num}>Under mkt</th>
              <th className={css.num}>Gap / mo</th>
              <th className={css.num}>Maint</th>
              <th className={css.num}>CapEx</th>
              <th className={css.num}>Opex</th>
              <th className={css.num}>Tax</th>
              <th className={css.num}>Cost / home</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug}>
                <td className={css.address}>
                  <Link to={`/community/${r.slug}`} className={css.rowLink}>
                    {r.name}
                  </Link>
                  {r.belowAdvertised > 0 && (
                    <span
                      className={own.flag}
                      title={`${r.belowAdvertised} occupied homes contracted below the ${usd0.format(
                        r.startingRent ?? 0
                      )} this community advertises today`}
                    >
                      {r.belowAdvertised} below ask
                    </span>
                  )}
                  <div className={own.place}>
                    {r.city}, {r.state} &middot; {r.county} County
                  </div>
                </td>
                <td className={css.state}>{r.market}</td>
                <td className={css.num}>{r.homes}</td>
                <td className={`${css.num} ${r.occupancyPct < 0.9 ? own.low : ""}`}>
                  {pct0(r.occupancyPct)}
                </td>
                <td className={css.num}>
                  {r.comped ? (
                    <span className={r.underMarketPct > 0.5 ? own.heavy : undefined}>
                      {pct0(r.underMarketPct)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`${css.num} ${r.gapPerMonth > 0 ? css.gap : ""}`}>
                  {r.gapPerMonth > 0 ? usd0.format(r.gapPerMonth) : "—"}
                </td>
                <td className={css.num}>{usd0.format(r.maintenancePerHome)}</td>
                <td className={`${css.num} ${own.episodic}`}>{usd0.format(r.capexPerHome)}</td>
                <td className={css.num}>
                  {usd0.format(r.opexPerHome + r.commonAreaPerHome)}
                </td>
                <td className={css.num}>{usd0.format(r.taxPerHome)}</td>
                <td className={`${css.num} ${own.total}`}>{usd0.format(r.costPerHome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={own.method}>
        Costs are the trailing twelve months per home in the community: landlord-responsible
        maintenance, episodic capital spend, recurring operating expenses including the
        community&rsquo;s share of common-area landscaping, and the most recent property tax
        bill. Thirteen months are read so a month boundary cannot clip the earliest, and the
        thirteenth is dropped before totalling — counting it would inflate every per-year
        figure by roughly eight percent. Resident-responsibility work is excluded: it is
        charged back and is not a cost of holding the home. &ldquo;Below
        ask&rdquo; counts occupied homes contracted under the starting rent the community
        advertises today, and is only shown for the 73 communities that publish one; the other
        three fall back to a market median, and comparing a real contract against an estimate
        of our own would be a finding about the estimate.
      </p>
    </div>
  );
}

export default CommunityList;
