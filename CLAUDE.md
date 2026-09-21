# Invitation Homes — Property Operations Platform (Foundry prototype)

## What this is

A management and C-suite operations platform for a single-family rental (SFR)
portfolio, built on Palantir Foundry: ontology first, then a React front end.

**The company is real. The data is not.** Invitation Homes (NYSE: INVH) is a
public SFR REIT. Every figure in this project is generated. Nothing here comes
from their systems, and nothing in it should be presented as their actual
operations. Same framing rule that governed Target Air: this is *"here is how I
would model your problem"*, never *"here is your business"* and never implied
experience in SFR operations that James does not have.

Practical consequences of that rule:

- Every dataset, screen and export says the data is synthetic, somewhere the
  reader cannot miss it.
- No Invitation Homes logo, brand colours or typography in a way that suggests
  this is their product or that they endorsed it.
- Numbers are plausible, not sourced. Do not cite a generated figure as a fact
  about the company.

## What we know about the real business (2026-09-21, from invitationhomes.com)

Grounding for realistic synthetic data. Verify before relying on any of it.

- Single-family rental: whole houses leased to residents, not apartments.
- **19 markets**: Atlanta, Austin, Carolinas, Chicago, Dallas, Denver, Houston,
  Jacksonville, Las Vegas, Minneapolis, Northern California, Orlando, Phoenix,
  Salt Lake City, San Antonio, Seattle, South Florida/Miami, Southern
  California, Tampa.
- Lease terms **12 to 24 months**, flexible length.
- **ProCare** maintenance, with 24/7 emergency service.
- **Lease Easy** bundle: smart-home tech (keyless entry, thermostat), air filter
  delivery, utility management.
- Pet friendly, up to 3 pets.
- Online applications and payments.

**CAUTION on portfolio size.** The per-market counts on their site (Atlanta 810,
Tampa 598, Phoenix 508, and so on) are *homes currently available to lease*, not
homes owned. The real portfolio is far larger, on the order of 80,000 homes.
Sizing the synthetic portfolio off the availability numbers would model a
company roughly two orders of magnitude too small. Pick a deliberate scale and
write down why.

## The thesis: the join

Target Air's value was never the dashboard, it was the chain that let one screen
answer a question no single system could. Same discipline here.

**Property → Lease → RentPayment → Expense / MaintenanceWorkOrder / TaxBill,
with MarketRateComp hanging off the property's submarket.**

That chain answers: **"which homes are underperforming their market rate, what
is it costing us, and is that a pricing problem or a cost problem?"**

A property management system knows the lease says $2,150. A market data feed
knows comparable homes in that submarket now rent for $2,480. The general ledger
knows this home absorbed $6,400 of maintenance and a 12% tax reassessment. No
one of those can tell you the home is $330/month under market *and* carrying
above-median costs, which is the difference between "raise the rent at renewal"
and "this asset is a problem".

Everything else on the dashboard is supporting cast. When a modelling decision
is ambiguous, the one that makes that chain traversable wins.

## Scope — five domains

1. **Inventory management** — properties, units, acquisition, disposition,
   occupancy status, condition.
2. **Rental payment tracking** — scheduled rent, payments received, arrears,
   delinquency ageing, concessions.
3. **Maintenance** — work orders, categories, vendors, cost, turnaround,
   recurring failures per property.
4. **Property tax tracking** — assessments, appeals, tax bills, payment status,
   reassessment risk by jurisdiction.
5. **Expenses, rental history, and market rate comps** — operating expense
   ledger, per-property lease history, submarket comps and trending rental
   rates over time.

The fifth is the one with analytic teeth: comps and trend are what turn the
other four from a record-keeping system into something a C-suite reads.

## Build order

1. Synthetic data generation (Python, deterministic).
2. Upload CSVs to Foundry — **James uploads**, not the agent.
3. Object types, then link types.
4. Actions, once objects and links are stable.
5. React front end, developed locally in VS Code against the OSDK.

Do not start the front end before the links exist. Target Air proved the
traversal design is what makes the UI simple, and guessing it early costs more
than it saves.

## Data generation rules

- **Deterministic.** Fixed seed, written into the generator. Regenerating must
  not reshuffle ids, or every uploaded dataset and every link breaks.
- **The data must tell a story.** Target Air's generator initially produced
  technically valid nonsense (wiring harnesses consuming autonomy compute
  modules) because two unrelated lists shared a length. Shape the data so the
  interesting case is real and findable: some homes genuinely under market, some
  genuinely cost-heavy, a jurisdiction genuinely reassessing hard.
- **Build the pages, then re-check the data.** Both Target Air data bugs were
  invisible in the CSVs and obvious the moment a page rendered them. Nothing
  errors on data that is valid and wrong.
- **Reconcile derived values after generation, not during.** Target Air's
  stock-outs were hardcoded indices chosen before shortages existed, so shorted
  parts showed healthy stock.
- Dates are realistic and internally consistent: a lease cannot start before
  acquisition, a payment cannot precede its lease, a tax bill belongs to its
  assessment year.

## Foundry gotchas — all learned the hard way, all still true

1. **Action types are NOT in the SDK** until added in Developer Console →
   Ontology SDK → Resources → Action types, *then* a new SDK version generated.
2. **Vite caches its dependency pre-bundle.** After installing a new SDK the
   browser throws "does not provide an export named X" while `tsc` passes.
   `rm -rf node_modules/.vite`.
3. **Action date parameters are `LocalDate`, not instants.** Appending
   `T00:00:00Z` "to be safe about timezones" is rejected with
   InvalidParameterValue — a LocalDate has no timezone. The read path normalises
   to UTC; the write path must not. Diagnose with
   `POST /api/v2/ontologies/{ont}/actions/{name}/apply` via curl; the error names
   the `parameterBaseType`.
4. **Enable "Allow edits"** on an object type (Datasources tab) before any action
   can modify it.
5. **Deleting ontology entities is deliberately hard** and referential integrity
   blocks saves. Do not start a bulk delete; go object type by object type and
   read each one's Links tab.
6. **Driving Foundry's UI by screenshot is slow.** For multi-step UI work, James
   clicks and the agent gives exact values per screen.
7. **CSV upload**: v1 `files:upload` is atomic; the v2 three-step wipes the
   dataset first. A raw upload carries no schema, so the ontology can silently
   serve stale data. `csv.writer` emits CRLF and `recordDelimiter` must say so.
   Diagnose with `readTable`.

## Foundry credentials

- `FOUNDRY_TOKEN` lives in `~/.zshenv`, never just `export`ed — an export-only
  token dies with the shell and the next failure gets blamed on the wrong thing.
- Use `~/Documents/Palantir/set-foundry-token.sh` (shared with the other Foundry
  projects) rather than pasting a token into the conversation. It reads
  `pbpaste`, strips the `npm install` line the copy button includes, rewrites
  `~/.zshenv`, stamps the real expiry and backs up to `.bak`.
- Two different credentials exist and the distinction matters: tokens from
  *Ontology SDK → SDK versions → Terminal (Local)* are disposable session tokens
  carrying a `sid` claim that die in hours. *Settings → Tokens* mints a real user
  token carrying `jti`. Decode the payload rather than guessing.
- The token creation date picker's year stepper is broken. Type the date in.
  The token is shown once — copy it immediately.

## Design system — read before styling anything

Pulled from invitationhomes.com's own CSS custom properties on 2026-09-21, not
eyeballed from a screenshot. These are their real token values.

### Typography

Two families, and the split is consistent:

- **Nunito** — display and section headings. Rounded, friendly, always **700**.
  Hero runs 60px, section headings 36px.
- **Hind** — body, navigation, sub-headings and UI. Body 14-16px at 400; larger
  sub-headings 32px at 500.

Inter is also loaded but does not appear in use on the homepage.

So: Nunito 700 for anything that acts as a headline, Hind for everything else.
Do not set a heading in Hind or body copy in Nunito; the contrast between the
two is the whole identity.

### Color

```css
/* Primary — the deep green on Pay Rent and primary actions */
--color-primary: #206f06;
--color-primary-light: #67bd47;
--color-primary-dark: #195f02;

/* Accent greens */
--color-accent: #67bd47;
--color-accent-dark: #63a72f;
--color-accent-light: #9fcd3c;

/* Corporate — a deep teal, the only non-green brand color */
--color-corporate-special: #27565b;

/* Secondary / text */
--color-secondary: #4d4d4d;
--color-text: #212121;        /* body copy, computed rgb(33,33,33) */
--color-white: #fff;

/* Neutral ramp, light to dark */
--color-neutral-1: #e8e8e8;
--color-neutral-2: #d4d4d4;
--color-neutral-3: #bdbdbd;
--color-neutral-4: #a6a6a6;
--color-neutral-5: #8f8f8f;
--color-neutral-6: #7a7a7a;
--color-neutral-7: #636363;
--color-neutral-8: #4d4d4d;

/* Feedback */
--color-success: #23a46e;
--color-warning: #ebcb28;
--color-error: #dd4b55;
--color-error-dark: #d33641;
--color-error-light: #ec6f77;

/* Banner tints */
--color-banner-blue: #def0fc;
--color-banner-green: #c1eb65;

/* Subtle brand gradient */
--color-gradient-1: linear-gradient(90deg, #99c7de1a 0%, #23a56e1a 100%);
```

### Applying it to a C-suite tool

Their site is a consumer leasing funnel: white ground, large photography, green
calls to action. This project is a dense internal operations dashboard, so the
palette carries over but the proportions do not.

- Green is for **action and brand**, not for "good". `--color-primary` on the
  primary button and active nav; it should stay scarce enough to mean something.
- `--color-success` (#23a46e) and `--color-primary` (#206f06) are both green and
  will read as the same thing in a dense table. Pick one job per green: use
  primary for interactive, success only in a status column, and never adjacent.
- The neutral ramp is the workhorse. Tables, borders and secondary text come
  from neutrals 1 through 8, not from tinted greens.
- `--color-corporate-special` (#27565b) is the one deep, serious color in the
  set and is the natural choice for a dark dashboard chrome or header if we want
  one, since it is on-brand without being another green.
- **Do not invent colors.** If something needs a hue the tokens do not have, say
  so rather than reaching for an arbitrary one.

## Conventions

- **US spelling throughout.** program, center, color, normalize, behavior.
  British spellings are a tell on work aimed at a US company.
- **Unique className identifiers** on every component, to avoid global CSS
  collisions.
- **No emojis in code** unless asked.
- **Complete files, not fragments**, when delivering code.
- **Mobile is not the target here.** Unlike SexySelfies, this is a desktop
  C-suite and operations tool. Dense tables, real screen width.
- **Record every change in `editsummary.txt`**, appended at the bottom.

## Open questions

- Portfolio scale for the synthetic set: how many properties, across how many of
  the 19 markets? Affects generation time, Foundry indexing and what the
  dashboard has to aggregate.
- Is there a real audience for this (a pitch, an interview, a client) or is it a
  portfolio piece? Changes how much polish the front end needs.
- Does market comp data need a plausible external source modelled, or is a
  generated submarket rate curve enough?
