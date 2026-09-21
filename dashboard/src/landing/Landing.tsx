import React from "react";
import { Link } from "react-router-dom";
import logo from "/invitation-homes-logo.svg";
import mark from "/favicon.svg";
import css from "./Landing.module.css";

/**
 * Sign-in screen. The front door.
 *
 * Every other route reads the ontology on mount, which sends the browser
 * straight to Foundry's login with no context at all — a link someone opens
 * from an email lands them on a consent dialog before they know what they are
 * consenting to. This page touches no data and triggers no authentication, so
 * signing in stays a deliberate act.
 *
 * Written in-world. The reader is an executive at Invitation Homes arriving to
 * see where the portfolio stands, not somebody evaluating a piece of software.
 * So it orients them and gets out of the way: one action, no marketing.
 *
 * Their identity is a white ground with green, so this is light where the Target
 * Air door was dark. Same composition, opposite atmosphere — a deep aerospace
 * panel under this logo would read as somebody else's product.
 */

const INSIDE = [
  { label: "Rent against market", note: "Which homes sit below their submarket" },
  { label: "Resident risk", note: "Who is behind, and who is sliding" },
  { label: "Cost to hold", note: "Maintenance, capital and county tax per home" },
  { label: "Leasing pipeline", note: "Move-ins, renewals and what turnover costs" },
];

function Landing(): React.ReactElement {
  return (
    <div className={css.ihDoorShell}>
      {/* Their mark, oversized and bled off the corner. Very low contrast — it
          should register as surface, not as a logo someone forgot to size. */}
      <img src={mark} alt="" aria-hidden="true" className={css.ihDoorWatermark} />

      <div className={css.ihDoorGrid}>
        <section className={css.ihDoorBrandPane}>
          <div className={css.ihDoorLockup}>
            <img src={logo} alt="Invitation Homes" className={css.ihDoorLogo} />
            <span className={css.ihDoorProduct}>Asset Management Platform</span>
          </div>

          <h1 className={css.ihDoorTitle}>Portfolio Operations</h1>
          <p className={css.ihDoorLede}>
            Where the portfolio stands today: which homes are priced under their market,
            what each one costs to hold, and which residents are falling behind — across
            76 communities and 3,001 homes.
          </p>

          <ul className={css.ihInsideList}>
            {INSIDE.map((item) => (
              <li className={css.ihInsideItem} key={item.label}>
                <span className={css.ihInsideLabel}>{item.label}</span>
                <span className={css.ihInsideNote}>{item.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={css.ihDoorCardPane}>
          <div className={css.ihDoorCard}>
            <span className={css.ihDoorEyebrow}>Internal system</span>
            <h2 className={css.ihDoorCardTitle}>Sign in to continue</h2>
            <p className={css.ihDoorCardBody}>
              Access is governed by your Palantir Foundry account. You will be returned
              here once authentication completes.
            </p>

            <Link className={css.ihDoorButton} to="/dashboard">
              Sign in with Palantir Foundry
            </Link>

            <p className={css.ihDoorNotice}>
              Authorized personnel only. Resident payment history and portfolio pricing are
              commercially sensitive. Activity is attributed to your account.
            </p>
          </div>

          {/* The one thing a client must not have to ask about. It sits on the
              door rather than only inside, so nobody reaches a figure before
              they reach this sentence. */}
          <p className={css.ihDoorSynthetic}>
            <strong>Prototype.</strong> Invitation Homes is a real company; this data is
            not. Communities, markets and advertised rents were read from
            invitationhomes.com. Every home, resident, lease and payment below that level
            is generated.
          </p>
        </section>
      </div>

      <footer className={css.ihDoorFooter}>
        <span>Invitation Homes · Asset Management Platform</span>
        <span className={css.ihDoorCredit}>
          Built by{" "}
          <a
            className={css.ihDoorColophon}
            href="https://github.com/silverfoxmediaco/invitationhomes-assetmanager"
            target="_blank"
            rel="noreferrer"
          >
            James McEwen
          </a>{" "}
          | FDE | Full Stack Engineer · Silver Fox Media · on Palantir Foundry
        </span>
      </footer>
    </div>
  );
}

export default Landing;
