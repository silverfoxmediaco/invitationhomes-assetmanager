import React from "react";
import { Link } from "react-router-dom";
import { useSnapshot } from "@/data/useSnapshot";
import { useAdvisor, type Suggestion } from "@/data/useAdvisor";
import css from "./Advisor.module.css";

/**
 * "What to do about it" — an AIP Logic function reading the same figures the
 * page above it shows.
 *
 * Loads independently of the page it sits on. Assembling the snapshot costs
 * five parallel reads and the model then takes fifteen-odd seconds, so the
 * overview paints immediately and this fills in behind it rather than holding
 * the whole screen hostage to the slowest thing on it.
 *
 * Every suggestion shows its own workings: the figures it cites, how an impact
 * was derived, and how confident the model is. That is not decoration. A panel
 * that says "reprice Arcilla Ridge" and nothing else is a black box; one that
 * says "79% of 55 comped homes, $3,870/month gap, impact is that times twelve"
 * can be checked against the table on the same screen, and checked is the only
 * reason to trust it.
 */

const ACTION_LABEL: Record<string, string> = {
  "file-tax-appeal": "File tax appeal",
  "waive-rent-payment": "Waive or settle",
  "charge-to-resident": "Charge to resident",
  "close-work-order": "Close work order",
};

function targetLink(target: Suggestion["target"]): React.ReactNode {
  if (!target || !target.id) {
    return null;
  }
  if (target.kind === "community") {
    return (
      <Link to={`/community/${target.id}`} className={css.ihAdvTargetLink}>
        {target.id}
      </Link>
    );
  }
  if (target.kind === "property") {
    return (
      <Link to={`/property/${target.id}`} className={css.ihAdvTargetLink}>
        {target.id}
      </Link>
    );
  }
  // county, portfolio, or a kind nobody listed. Rendered, not discarded.
  return <span className={css.ihAdvTargetPlain}>{target.id}</span>;
}

function Advisor(): React.ReactElement {
  const { snapshot, loading: gathering, error: gatherError } = useSnapshot();
  const { state, rerun } = useAdvisor(snapshot);

  const body = (): React.ReactNode => {
    if (gatherError) {
      return (
        <p className={css.ihAdvNote}>
          Could not gather the figures to advise on. {gatherError.message}
        </p>
      );
    }
    if (gathering || state.status === "loading" || state.status === "idle") {
      return (
        <p className={css.ihAdvNote}>
          {gathering
            ? "Gathering portfolio figures…"
            : "Reading the portfolio and drafting recommendations…"}
        </p>
      );
    }
    if (state.status === "unconfigured") {
      return (
        <p className={css.ihAdvNote}>
          <strong>The advisor function is not published yet.</strong> {state.detail} Build it
          in AIP Logic as <code>portfolioAdvisor</code> — the input payload, output schema and
          prompt are in <code>aip-logic-spec.md</code>.
        </p>
      );
    }
    if (state.status === "error") {
      return <p className={css.ihAdvError}>{state.detail}</p>;
    }

    const { suggestions, notes } = state.result;
    if (suggestions.length === 0) {
      return (
        <p className={css.ihAdvNote}>
          The advisor found nothing in the current figures worth recommending.
        </p>
      );
    }

    return (
      <>
        <ol className={css.ihAdvList}>
          {suggestions.map((s, i) => (
            <li key={`${s.title}-${i}`} className={css.ihAdvItem}>
              <div className={css.ihAdvHead}>
                <span className={css.ihAdvRank}>{i + 1}</span>
                <h3 className={css.ihAdvTitle}>{s.title}</h3>
                <span
                  className={`${css.ihAdvConfidence} ${
                    s.confidence === "high"
                      ? css.ihAdvConfHigh
                      : s.confidence === "low"
                        ? css.ihAdvConfLow
                        : css.ihAdvConfMed
                  }`}
                >
                  {s.confidence} confidence
                </span>
              </div>

              <p className={css.ihAdvRationale}>{s.rationale}</p>

              <div className={css.ihAdvMeta}>
                {/* An empty impact is a deliberate answer, not a gap. The
                    prompt tells the model to leave it blank rather than invent
                    a figure, so the basis is shown in its place. */}
                {s.impact ? (
                  <span className={css.ihAdvImpact}>{s.impact}</span>
                ) : (
                  <span className={css.ihAdvNoImpact}>not quantified</span>
                )}
                {s.impactBasis && (
                  <span className={css.ihAdvBasis}>{s.impactBasis}</span>
                )}
                {s.horizon && <span className={css.ihAdvHorizon}>{s.horizon}</span>}
                {targetLink(s.target)}
                {s.action && ACTION_LABEL[s.action] && (
                  <span className={css.ihAdvAction} title={`Ontology action: ${s.action}`}>
                    {ACTION_LABEL[s.action]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>

        {notes && (
          <p className={css.ihAdvNotes}>
            <strong>What it could not assess.</strong> {notes}
          </p>
        )}
      </>
    );
  };

  const ready = state.status === "ready";

  return (
    <section className={css.ihAdvPanel}>
      <div className={css.ihAdvBar}>
        <div>
          <h2 className={css.ihAdvHeading}>What to do about it</h2>
          <p className={css.ihAdvSub}>
            AIP Logic, reading the same figures shown on this dashboard
          </p>
        </div>
        {ready && (
          <button type="button" className={css.ihAdvRerun} onClick={rerun}>
            Run again
          </button>
        )}
      </div>

      {body()}

      <p className={css.ihAdvMethod}>
        Generated by a Palantir AIP Logic function over the ontology. It is given only the
        figures this dashboard computed and is instructed never to cite a number that is not
        among them — so every figure below should match the screens it came from, and the
        arithmetic behind an estimate is stated rather than implied. The model reasons at
        query time and learns nothing from this data, so it would behave the same against
        real records; the inputs here are generated, as the rest of this prototype is.
      </p>
    </section>
  );
}

export default Advisor;
