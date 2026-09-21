import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useProperties, type PropertyRow } from "@/data/useProperties";
import css from "./Overview.module.css";
import own from "./PropertyList.module.css";
import det from "./PropertyDetail.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

const PAGE = 100;

type Occupancy = "all" | "occupied" | "vacant" | "under";
type SortKey = "gap" | "rent" | "sqft" | "beds" | "address" | "ends";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "gap", label: "Gap to market" },
  { key: "rent", label: "Rent" },
  { key: "sqft", label: "Size" },
  { key: "beds", label: "Beds" },
  { key: "ends", label: "Lease ending" },
  { key: "address", label: "Address" },
];

function compare(a: PropertyRow, b: PropertyRow, key: SortKey): number {
  switch (key) {
    case "rent":
      return (b.contractRent ?? -1) - (a.contractRent ?? -1);
    case "sqft":
      return b.sqft - a.sqft;
    case "beds":
      return b.beds - a.beds;
    case "address":
      return a.streetAddress.localeCompare(b.streetAddress);
    case "ends":
      // Homes with no lease sort last: "ending soonest" is meaningless for an
      // empty house, and floating them to the top would bury the answer.
      if (!a.leaseEndDate) {
        return 1;
      }
      if (!b.leaseEndDate) {
        return -1;
      }
      return a.leaseEndDate.localeCompare(b.leaseEndDate);
    default:
      return (b.gapPerMonth ?? -1e9) - (a.gapPerMonth ?? -1e9);
  }
}

function PropertyList(): React.ReactElement {
  const { data, loading, error } = useProperties();
  const [params, setParams] = useSearchParams();

  // The filter lives in the URL so a filtered list can be sent to somebody.
  const query = params.get("q") ?? "";
  const occupancy = (params.get("show") as Occupancy) ?? "all";
  const market = params.get("market") ?? "";
  const sort = (params.get("sort") as SortKey) ?? "gap";
  const [shown, setShown] = useState(PAGE);

  const set = (key: string, value: string): void => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next, { replace: true });
    setShown(PAGE);
  };

  const filtered = useMemo(() => {
    if (!data) {
      return [];
    }
    const q = query.trim().toLowerCase();
    const rows = data.rows.filter((r) => {
      if (market && r.market !== market) {
        return false;
      }
      if (occupancy === "occupied" && !r.contractRent) {
        return false;
      }
      if (occupancy === "vacant" && r.contractRent) {
        return false;
      }
      if (occupancy === "under" && !(r.gapPerMonth != null && r.gapPerMonth > 0)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        r.streetAddress.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.communityName.toLowerCase().includes(q) ||
        r.propertyId.toLowerCase().includes(q) ||
        String(r.zip).includes(q)
      );
    });
    return [...rows].sort((a, b) => compare(a, b, sort));
  }, [data, query, occupancy, market, sort]);

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/dashboard" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not load properties.</strong> {error.message}
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
        <div className={css.status}>Loading every home…</div>
      </div>
    );
  }

  const page = filtered.slice(0, shown);
  const gapTotal = filtered.reduce((s, r) => s + Math.max(0, r.gapPerMonth ?? 0), 0);

  return (
    <div className={css.page}>
      <Link to="/dashboard" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>All homes</h1>
        <div className={css.asOf}>
          {num.format(data.total)} properties &middot; market rents as of {data.asOfMonth}
        </div>
      </div>

      <div className={own.controls}>
        <input
          type="search"
          className={own.search}
          placeholder="Search address, city, community or ID"
          value={query}
          onChange={(e) => set("q", e.target.value)}
          aria-label="Search homes"
        />
        <select
          className={own.select}
          value={market}
          onChange={(e) => set("market", e.target.value)}
          aria-label="Filter by market"
        >
          <option value="">All markets</option>
          {data.markets.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          className={own.select}
          value={sort}
          onChange={(e) => set("sort", e.target.value)}
          aria-label="Sort by"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className={own.tabs}>
        {(
          [
            ["all", `All (${num.format(data.total)})`],
            ["occupied", `Occupied (${num.format(data.occupied)})`],
            ["vacant", `Vacant or in turn (${num.format(data.vacant + data.inTurn)})`],
            ["under", `Under market (${num.format(data.underMarket)})`],
          ] as [Occupancy, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${own.tab} ${occupancy === key ? own.tabActive : ""}`}
            onClick={() => set("show", key === "all" ? "" : key)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className={own.summary}>
        {num.format(filtered.length)}{" "}
        {filtered.length === 1 ? "home matches" : "homes match"}
        {gapTotal > 0 && (
          <>
            , {usd0.format(gapTotal)} a month below market between them (
            {usd0.format(gapTotal * 12)} a year)
          </>
        )}
        .
      </p>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Address</th>
              <th>Community</th>
              <th>Market</th>
              <th className={css.num}>Bd/Ba</th>
              <th className={css.num}>Sq ft</th>
              <th>Status</th>
              <th className={css.num}>Contract</th>
              <th className={css.num}>Market</th>
              <th className={css.num}>Gap / mo</th>
              <th>Lease ends</th>
            </tr>
          </thead>
          <tbody>
            {page.map((r) => (
              <tr key={r.propertyId}>
                <td className={css.address}>
                  <Link to={`/property/${r.propertyId}`} className={css.rowLink}>
                    {r.streetAddress}
                  </Link>
                  <div className={own.place}>
                    {r.city}, {r.state} {r.zip}
                  </div>
                </td>
                <td>
                  <Link to={`/community/${r.communitySlug}`} className={css.rowLink}>
                    {r.communityName}
                  </Link>
                </td>
                <td className={css.state}>{r.market}</td>
                <td className={css.num}>
                  {r.beds}/{r.baths}
                </td>
                <td className={css.num}>{num.format(r.sqft)}</td>
                <td>
                  <span
                    className={
                      r.status === "occupied"
                        ? own.sOccupied
                        : r.status === "turn"
                          ? own.sTurn
                          : own.sVacant
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className={css.num}>
                  {r.contractRent != null ? usd0.format(r.contractRent) : "—"}
                </td>
                <td className={css.num}>
                  {r.marketMedian != null ? usd0.format(r.marketMedian) : "—"}
                </td>
                <td
                  className={`${css.num} ${
                    r.gapPerMonth != null && r.gapPerMonth > 0 ? css.gap : ""
                  }`}
                >
                  {r.gapPerMonth == null
                    ? "—"
                    : r.gapPerMonth > 0
                      ? `${usd0.format(r.gapPerMonth)}${
                          r.gapPct != null ? ` (${pct0(r.gapPct)})` : ""
                        }`
                      : usd0.format(r.gapPerMonth)}
                </td>
                <td className={det.muted}>{r.leaseEndDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className={own.summary}>
          Nothing matches. {query && <>Try a shorter search than &ldquo;{query}&rdquo;.</>}
        </p>
      )}

      {shown < filtered.length && (
        <div className={own.more}>
          <button type="button" className={own.moreButton} onClick={() => setShown(shown + PAGE)}>
            Show {num.format(Math.min(PAGE, filtered.length - shown))} more
          </button>
          <span className={own.moreNote}>
            showing {num.format(page.length)} of {num.format(filtered.length)}
          </span>
        </div>
      )}

      <p className={own.method}>
        Vacant and in-turn homes are listed rather than hidden. They have no contract rent, so
        they carry no gap and drop out of every under-market figure on this dashboard — which
        is right for those figures and wrong as a picture of the portfolio, because a home
        earning nothing is the most expensive kind there is. A dash in the gap column means
        either no lease or no comparable for that city and bedroom count; it never means the
        home is at market.
      </p>
    </div>
  );
}

export default PropertyList;
