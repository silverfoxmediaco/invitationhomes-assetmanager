import React from "react";
import { Link, useParams } from "react-router-dom";
import { useCommunity } from "@/data/useCommunity";
import css from "./Overview.module.css";
import own from "./CommunityList.module.css";
import det from "./PropertyDetail.module.css";

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-US");
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

function CommunityDetail(): React.ReactElement {
  const { slug } = useParams();
  const { data, loading, error } = useCommunity(slug);

  if (error) {
    return (
      <div className={css.page}>
        <Link to="/communities" className={own.back}>
          &larr; All communities
        </Link>
        <div className={css.error}>
          <strong>Could not load this community.</strong> {error.message}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className={css.page}>
        <Link to="/communities" className={own.back}>
          &larr; All communities
        </Link>
        <div className={css.status}>Loading community…</div>
      </div>
    );
  }

  const underPct = data.comped ? data.underMarket / data.comped : 0;
  const annualRent = data.rentRollPerMonth * 12;
  const costTotal = data.costPerHome * data.homeCount;

  // Same question as the property page, asked of forty houses at once.
  const verdict = (() => {
    const heavyCost = annualRent > 0 && costTotal > annualRent * 0.45;
    if (underPct > 0.5 && heavyCost) {
      return "Most of this community is under market AND it is expensive to hold. Repricing at renewal recovers part of it, but the cost side needs its own answer.";
    }
    if (underPct > 0.5) {
      return "Most of this community is priced below market while costing no more than usual to run. That is a pricing decision, and it is one decision rather than one per house.";
    }
    if (heavyCost) {
      return "Rents here are broadly at market, but the community is expensive to hold. The question is what is driving the cost, not what to charge.";
    }
    return "Rents are broadly at market and costs are in normal range.";
  })();

  return (
    <div className={css.page}>
      <Link to="/communities" className={own.back}>
        &larr; All communities
      </Link>

      <div className={css.masthead}>
        <h1 className={css.title}>{data.name}</h1>
        <div className={css.asOf}>
          {data.city}, {data.state} &middot; {data.county} County &middot; {data.market} &middot;
          rents as of {data.asOfMonth}
        </div>
      </div>

      <p className={det.verdict}>{verdict}</p>

      <div className={css.figures}>
        <div className={css.figure}>
          <div className={css.figureLabel}>Homes</div>
          <div className={css.figureValue}>{num.format(data.homeCount)}</div>
          <div className={css.figureNote}>{pct0(data.occupancyPct)} occupied</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Under market</div>
          <div className={css.figureValue}>{num.format(data.underMarket)}</div>
          <div className={css.figureNote}>
            {data.comped ? `${pct0(underPct)} of ${data.comped} comped` : "no comps"}
          </div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Gap to market</div>
          <div className={css.figureValue}>{usd0.format(data.gapPerMonth)}</div>
          <div className={css.figureNote}>a month, {usd0.format(data.gapPerMonth * 12)} a year</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Cost per home</div>
          <div className={css.figureValue}>{usd0.format(data.costPerHome)}</div>
          <div className={css.figureNote}>a year, landlord only</div>
        </div>
        <div className={css.figure}>
          <div className={css.figureLabel}>Rent owed</div>
          <div className={css.figureValue}>{usd0.format(data.arrearsTotal)}</div>
          <div className={css.figureNote}>
            {num.format(data.residentsBehind)} residents behind
          </div>
        </div>
      </div>

      <div className={det.cols}>
        <section>
          <h2 className={css.sectionTitle}>Cost per home, trailing 12 months</h2>
          <dl className={det.facts}>
            <dt>Maintenance</dt>
            <dd>{usd0.format(data.maintenancePerHome)}</dd>
            <dt>CapEx</dt>
            <dd>
              {usd0.format(data.capexPerHome)}{" "}
              <span className={det.muted}>episodic</span>
            </dd>
            <dt>Operating</dt>
            <dd>{usd0.format(data.opexPerHome)}</dd>
            <dt>Property tax</dt>
            <dd>{usd0.format(data.taxPerHome)}</dd>
            <dt>Total</dt>
            <dd>
              <strong>{usd0.format(data.costPerHome)}</strong>
            </dd>
          </dl>
        </section>

        <section>
          <h2 className={css.sectionTitle}>Why the tax looks like it does</h2>
          <dl className={det.facts}>
            <dt>County</dt>
            <dd>{data.county}</dd>
            <dt>Reassessed</dt>
            <dd>{data.reassessmentCycle ?? "—"}</dd>
            <dt>Mill rate</dt>
            <dd>{data.millRate != null ? data.millRate.toFixed(4) : "—"}</dd>
          </dl>
          <p className={own.method} style={{ marginTop: "var(--ih-space-md)", paddingTop: 0, borderTop: "none" }}>
            The reassessment cycle is the part no operator can manage around. A county that
            re-cuts every year moves the tax line every year; one on a longer cycle, or capped,
            does not.
          </p>
        </section>

        <section>
          <h2 className={css.sectionTitle}>Pricing</h2>
          <dl className={det.facts}>
            <dt>Advertised from</dt>
            <dd>
              {data.startingRent != null ? usd0.format(data.startingRent) : "not published"}
            </dd>
            <dt>Rent roll</dt>
            <dd>{usd0.format(data.rentRollPerMonth)} / mo</dd>
            <dt>Below advertised</dt>
            <dd className={data.belowAdvertised > 0 ? det.bad : undefined}>
              {data.startingRent != null ? `${data.belowAdvertised} homes` : "—"}
            </dd>
          </dl>
        </section>
      </div>

      <h2 className={css.sectionTitle}>Every home</h2>
      <p className={css.sectionNote}>
        Sorted by gap to market, widest first. Market median is for this city and bedroom
        count in {data.asOfMonth}.
      </p>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Address</th>
              <th className={css.num}>Beds</th>
              <th className={css.num}>Sq ft</th>
              <th>Status</th>
              <th>Resident</th>
              <th className={css.num}>Contract</th>
              <th className={css.num}>Market</th>
              <th className={css.num}>Gap / mo</th>
              <th className={css.num}>Owed</th>
              <th>Lease ends</th>
            </tr>
          </thead>
          <tbody>
            {data.homes.map((h) => (
              <tr key={h.propertyId}>
                <td className={css.address}>
                  <Link to={`/property/${h.propertyId}`} className={css.rowLink}>
                    {h.streetAddress}
                  </Link>
                </td>
                <td className={css.num}>{h.beds}</td>
                <td className={css.num}>{num.format(h.sqft)}</td>
                <td className={h.status === "occupied" ? undefined : det.muted}>{h.status}</td>
                <td>{h.residentName ?? <span className={det.muted}>—</span>}</td>
                <td className={css.num}>
                  {h.contractRent != null ? usd0.format(h.contractRent) : "—"}
                </td>
                <td className={css.num}>
                  {h.marketMedian != null ? usd0.format(h.marketMedian) : "—"}
                </td>
                <td
                  className={`${css.num} ${h.gapPerMonth != null && h.gapPerMonth > 0 ? css.gap : ""}`}
                >
                  {h.gapPerMonth != null && h.gapPerMonth > 0 ? usd0.format(h.gapPerMonth) : "—"}
                </td>
                <td className={`${css.num} ${h.balance > 0 ? css.gap : ""}`}>
                  {h.balance > 0 ? usd0.format(h.balance) : "—"}
                </td>
                <td className={det.muted}>{h.leaseEndDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CommunityDetail;
