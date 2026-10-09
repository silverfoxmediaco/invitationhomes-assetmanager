import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MANAGEMENT_FEE,
  RESET_THRESHOLD,
  useDisposition,
  usePriced,
  type PricedBundle,
} from "@/data/useDisposition";
import { useMarketStrategy } from "@/data/useMarketStrategy";
import css from "./Overview.module.css";
import own from "./Disposition.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/** $1.2M / $340K. Sale prices run to nine figures and full digits stop being readable. */
function money(x: number): string {
  const sign = x < 0 ? "-" : "";
  const a = Math.abs(x);
  if (a >= 1e9) {
    return `${sign}$${(a / 1e9).toFixed(2)}B`;
  }
  if (a >= 1e6) {
    return `${sign}$${(a / 1e6).toFixed(1)}M`;
  }
  if (a >= 1e3) {
    return `${sign}$${Math.round(a / 1e3)}K`;
  }
  return usd0.format(x);
}

const SIGNAL_LABEL: Record<PricedBundle["signal"], string> = {
  reset: "Reset rents, then sell",
  sell: "Sell candidate",
  hold: "Hold",
};

const DEFAULT_CAP = 5.5;

function Disposition(): React.ReactElement {
  const { data, loading: dataLoading, error: dataError } = useDisposition();
  const market = useMarketStrategy();
  const [params, setParams] = useSearchParams();
  const loading = dataLoading || market.loading;
  // A failed save is shown beside the table; a failed load stops the page.
  const error = dataError ?? (market.loading ? null : market.strategies.size ? null : market.error);

  // The cap rate is a what-if, so it lives in the URL. The exit list is a
  // decision, so it lives in Foundry: every viewer sees the same package,
  // and each change is stamped with who made it and when.
  const capParam = Number(params.get("cap"));
  const cap = Number.isFinite(capParam) && capParam > 0 ? capParam : DEFAULT_CAP;
  const exit = new Set(
    [...market.strategies.values()].filter((m) => m.strategy === "exit").map((m) => m.marketId)
  );

  const { rows, portfolioCapOnCost } = usePriced(data?.bundles, cap / 100);

  const setCap = (value: string): void => {
    const next = new URLSearchParams(params);
    next.set("cap", value);
    setParams(next, { replace: true });
  };
  const toggleExit = (marketId: string): void => {
    void market.setStrategy(marketId, exit.has(marketId) ? "core" : "exit");
  };

  const back = (
    <Link to="/dashboard" className={own.ihDpBack}>
      &larr; Portfolio overview
    </Link>
  );

  if (error) {
    return (
      <div className={css.page}>
        {back}
        <div className={css.error}>
          <strong>Could not load dispositions.</strong> {error.message}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className={css.page}>
        {back}
        <div className={css.status}>Pricing every market…</div>
      </div>
    );
  }

  // Weakest return on what was paid first: those are the bundles worth
  // asking a buyer about.
  const sorted = [...rows].sort((a, b) => a.capOnCost - b.capOnCost);
  const total = (list: PricedBundle[], k: keyof PricedBundle) =>
    list.reduce((s, r) => s + (r[k] as number), 0);

  const homes = total(rows, "homes");
  const price = total(rows, "impliedPrice");
  const cost = total(rows, "costBasis");
  const discount = total(rows, "rentDiscount");

  const pkg = rows.filter((r) => exit.has(r.market));
  const pkgHomes = total(pkg, "homes");
  const pkgNoi = total(pkg, "noi");
  const pkgPrice = total(pkg, "impliedPrice");
  const pkgCost = total(pkg, "costBasis");
  const pkgDiscount = total(pkg, "rentDiscount");

  return (
    <div className={css.page}>
      {back}

      <div className={css.masthead}>
        <h1 className={css.title}>Dispositions</h1>
        <div className={css.asOf}>
          trailing 12 months from {data.since} &middot; market rents as of {data.asOfMonth}
        </div>
      </div>

      <p className={css.verdict}>
        At a <span className={css.verdictFigure}>{pct1(cap / 100)}</span> cap rate the
        portfolio&rsquo;s {num.format(homes)} homes price at{" "}
        <span className={css.verdictFigure}>{money(price)}</span>, against {money(cost)} paid.
        Rents below market take <strong>{money(discount)}</strong> off that price. A buyer
        would collect that rent increase after the sale.
      </p>

      <div className={own.ihDpControls}>
        <div className={own.ihDpField}>
          <label htmlFor="ihDpCap" className={own.ihDpLabel}>
            Buyer cap rate
          </label>
          <div className={own.ihDpCapRow}>
            <input
              id="ihDpCap"
              type="range"
              min="4"
              max="8"
              step="0.1"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className={own.ihDpSlider}
              aria-label="Buyer cap rate percentage"
            />
            <div className={own.ihDpNumberWrap}>
              <input
                type="number"
                min="3"
                max="10"
                step="0.05"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className={own.ihDpNumber}
                aria-label="Buyer cap rate percentage, exact"
              />
              <span className={own.ihDpPercent}>%</span>
            </div>
          </div>
        </div>
        <p className={own.ihDpControlNote}>
          The rate an institutional buyer prices NOI at. A lower rate means a higher price.
          Portfolio NOI on cost basis runs {pct1(portfolioCapOnCost)}.
        </p>
      </div>

      <section className={own.ihDpPackage} aria-label="Sale package">
        <h2 className={own.ihDpPackageTitle}>Sale package</h2>
        {/* Same layout empty or full, so ticking the first market cannot move
            the table under the presenter's cursor. */}
        <p className={pkg.length ? own.ihDpPackageList : own.ihDpPackageEmpty}>
          {pkg.length ? (
            pkg
              .map((r) => r.name)
              .sort()
              .join(", ")
          ) : (
            <>
              Tick <strong>Exit</strong> on any market below to build a sale package. The
              choice is saved in Foundry through the Set Market Strategy action, so everyone
              opening this page sees the same package, with who changed it and when.
            </>
          )}
        </p>
        <div className={css.figures}>
          <div className={css.figure}>
            <div className={css.figureLabel}>Homes</div>
            <div className={css.figureValue}>{pkg.length ? num.format(pkgHomes) : "\u2014"}</div>
            <div className={css.figureNote}>
              {pkg.length ? `${pct0(pkgHomes / Math.max(1, homes))} of the portfolio` : "none selected"}
            </div>
          </div>
          <div className={css.figure}>
            <div className={css.figureLabel}>NOI, 12 mo</div>
            <div className={css.figureValue}>{pkg.length ? money(pkgNoi) : "\u2014"}</div>
            <div className={css.figureNote}>
              {pkg.length ? `${usd0.format(pkgNoi / Math.max(1, pkgHomes))} a home` : "\u00a0"}
            </div>
          </div>
          <div className={css.figure}>
            <div className={css.figureLabel}>Price at {pct1(cap / 100)}</div>
            <div className={css.figureValue}>{pkg.length ? money(pkgPrice) : "\u2014"}</div>
            <div className={css.figureNote}>
              {pkg.length ? `${usd0.format(pkgPrice / Math.max(1, pkgHomes))} a home` : "\u00a0"}
            </div>
          </div>
          <div className={css.figure}>
            <div className={css.figureLabel}>Over cost basis</div>
            <div className={css.figureValue}>{pkg.length ? money(pkgPrice - pkgCost) : "\u2014"}</div>
            <div className={css.figureNote}>{pkg.length ? `on ${money(pkgCost)} paid` : "\u00a0"}</div>
          </div>
          <div className={css.figure}>
            <div className={css.figureLabel}>Left to the buyer</div>
            <div className={css.figureValue}>{pkg.length ? money(pkgDiscount) : "\u2014"}</div>
            <div className={css.figureNote}>price lost to under-market rent</div>
          </div>
        </div>
      </section>

      {market.error && market.strategies.size > 0 && (
        <div className={css.error}>
          <strong>Could not save that change.</strong> {market.error.message}
        </div>
      )}

      <h2 className={css.sectionTitle}>Markets as bundles</h2>
      <p className={css.sectionNote}>
        One bundle per market, weakest return on cost first. Institutional buyers price a
        metro, not a house. A market earning less on its cost basis than the portfolio
        ({pct1(portfolioCapOnCost)}) is a <em>Sell candidate</em>; if under-market rents
        also cost {pct0(RESET_THRESHOLD)} or more of its price, the signal reads{" "}
        <em>Reset rents, then sell</em>, because a buyer would collect that increase.
        Everything else is <em>Hold</em>.
      </p>

      <div className={css.tableWrap}>
        <table className={`${css.table} ${own.ihDpTable}`}>
          <thead>
            <tr>
              <th>Exit</th>
              <th>Market</th>
              <th className={css.num}>Homes</th>
              <th className={css.num}>Occupied</th>
              <th className={css.num}>Collected</th>
              <th className={css.num}>NOI / home</th>
              <th className={css.num}>Tax / rent</th>
              <th className={css.num}>NOI on cost</th>
              <th className={css.num}>Price at {pct1(cap / 100)}</th>
              <th className={css.num}>Over cost</th>
              <th className={css.num}>Rent discount</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.market} className={exit.has(r.market) ? own.ihDpRowChosen : undefined}>
                <td className={own.ihDpCheckCell}>
                  {/* The whole cell is the target. A bare 16px box is easy to miss
                      when someone is presenting from a laptop to a room. */}
                  <label className={own.ihDpCheckLabel}>
                    <input
                      type="checkbox"
                      className={own.ihDpCheck}
                      checked={exit.has(r.market)}
                      disabled={market.saving !== null}
                      onChange={() => toggleExit(r.market)}
                      aria-label={`Mark ${r.name} for exit`}
                    />
                    {market.saving === r.market && <span className={own.ihDpSaving}>saving</span>}
                  </label>
                </td>
                <td>
                  <span className={own.ihDpMarket}>{r.name}</span>
                  <span className={own.ihDpMix}>
                    {r.communityHomes
                      ? `${num.format(r.scatteredHomes)} scattered, ${num.format(r.communityHomes)} in communities`
                      : "all scattered"}
                  </span>
                </td>
                <td className={css.num}>{num.format(r.homes)}</td>
                <td className={css.num}>{pct0(r.occupied / Math.max(1, r.homes))}</td>
                <td className={css.num}>{money(r.collected)}</td>
                <td className={css.num}>{usd0.format(r.noi / Math.max(1, r.homes))}</td>
                <td className={css.num}>{pct0(r.tax / Math.max(1, r.collected))}</td>
                <td className={css.num}>{pct1(r.capOnCost)}</td>
                <td className={css.num}>{money(r.impliedPrice)}</td>
                <td className={css.num}>{money(r.gainOverCost)}</td>
                <td className={css.num}>{money(r.rentDiscount)}</td>
                <td>
                  <span className={`${own.ihDpSignal} ${own[`ihDpSignal_${r.signal}`]}`}>
                    {SIGNAL_LABEL[r.signal]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={css.sectionTitle}>How the price is built</h2>
      <div className={own.ihDpMethod}>
        <p>
          <strong>NOI</strong> is the trailing 12 months: rent actually collected, minus
          operating expenses (HOA, insurance, utilities while vacant, turns, marketing, legal
          and each community home&rsquo;s share of common-area cost), landlord maintenance,
          the latest property tax bill, and management at {pct0(MANAGEMENT_FEE)} of collected
          rent. Invitation Homes manages its own homes, but a buyer underwrites a fee either
          way. CapEx sits below NOI, as in any acquisition model.
        </p>
        <p>
          <strong>Price</strong> is NOI divided by the buyer&rsquo;s cap rate.{" "}
          <strong>Cost basis</strong> is what was paid at acquisition. For homes bought in
          the 2012 to 2014 recovery that is far below today&rsquo;s price, which is most of
          the gain shown.
        </p>
        <p>
          <strong>Rent discount</strong> is the annual gap between each occupied home&rsquo;s
          lease and today&rsquo;s median for its city and bedroom count, less the management
          fee on it, priced at the same cap rate. A buyer prices the rent being paid, so
          that gap is value handed over at closing unless renewals close it first.
        </p>
        <p className={own.ihDpCaveat}>
          Every figure on this page comes from generated data. The markets are Invitation
          Homes&rsquo; own; the homes, leases, costs and prices are not, and nothing here is
          a valuation of a real asset.
        </p>
      </div>
    </div>
  );
}

export default Disposition;
