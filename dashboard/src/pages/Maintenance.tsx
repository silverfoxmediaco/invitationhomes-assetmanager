import React from "react";
import { Link } from "react-router-dom";
import { useMaintenance } from "@/data/useMaintenance";
import css from "./Overview.module.css";
import own from "./Maintenance.module.css";
import det from "./PropertyDetail.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

const MONTH_LABEL = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function Maintenance(): React.ReactElement {
  const { data, loading, error } = useMaintenance();

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/dashboard" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not load maintenance.</strong> {error.message}
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
        <div className={css.status}>Loading maintenance…</div>
      </div>
    );
  }

  const peak = data.season.reduce((m, s) => Math.max(m, s.cooling, s.heating), 1);
  const perYear = data.neglectCost / 3;

  return (
    <div className={css.page}>
      <Link to="/dashboard" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>Maintenance</h1>
        <div className={css.asOf}>
          {num.format(data.orders12m)} work orders in the last 12 months &middot; as at{" "}
          {data.today}
        </div>
      </div>

      <p className={css.verdict}>
        <span className={css.verdictFigure}>{num.format(data.neglectOrders)}</span> heating and
        cooling failures — {pct0(data.neglectSharePct)} of every HVAC call — had a skipped air
        filter as a contributing factor. The filter is the resident&rsquo;s job, and Lease Easy
        posts it to them. The repair,{" "}
        <span className={css.verdictFigure}>{usd0.format(data.neglectCost)}</span> of it, was
        the landlord&rsquo;s.
      </p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>Landlord cost, 12 mo</div>
          <div className={css.figureValue}>{usd0.format(data.landlordCost12m)}</div>
          <div className={css.figureNote}>
            {num.format(data.landlordOrders)} orders all-time
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Charged back, 12 mo</div>
          <div className={css.figureValue}>{usd0.format(data.residentChargedBack12m)}</div>
          <div className={css.figureNote}>resident responsibility</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Neglect cost</div>
          <div className={`${css.figureValue} ${det.bad}`}>{usd0.format(data.neglectCost)}</div>
          <div className={css.figureNote}>
            3 years, about {usd0.format(perYear)} a year
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Open now</div>
          <div className={css.figureValue}>{num.format(data.openCount)}</div>
          <div className={css.figureNote}>
            {num.format(data.openEmergency)} flagged emergency
          </div>
        </div>
      </div>

      <h2 className={css.sectionTitle}>The lever is frequency, not severity</h2>
      <p className={css.sectionNote}>
        A neglect-contributed HVAC failure costs{" "}
        <strong>{usd0.format(data.neglectMeanCost)}</strong> on average. Every other HVAC
        failure costs <strong>{usd0.format(data.otherHvacMeanCost)}</strong>. They are the same
        repair — a skipped filter does not make the job worse, it makes the job happen. So
        there is nothing to save per call, only calls to avoid, and the return on getting
        filters actually changed is the whole {usd0.format(perYear)} a year rather than a
        margin on it.
      </p>
      <p className={css.sectionNote}>
        The portfolio already bills residents for {num.format(data.filterOrders)} air-filter
        visits, which is the company doing the job the resident did not. That is the cheaper
        end of the same problem: a filter visit charged back costs the landlord nothing, and
        an HVAC call it would have prevented costs {usd0.format(data.neglectMeanCost)}.
      </p>

      <h2 className={css.sectionTitle}>Heating and cooling follow the weather</h2>
      <p className={css.sectionNote}>
        Every HVAC call across three years, by calendar month. Cooling failures trip in the
        summer and heating in the winter, which is obvious until you are the one staffing it —
        the two peaks are six months apart and roughly the same height, so the trade is one
        crew moving between them rather than two crews half idle.
      </p>

      <div className={own.season}>
        {data.season.map((s, i) => (
          <div key={s.month} className={own.month}>
            <div className={own.bars}>
              <div
                className={own.cooling}
                style={{ height: `${(s.cooling / peak) * 100}%` }}
                title={`${s.cooling} cooling failures in ${MONTH_LABEL[i]}`}
              />
              <div
                className={own.heating}
                style={{ height: `${(s.heating / peak) * 100}%` }}
                title={`${s.heating} heating failures in ${MONTH_LABEL[i]}`}
              />
            </div>
            <div className={own.monthLabel}>{MONTH_LABEL[i]}</div>
          </div>
        ))}
      </div>
      <p className={own.legend}>
        <span className={own.keyCooling} /> Not cooling
        <span className={own.keyHeating} /> Not heating
      </p>

      <h2 className={css.sectionTitle}>Where the work goes, last 12 months</h2>
      <p className={css.sectionNote}>
        Split by who pays under the published responsibilities. Resident-responsibility work
        is charged back, which is why it is excluded from the landlord cost on every other
        screen in this dashboard — folding it in would overstate what a home costs to own.
      </p>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Pays</th>
              <th className={css.num}>Orders</th>
              <th className={css.num}>Cost</th>
              <th className={css.num}>Per order</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={`${c.category}|${c.responsibility}`}>
                <td className={css.address}>{c.category}</td>
                <td className={c.responsibility === "resident" ? det.muted : undefined}>
                  {c.responsibility}
                </td>
                <td className={css.num}>{num.format(c.orders)}</td>
                <td className={css.num}>{usd0.format(c.cost)}</td>
                <td className={css.num}>{usd0.format(c.cost / Math.max(1, c.orders))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={css.sectionTitle}>Still open ({num.format(data.openCount)})</h2>
      <p className={css.sectionNote}>
        Oldest first. Median close times run {data.emergencyMeanDays.toFixed(1)} days for
        emergencies, {data.urgentMeanDays.toFixed(1)} for urgent and{" "}
        {data.routineMeanDays.toFixed(1)} for routine, so anything here much past a week is
        stuck rather than in progress.
      </p>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th className={css.num}>Age</th>
              <th>Opened</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Home</th>
            </tr>
          </thead>
          <tbody>
            {data.open.map((o) => (
              <tr key={o.workOrderId}>
                <td className={`${css.num} ${o.ageDays > 30 ? css.gap : ""}`}>
                  {num.format(o.ageDays)}d
                </td>
                <td className={det.muted}>{o.openedDate}</td>
                <td className={css.address}>{o.category}</td>
                <td>
                  <span
                    className={
                      o.priority === "emergency"
                        ? own.pEmergency
                        : o.priority === "urgent"
                          ? own.pUrgent
                          : own.pRoutine
                    }
                  >
                    {o.priority}
                  </span>
                </td>
                <td>
                  <Link to={`/property/${o.propertyId}`} className={css.rowLink}>
                    {o.streetAddress}
                  </Link>{" "}
                  <span className={css.state}>
                    {o.city}, {o.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.openCount > data.open.length && (
        <p className={`${css.sectionNote} ${css.tableFooter}`}>
          Showing the {num.format(data.open.length)} oldest of {num.format(data.openCount)}.
        </p>
      )}

      <p className={own.method}>
        One thing this page will not tell you: whether a vendor is slower than it promises.
        Measured against the work orders, none of the {num.format(data.vendorCount)} vendors
        runs slower than its own stated turnaround and the average is 0.7 days inside it.
        That is not a fleet of disciplined contractors, it is the synthetic data — the stated
        average is what generated the close dates, so comparing them is circular. Turnaround
        appears here as description and no vendor is ranked on it. Against real data the same
        join is worth making, and it is exactly the kind of thing the ontology is for.
      </p>
    </div>
  );
}

export default Maintenance;
