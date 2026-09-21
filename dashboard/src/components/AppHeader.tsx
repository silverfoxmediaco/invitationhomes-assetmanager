import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logo from "/invitation-homes-logo.svg";
import css from "./AppHeader.module.css";

/**
 * The chrome every screen sits under.
 *
 * Drilling in is still the primary path — the portfolio verdict leads to the
 * community that caused it, which leads to the home, which leads to the
 * resident. But eight screens is past the point where drill-through alone is
 * enough: getting from maintenance to rent collection meant going back to the
 * start. The menu is the shortcut, not the intended route, which is why it
 * stays behind a button instead of spreading a nav bar across the top.
 *
 * It slides in from the right over a dimmed page rather than pushing the
 * content down. A panel that expands the header reflows everything below it,
 * so the figure someone was reading jumps down the screen the moment they
 * reach for the menu.
 *
 * Grouped by the question being asked rather than by object type. An asset
 * manager does not think "I need the Lease screen", they think "is anything
 * about to expire" — so the groups are the portfolio, the revenue and the
 * operations, and the screens sit under whichever question they answer.
 */

interface Item {
  to: string;
  label: string;
  note: string;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Portfolio",
    items: [
      { to: "/", label: "Overview", note: "What the portfolio is leaving on the table" },
      { to: "/properties", label: "All homes", note: "Every property, searchable" },
      { to: "/communities", label: "Communities", note: "The portfolio as 76 acquisitions" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { to: "/collections", label: "Rent collection", note: "Collected, and collected on time" },
      { to: "/leasing", label: "Leasing", note: "Move-ins, renewals and what leaving costs" },
      { to: "/at-risk", label: "Residents at risk", note: "Who is behind and who is sliding" },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        to: "/maintenance",
        label: "Maintenance",
        note: "Who pays, and where duty becomes cost",
      },
    ],
  },
];

function AppHeader(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Navigating closes the menu. Without this the panel stays open over the
  // page the user just asked for, which reads as the click not working.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  // Hold the page still behind the drawer. Without this the background scrolls
  // under the panel on a trackpad and the page is somewhere else on close.
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const current = location.pathname;

  return (
    <header className={css.header}>
      <div className={css.bar}>
        <Link to="/" className={css.brand} aria-label="Invitation Homes, portfolio overview">
          <img src={logo} alt="Invitation Homes" className={css.logo} />
          <span className={css.product}>Asset Management Platform</span>
        </Link>

        <div className={css.right}>
          <span className={css.prototype}>Prototype &middot; synthetic data</span>
          <button
            ref={buttonRef}
            type="button"
            className={css.menuButton}
            aria-expanded={open}
            aria-controls="app-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`${css.bun} ${open ? css.bunOpen : ""}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div
        className={`${css.backdrop} ${open ? css.backdropOpen : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        id="app-menu"
        ref={panelRef}
        className={`${css.drawer} ${open ? css.drawerOpen : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Sections"
      >
        <div className={css.drawerHead}>
          <span className={css.drawerTitle}>Sections</span>
          <button
            type="button"
            className={css.close}
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className={css.drawerBody}>
          {GROUPS.map((group) => (
            <nav key={group.title} className={css.group} aria-label={group.title}>
              <h2 className={css.groupTitle}>{group.title}</h2>
              <ul className={css.list}>
                {group.items.map((item) => {
                  const active =
                    item.to === "/" ? current === "/" : current.startsWith(item.to);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={`${css.item} ${active ? css.itemActive : ""}`}
                        aria-current={active ? "page" : undefined}
                        tabIndex={open ? 0 : -1}
                      >
                        <span className={css.itemLabel}>{item.label}</span>
                        <span className={css.itemNote}>{item.note}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <p className={css.drawerFoot}>
          Prototype on Palantir Foundry &middot; synthetic data
        </p>
      </div>

    </header>
  );
}

export default AppHeader;
