import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  MANAGEMENT_FEE,
  RESET_THRESHOLD,
  useDisposition,
  usePriced,
  type PricedBundle,
} from "@/data/useDisposition";
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
  reset: "Reset rents first",
  sell: "Sell candidate",
  hold: "Hold",
};

const DEFAULT_CAP = 5.5;

function Disposition(): React.ReactElement {
  const { data, loading, error } = useDisposition();
  const [params, setParams] = useSearchParams();

  // The cap rate and the exit list live in the URL, so a package someone
  // builds can be sent as a link and opens exactly as they left it.
  const capParam = Number(params.get("cap"));
  const cap = Number.isFinite(capParam) && capParam > 0 ? capParam : DEFAULT_CAP;
  const exit = new Set((params.get("exit") ?? "").split(",").filter(Boolean));

  const { rows, portfolioCapOnCost } = usePriced(data?.bundles, cap / 100);

  const setCap = (value: string): void => {
    const next = new URLSearchParams(params);
    next.set("cap", value);
    setParams(next, { replace: true });
  };
  const toggleExit = (market: string): void => {
    const nextSet = new Set(exit);
    if (nextSet.has(market)) {
      nextSet.delete(market);
    } else {
      nextSet.add(market);
    }
    const next = new URLSearchParams(params);
    if (nextSet.size) {
      next.set("exit", [...nextSet].sort().join(","));
    } else {
      next.delete("exit");
    }
    setParams(next, { replace: true });
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
        {pkg.length === 0 ? (
          <p className={own.ihDpPackageEmpty}>
            Tick <strong>Exit</strong> on any market below to build a sale package. The
            selection stays in the link, so the package can be shared as it stands.
          </p>
        ) : (
          <>
            <p className={own.ihDpPackageList}>
              {pkg
                .map((r) => r.name)
                .sort()
                .join(", ")}
            </p>
            <div className={css.figures}>
              <div className={css.figure}>
                <div className={css.figureLabel}>Homes</div>
                <div className={css.figureValue}>{num.format(pkgHomes)}</div>
                <div className={css.figureNote}>{pct0(pkgHomes / Math.max(1, homes))} of the portfolio</div>
              </div>
              <div className={css.figure}>
                <div className={css.figureLabel}>NOI, 12 mo</div>
                <div className={css.figureValue}>{money(pkgNoi)}</div>
                <div className={css.figureNote}>{usd0.format(pkgNoi / Math.max(1, pkgHomes))} a home</div>
              </div>
              <div className={css.figure}>
                <div className={css.figureLabel}>Price at {pct1(cap / 100)}</div>
                <div className={css.figureValue}>{money(pkgPrice)}</div>
                <div className={css.figureNote}>{usd0.format(pkgPrice / Math.max(1, pkgHomes))} a home</div>
              </div>
              <div className={css.figure}>
                <div className={css.figureLabel}>Over cost basis</div>
                <div className={css.figureValue}>{money(pkgPrice - pkgCost)}</div>
                <div className={css.figureNote}>on {money(pkgCost)} paid</div>
              </div>
              <div className={css.figure}>
                <div className={css.figureLabel}>Left to the buyer</div>
                <div className={css.figureValue}>{money(pkgDiscount)}</div>
                <div className={css.figureNote}>price lost to under-market rent</div>
              </div>
            </div>
          </>
        )}
      </section>

      <h2 className={css.sectionTitle}>Markets as bundles</h2>
      <p className={css.sectionNote}>
        One bundle per market, weakest return on cost first. Institutional buyers price a
        metro, not a house. The signal reads <em>Reset rents first</em> when under-market
        rents cost {pct0(RESET_THRESHOLD)} or more of the sale price, <em>Sell candidate</em>{" "}
        when NOI on cost basis runs below the portfolio&rsquo;s, and <em>Hold</em> otherwise.
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
                <td>
                  <input
                    type="checkbox"
                    className={own.ihDpCheck}
                    checked={exit.has(r.market)}
                    onChange={() => toggleExit(r.market)}
                    aria-label={`Include ${r.name} in the sale package`}
                  />
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
