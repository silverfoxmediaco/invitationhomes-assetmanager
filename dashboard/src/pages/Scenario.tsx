import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useScenario } from "@/data/useScenario";
import css from "./Overview.module.css";
import own from "./Scenario.module.css";
import det from "./PropertyDetail.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

const HORIZONS: { days: number; label: string }[] = [
  { days: 90, label: "Next 90 days" },
  { days: 180, label: "Next 6 months" },
  { days: 365, label: "Next 12 months" },
];

function Scenario(): React.ReactElement {
  const [params, setParams] = useSearchParams();

  // Both inputs live in the URL so a scenario is a link. "Here is the 3% case"
  // is a thing someone sends a colleague, and a number they have to re-enter
  // is a number they enter differently.
  const raise = Number(params.get("raise") ?? "2.5");
  const horizonDays = Number(params.get("horizon") ?? "90");

  const set = (key: string, value: string): void => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const { data, loading, error } = useScenario({
    increasePct: (Number.isFinite(raise) ? raise : 0) / 100,
    horizonDays: Number.isFinite(horizonDays) ? horizonDays : 90,
  });

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/dashboard" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not model the scenario.</strong> {error.message}
        </div>
      </div>
    );
  }

  const controls = (
    <div className={own.ihScControls}>
      <div className={own.ihScField}>
        <label className={own.ihScLabel} htmlFor="raise">
          Raise renewals by
        </label>
        <div className={own.ihScRaiseRow}>
          <input
            id="raise"
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={raise}
            onChange={(e) => set("raise", e.target.value)}
            className={own.ihScSlider}
            aria-label="Rent increase percentage"
          />
          <div className={own.ihScNumberWrap}>
            <input
              type="number"
              min="0"
              max="25"
              step="0.1"
              value={raise}
              onChange={(e) => set("raise", e.target.value)}
              className={own.ihScNumber}
              aria-label="Rent increase percentage, exact"
            />
            <span className={own.ihScPercent}>%</span>
          </div>
        </div>
      </div>

      <div className={own.ihScField}>
        <span className={own.ihScLabel}>On leases expiring</span>
        <div className={own.ihScTabs}>
          {HORIZONS.map((h) => (
            <button
              key={h.days}
              type="button"
              className={`${own.ihScTab} ${horizonDays === h.days ? own.ihScTabActive : ""}`}
              onClick={() => set("horizon", String(h.days))}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className={css.page}>
      <Link to="/dashboard" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>Renewal scenario</h1>
        <div className={css.asOf}>
          {data ? `market rents as of ${data.asOfMonth}` : "loading"}
        </div>
      </div>

      {controls}

      {loading || !data ? (
        <div className={css.status}>Modelling…</div>
      ) : data.leases === 0 ? (
        <p className={css.sectionNote}>
          No active leases expire in this window.
        </p>
      ) : (
        <>
          <p className={css.verdict}>
            Raising renewals <span className={css.verdictFigure}>{pct1(raise / 100)}</span> on
            the {num.format(data.leases)} leases expiring in this window adds{" "}
            <span className={css.verdictFigure}>{usd0.format(data.addedAnnual)}</span> a year.
            It is wiped out by{" "}
            <span className={css.verdictFigure}>
              {num.format(Math.round(data.breakEvenTurns))}
            </span>{" "}
            extra departures — {pct0(data.breakEvenPct)} of those leases.
          </p>

          <div className={css.figures}>
            <div className={css.figure}>
              <div className={css.figureLabel}>Leases in window</div>
              <div className={css.figureValue}>{num.format(data.leases)}</div>
              <div className={css.figureNote}>
                {usd0.format(data.rentRollMonthly)} a month today
              </div>
            </div>
            <div className={css.figure}>
              <div className={css.figureLabel}>Added rent</div>
              <div className={css.figureValue}>{usd0.format(data.addedAnnual)}</div>
              <div className={css.figureNote}>
                a year, {usd0.format(data.addedMonthly)} a month
              </div>
            </div>
            <div className={css.figure}>
              <div className={css.figureLabel}>Cost of one turn</div>
              <div className={css.figureValue}>{usd0.format(data.turnCost.total)}</div>
              <div className={css.figureNote}>measured, not assumed</div>
            </div>
            <div className={css.figure}>
              <div className={css.figureLabel}>Break-even</div>
              <div className={`${css.figureValue} ${own.ihScBreakeven}`}>
                {num.format(Math.round(data.breakEvenTurns))}
              </div>
              <div className={css.figureNote}>
                extra departures, {pct0(data.breakEvenPct)} of the window
              </div>
            </div>
            <div className={css.figure}>
              <div className={css.figureLabel}>Above market after</div>
              <div className={css.figureValue}>{num.format(data.aboveMarketAfter)}</div>
              <div className={css.figureNote}>
                was {num.format(data.aboveMarketBefore)} before the rise
              </div>
            </div>
          </div>

          <h2 className={css.sectionTitle}>What this does not tell you</h2>
          <p className={css.sectionNote}>
            It does not predict how residents react. There is no elasticity in this data and
            there cannot be — residents who left have no recorded offer, so nothing says what
            increase they walked away from. A tool that answered &ldquo;a {pct1(raise / 100)}{" "}
            rise costs you four points of retention&rdquo; would be inventing the one number
            the question turns on, and inventing it with a confident face.
          </p>
          <p className={css.sectionNote}>
            So it reports the break-even instead. At {pct1(raise / 100)} you add{" "}
            {usd0.format(data.addedAnnual)}; each additional departure costs{" "}
            {usd0.format(data.turnCost.total)}; the increase pays for itself as long as it
            drives fewer than <strong>{num.format(Math.round(data.breakEvenTurns))}</strong>{" "}
            extra move-outs. Whether {pct0(data.breakEvenPct)} of this cohort would walk over{" "}
            {pct1(raise / 100)} is a judgement about your market, and it is yours to make —
            but it is now a judgement about one number rather than about the whole decision.
          </p>

          <h2 className={css.sectionTitle}>What a turn costs, and why</h2>
          <p className={css.sectionNote}>
            Derived from the expense ledger across {num.format(data.turnCost.events)} turns in
            the last twelve months, not assumed. Vacancy is measurable because utilities bill
            only while a home is empty — residents pay their own — so the utility rows per
            turn are the vacant months, and the rent forgone across them is the largest single
            component.
          </p>

          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>Component</th>
                  <th className={css.num}>Per turn</th>
                  <th>How it is derived</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={css.address}>Rent forgone while empty</td>
                  <td className={css.num}>{usd0.format(data.turnCost.lostRent)}</td>
                  <td className={det.muted}>
                    {data.turnCost.vacantMonths.toFixed(2)} vacant months at average rent
                  </td>
                </tr>
                <tr>
                  <td className={css.address}>Turn work</td>
                  <td className={css.num}>{usd0.format(data.turnCost.turnWork)}</td>
                  <td className={det.muted}>Turn expense per turn event</td>
                </tr>
                <tr>
                  <td className={css.address}>Marketing</td>
                  <td className={css.num}>{usd0.format(data.turnCost.marketing)}</td>
                  <td className={det.muted}>Marketing expense per turn event</td>
                </tr>
                <tr>
                  <td className={css.address}>Utilities while empty</td>
                  <td className={css.num}>{usd0.format(data.turnCost.utilities)}</td>
                  <td className={det.muted}>Billed only during vacancy</td>
                </tr>
                <tr>
                  <td className={css.address}>
                    <strong>Total</strong>
                  </td>
                  <td className={`${css.num} ${own.ihScTotal}`}>
                    {usd0.format(data.turnCost.total)}
                  </td>
                  <td className={det.muted}>
                    {usd0.format(data.turnCost.total / Math.max(1, data.turnCost.vacantMonths))}{" "}
                    per vacant month equivalent
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className={css.sectionTitle}>Is {pct1(raise / 100)} enough?</h2>
          <p className={css.sectionNote}>
            {data.belowMarketAfter > 0 ? (
              <>
                Even after the rise, <strong>{num.format(data.belowMarketAfter)}</strong> of
                these homes would still sit below their city and bedroom-count median, by{" "}
                {usd0.format(data.headroomMonthly)} a month between them —{" "}
                {usd0.format(data.headroomMonthly * 12)} a year still on the table. The risk in
                this scenario may be that it is too timid rather than too bold.
              </>
            ) : (
              <>
                After the rise, every home in this window would be at or above its market
                median. Beyond this point the increase is no longer catching up to the market;
                it is leading it.
              </>
            )}
          </p>

          <p className={own.ihScMethod}>
            Reads active leases, their homes&rsquo; market comparables, and the expense ledger.
            Moving the controls re-runs the arithmetic, not the queries. Retention across the
            portfolio currently runs {pct0(data.currentRetentionPct)}, shown for reference only
            — it is not an input to this model, because applying a portfolio-wide average to a
            specific cohort facing a specific increase would be the same invention this page
            refuses to make.
          </p>
        </>
      )}
    </div>
  );
}

export default Scenario;
