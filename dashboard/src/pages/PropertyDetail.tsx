import React from "react";
import { Link, useParams } from "react-router-dom";
import { useProperty } from "@/data/useProperty";
import css from "./Overview.module.css";
import own from "./PropertyDetail.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function PropertyDetail(): React.ReactElement {
  const { propertyId } = useParams();
  const { data, loading, error } = useProperty(propertyId);

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/" className={own.back}>
          &larr; Portfolio overview
        </Link>
        <div className={css.error}>
          <strong>Could not load this home.</strong> {error.message}
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
        <div className={css.status}>Loading home…</div>
      </div>
    );
  }

  const p = data.property;
  const under = data.gapPerMonth != null && data.gapPerMonth > 0;

  // The whole point of this screen: a gap to market means something different
  // depending on what the home costs to run.
  const verdict = (() => {
    if (data.contractRent == null) {
      return `This home is ${p.status}. No active lease, so there is no rent to compare.`;
    }
    if (!under) {
      return "This home is at or above its local market rate.";
    }
    const heavyCost = data.annualCost > (data.annualRent ?? 0) * 0.45;
    if (!heavyCost) {
      return "Under market on rent, with costs in normal range. This is a pricing decision, not a cost problem.";
    }
    // Heavy cost means something different depending on what it is made of. A
    // roof replaced once is not a home that is expensive to run, and treating
    // the two alike would argue for selling a house that simply had a bad year.
    const capexLed = data.capex12m > data.annualCost * 0.3;
    return capexLed
      ? "Under market, and the last twelve months carried a large capital item. Strip that out and the running costs are ordinary — the gap to market is the live problem, not the spend."
      : "Under market AND expensive to run, with the cost in recurring items rather than one-off capital. Raising rent at renewal closes part of the gap, but the cost side needs its own answer.";
  })();

  return (
    <div className={css.page}>
      <Link to="/" className={own.back}>
        &larr; Portfolio overview
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>{p.streetAddress}</h1>
        <div className={css.asOf}>
          {data.communityName} &middot; {p.city}, {p.state} &middot; {data.county} County
        </div>
      </div>

      <p className={own.verdict}>{verdict}</p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>Contract rent</div>
          <div className={css.figureValue}>
            {data.contractRent != null ? usd0.format(data.contractRent) : "—"}
          </div>
          <div className={css.figureNote}>
            {data.leaseStart ? `since ${data.leaseStart}` : p.status}
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Market median</div>
          <div className={css.figureValue}>
            {data.marketMedian != null ? usd0.format(data.marketMedian) : "—"}
          </div>
          <div className={css.figureNote}>
            {p.beds} bed in {p.city}
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Gap to market</div>
          <div className={`${css.figureValue} ${under ? own.bad : own.good}`}>
            {data.gapPerMonth != null ? usd0.format(data.gapPerMonth) : "—"}
          </div>
          <div className={css.figureNote}>per month</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Cost, 12 mo</div>
          <div className={css.figureValue}>{usd0.format(data.annualCost)}</div>
          <div className={css.figureNote}>landlord only</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Net, 12 mo</div>
          <div className={css.figureValue}>
            {data.netPerYear != null ? usd0.format(data.netPerYear) : "—"}
          </div>
          <div className={css.figureNote}>rent less cost</div>
        </div>
      </div>

      <div className={own.cols}>
        <section>
          <h2 className={css.sectionTitle}>The home</h2>
          <dl className={own.facts}>
            <dt>Beds / baths</dt>
            <dd>
              {p.beds} / {p.baths}
            </dd>
            <dt>Size</dt>
            <dd>{num.format(p.sqft)} sq ft</dd>
            <dt>Built</dt>
            <dd>{p.yearBuilt}</dd>
            <dt>Acquired</dt>
            <dd>
              {p.acquisitionDate} for {usd0.format(p.acquisitionPrice)}
            </dd>
            <dt>Status</dt>
            <dd>{p.status}</dd>
            <dt>Market</dt>
            <dd>{data.market}</dd>
          </dl>
        </section>

        <section>
          <h2 className={css.sectionTitle}>Cost, trailing 12 months</h2>
          <dl className={own.facts}>
            <dt>Maintenance</dt>
            <dd>{usd0.format(data.maintenanceLandlord)}</dd>
            <dt>CapEx</dt>
            <dd>
              {usd0.format(data.capex12m)} <span className={own.muted}>episodic</span>
            </dd>
            <dt>Operating expenses</dt>
            <dd>{usd0.format(data.expenses12m)}</dd>
            <dt>Property tax</dt>
            <dd>{usd0.format(data.taxAnnual)}</dd>
            <dt>Assessment change</dt>
            <dd>
              {data.taxChangePct != null ? pct1(data.taxChangePct) : "—"}
              {data.appealStatus && data.appealStatus !== "none"
                ? ` (appeal ${data.appealStatus})`
                : ""}
            </dd>
            <dt>Resident-paid work</dt>
            <dd>
              {usd0.format(data.maintenanceResident)}{" "}
              <span className={own.muted}>charged back, not a landlord cost</span>
            </dd>
          </dl>
        </section>

        <section>
          <h2 className={css.sectionTitle}>Resident</h2>
          {data.residentName ? (
            <dl className={own.facts}>
              <dt>Name</dt>
              <dd>{data.residentName}</dd>
              <dt>Lease</dt>
              <dd>
                {data.leaseStart} to {data.leaseEnd}
              </dd>
              <dt>Paid on time</dt>
              <dd>{data.paymentsOnTime}</dd>
              <dt>Late or partial</dt>
              <dd className={data.paymentsLate > 0 ? own.bad : undefined}>
                {data.paymentsLate}
              </dd>
              <dt>Missed</dt>
              <dd className={data.paymentsMissed > 0 ? own.bad : undefined}>
                {data.paymentsMissed}
              </dd>
            </dl>
          ) : (
            <p className={own.muted}>No active lease.</p>
          )}
        </section>
      </div>

      <h2 className={css.sectionTitle}>Maintenance history</h2>
      <p className={css.sectionNote}>
        {num.format(data.workOrderCount)} work orders in total.
        {data.neglectCount > 0 && (
          <>
            {" "}
            <strong>{data.neglectCount}</strong> were heating or cooling failures where a
            skipped air-filter change contributed — the resident&rsquo;s responsibility
            under the published split, but the landlord paid for the repair.
          </>
        )}
      </p>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Opened</th>
              <th>Category</th>
              <th>Pays</th>
              <th className={css.num}>Cost</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {data.workOrders.map((w) => (
              <tr key={w.workOrderId}>
                <td>{w.openedDate}</td>
                <td>
                  {w.category}
                  {w.contributingNeglect && (
                    <span className={own.flag} title="Resident neglect contributed">
                      neglect
                    </span>
                  )}
                </td>
                <td className={w.responsibility === "resident" ? own.muted : undefined}>
                  {w.responsibility}
                </td>
                <td className={css.num}>{usd0.format(w.cost)}</td>
                <td className={own.muted}>{w.closedDate || "open"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PropertyDetail;
