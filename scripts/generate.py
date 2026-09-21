#!/usr/bin/env python3
"""
Synthetic data generator — Invitation Homes property operations prototype.

Communities portfolio only. 76 REAL communities scraped from their site;
everything below the Community line is generated.

    cd invitationhomes-foundry && python3 scripts/generate.py

Writes CSVs to data/generated/. Deterministic: same seed, same output, same
ids. Regenerating must never reshuffle ids or every uploaded dataset and every
Foundry link breaks.

Reads from data/reference/:
    invitation-homes-community-details.csv   76 communities, real rents/beds
    city-county.csv                          60 cities -> 42 counties
"""

import csv, io, os, random, math
from datetime import date, timedelta
from collections import defaultdict, Counter

SEED = 1947                      # same seed as Target Air, for no reason but habit
AS_OF = date(2026, 9, 30)
START = date(2023, 10, 1)        # 36 months of history
TARGET_PROPERTIES = 3000

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "data", "reference")
OUT = os.path.join(ROOT, "data", "generated")

rng = random.Random(SEED)

# ---------------------------------------------------------------- seasonality

# Move-ins cluster May-August. Roughly 45% of lease starts land in those four
# months, which then drives turn cost and vacancy 12-24 months later.
LEASE_START_WEIGHT = {1: .05, 2: .05, 3: .07, 4: .08, 5: .11, 6: .13,
                      7: .12, 8: .09, 9: .07, 10: .07, 11: .05, 12: .05}

# On-time payment rate by month. January is the post-holiday dip; August and
# September soften with school-year moves.
ONTIME_BASE = {1: .88, 2: .93, 3: .95, 4: .96, 5: .96, 6: .95,
               7: .95, 8: .92, 9: .92, 10: .95, 11: .95, 12: .91}

HOT_STATES = {"FL", "TX", "AZ"}          # summer HVAC load
FREEZE_STATES = {"TX", "CO", "TN", "NC"} # winter plumbing/freeze load

# Maintenance follows Invitation Homes' PUBLISHED resident-responsibility split
# (invitationhomes.com/resident-responsibilities, read 2026-09-21). Their words:
# "we handle the big stuff like appliances, fences, and heating/cooling issues.
# The smaller items - such as air filters and pest control - are your
# responsibility."
#
# This matters for cost, not just labelling. Lawn, sprinkler, pool and pest are
# the RESIDENT's, so none of them is a landlord operating expense. An earlier
# draft was about to add ~$10.5M of landlord-paid lawn care to a portfolio where
# the resident pays for it.
#
# Resident-responsibility requests are still logged: residents do submit them,
# the company triages them, and the cost is charged back. Keeping them visible
# with chargedToResident = True is what lets a dashboard separate "what we spend"
# from "what we handle".
#
# category: (responsibility, cost_lo, cost_hi, vendor_family)
MAINT = {
    "HVAC - not cooling":          ("landlord", 240, 3800, "HVAC"),
    "HVAC - not heating":          ("landlord", 220, 3200, "HVAC"),
    "Plumbing - leak":             ("landlord", 180, 2600, "Plumbing"),
    "Plumbing - water heater":     ("landlord", 450, 2400, "Plumbing"),
    "Plumbing - major clog":       ("landlord", 150,  900, "Plumbing"),
    "Plumbing - hardware":         ("landlord", 120,  800, "Plumbing"),
    "Appliance - garbage disposal":("landlord", 110,  600, "Appliance"),
    "Appliance":                   ("landlord", 140, 1500, "Appliance"),
    "Roof":                        ("landlord", 300, 7500, "Roof"),
    "Fence":                       ("landlord", 250, 3200, "General"),
    "Garage door":                 ("landlord", 180, 1600, "General"),
    "Electrical":                  ("landlord", 120, 1900, "Electrical"),
    "Turn":                        ("landlord", 800, 6500, "Turn"),
    "Lawn maintenance":            ("resident",  60,  400, "Landscaping"),
    "Sprinkler":                   ("resident",  90,  600, "Landscaping"),
    "Pool maintenance":            ("resident", 120,  900, "General"),
    "Pest control":                ("resident",  80,  450, "General"),
    "Air filter":                  ("resident",  15,   60, "General"),
    "Plumbing - minor clog":       ("resident",  90,  350, "Plumbing"),
}

def maint_weights(month, state):
    """Category mix for a work order in this month and state."""
    w = {k: .45 for k in MAINT}
    w.update({"HVAC - not cooling": 1.0, "Plumbing - leak": 1.0,
              "Appliance": .8, "Electrical": .6, "Roof": .4, "Turn": .5,
              "Lawn maintenance": .7, "Pest control": .6, "Air filter": .5})
    if state in HOT_STATES and month in (6, 7, 8, 9):
        w["HVAC - not cooling"] = 3.2            # the hot markets carry the summer load
    if month in (11, 12, 1, 2):
        w["HVAC - not heating"] = 2.4 if state in FREEZE_STATES else 1.1
    if state in FREEZE_STATES and month in (12, 1, 2):
        w["Plumbing - leak"] = 2.6               # freeze damage
        w["Plumbing - water heater"] = 1.3
    if month in (3, 4, 5, 9, 10):
        w["Lawn maintenance"] = 1.4
        w["Sprinkler"] = .9
    if month in (5, 6, 7, 8):
        w["Turn"] = 1.9                          # turns follow the leasing calendar, not weather
        w["Pool maintenance"] = 1.2
    return w

def month_iter(a, b):
    y, m = a.year, a.month
    while (y, m) <= (b.year, b.month):
        yield date(y, m, 1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

def add_months(d, n):
    y, m = divmod((d.year * 12 + d.month - 1) + n, 12)
    m += 1
    return date(y, m, min(d.day, [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30,
                                  31, 31, 30, 31, 30, 31][m - 1]))

def w_choice(d):
    tot = sum(d.values()); r = rng.uniform(0, tot); acc = 0
    for k, v in d.items():
        acc += v
        if r <= acc:
            return k
    return list(d)[-1]

# ------------------------------------------------------------------- reference

def read(name):
    return list(csv.DictReader(io.open(os.path.join(REF, name), encoding="utf-8")))

communities = read("invitation-homes-community-details.csv")
county_map = {(r["city"], r["state"]): r for r in read("city-county.csv")}

# Three communities publish no starting rent (fully leased or unreleased). Do
# NOT invent an observed value: fall back to the market median and mark the
# anchor as estimated so nothing downstream mistakes it for something scraped.
market_rents = defaultdict(list)
for c in communities:
    if c["starting_rent"]:
        market_rents[c["market"]].append(int(c["starting_rent"]))

for c in communities:
    if c["starting_rent"]:
        c["_rent"], c["_anchor"] = int(c["starting_rent"]), "scraped"
    else:
        med = sorted(market_rents[c["market"]])
        c["_rent"] = med[len(med) // 2] if med else 2200
        c["_anchor"] = "estimated"
    c["_beds_min"] = int(c["beds_min"]) if c["beds_min"] else 3
    c["_beds_max"] = int(c["beds_max"]) if c["beds_max"] else max(c["_beds_min"], 4)
    cc = county_map.get((c["city"], c["state"]))
    c["_county"] = cc["county"] if cc else ""
    c["_zip"] = cc["primary_zip"] if cc else ""

# ------------------------------------------------------------------- counties

# Mill rate and reassessment behaviour drive the tax story, and they differ by
# STATE regime, not by market: CA caps assessment growth (Prop 13) until a sale
# resets it; TX reassesses annually and hard; FL's homestead cap does not apply
# to non-homestead rentals.
STATE_TAX = {  # (mill rate, annual assessment drift, cycle)
    "TX": (.0218, .085, "annual"), "FL": (.0108, .062, "annual"),
    "GA": (.0104, .055, "annual"), "NC": (.0086, .035, "octennial"),
    "AZ": (.0065, .045, "annual"), "CO": (.0055, .050, "biennial"),
    "TN": (.0072, .040, "quadrennial"), "UT": (.0061, .048, "annual"),
    "CA": (.0075, .020, "capped-prop13"),
}

counties = {}
for c in communities:
    key = (c["_county"], c["state"])
    if c["_county"] and key not in counties:
        mill, drift, cycle = STATE_TAX.get(c["state"], (.011, .05, "annual"))
        counties[key] = dict(
            countyId="CTY-%03d" % (len(counties) + 1),
            countyName=c["_county"], state=c["state"],
            millRate=round(mill * rng.uniform(.92, 1.08), 5),
            assessmentDrift=round(drift * rng.uniform(.85, 1.15), 4),
            reassessmentCycle=cycle, appealWindowDays=rng.choice([30, 45, 60]))

for c in communities:
    c["_countyId"] = counties.get((c["_county"], c["state"]), {}).get("countyId", "")

# ------------------------------------------------------------------ properties

STREETS = ["Cypress", "Hawthorn", "Magnolia", "Sable", "Windrose", "Juniper",
           "Bellflower", "Ironwood", "Quail Run", "Silver Oak", "Dovetail",
           "Redbud", "Summit", "Larkspur", "Copper Creek", "Wren Hollow",
           "Tanglewood", "Blue Heron", "Willow Bend", "Marigold"]
SUFFIX = ["Ln", "Dr", "Way", "Ct", "Trl", "Path", "Cir", "Xing"]

# Size each community rather than splitting 3,000 evenly: a real portfolio has
# big and small communities, and flat sizing makes every market aggregate look
# identical.
sizes = {}
for c in communities:
    sizes[c["slug"]] = rng.triangular(18, 92, 34)
scale = TARGET_PROPERTIES / sum(sizes.values())
for k in sizes:
    sizes[k] = max(12, int(round(sizes[k] * scale)))

properties = []
pid = 0
for c in communities:
    for _ in range(sizes[c["slug"]]):
        pid += 1
        beds = rng.randint(c["_beds_min"], c["_beds_max"])
        baths = round(min(beds, 2 + (beds - 3) * .5 + rng.choice([0, 0, .5])), 1)
        sqft = int(rng.gauss(520 * beds + 300, 180))
        sqft = max(1100, min(3600, sqft))
        built = rng.randint(2016, 2024)
        acq = date(built, rng.randint(1, 12), rng.randint(1, 28))
        if acq > AS_OF - timedelta(days=200):
            acq = AS_OF - timedelta(days=rng.randint(220, 900))
        # Rent: the community figure is "starting at", so it is a FLOOR.
        # Scale up with beds and size, never below the anchor.
        f = 1.0 + (beds - c["_beds_min"]) * .085 + max(0, (sqft - 1600)) / 1600 * .10
        rent = int(round(c["_rent"] * f * rng.uniform(.99, 1.09) / 5) * 5)
        # "Starting at $X" is a FLOOR, so nothing may fall below it. The 0.99
        # tail of the jitter pushed 17 of 2,997 under the anchor on the first
        # run: smallest-bed, smallest-sqft homes where f was exactly 1.0.
        # Caught by validate.py, not by reading the CSV.
        rent = max(rent, c["_rent"])
        properties.append(dict(
            propertyId="PROP-%05d" % pid, communitySlug=c["slug"],
            streetAddress="%d %s %s" % (rng.randint(100, 9899),
                                        rng.choice(STREETS), rng.choice(SUFFIX)),
            city=c["city"], state=c["state"], zip=c["_zip"],
            countyId=c["_countyId"], beds=beds, baths=baths, sqft=sqft,
            yearBuilt=built, acquisitionDate=acq.isoformat(),
            acquisitionPrice=int(rent * rng.uniform(140, 190) / 100) * 100,
            marketRent=rent, status="occupied"))

# ------------------------------------------------------------------- residents

FIRST = ["Alex","Jordan","Taylor","Morgan","Casey","Riley","Avery","Quinn","Rowan",
         "Sasha","Devon","Elliot","Harper","Kendall","Logan","Micah","Noel","Payton",
         "Reese","Skyler","Emerson","Finley","Hayden","Jamie","Kai","Lane","Marley"]
LAST = ["Alvarez","Bennett","Chen","Dawson","Ellis","Foster","Griffin","Hayes",
        "Ibarra","Jensen","Keller","Lamb","Mercer","Novak","Osei","Park","Quintero",
        "Reyes","Sandoval","Tran","Underwood","Vargas","Whitfield","Yates","Zamora"]

# Payment profiles. The at-risk cohort DEGRADES rather than being uniformly
# bad: a flat sprinkle of late payments makes every resident look the same and
# leaves nothing for the dashboard to find.
PROFILES = [("reliable", .845), ("occasionally_late", .060),
            ("degrading", .080), ("severe", .015)]

residents = []
def new_resident(n):
    p = w_choice(dict(PROFILES))
    return dict(residentId="RES-%05d" % n,
                displayName="%s %s" % (rng.choice(FIRST), rng.choice(LAST)),
                creditTierAtApplication=rng.choice(["A","A","B","B","B","C","C","D"]),
                householdSize=rng.choice([1,2,2,3,3,4,5]),
                hasPets=rng.random() < .42,
                # GROUND TRUTH, NOT AN OBSERVATION. This is the label the
                # generator used to DECIDE who pays late — it is not derived
                # from anything this resident did. Named so nobody can mistake
                # it for a business field.
                #
                # Keep it for ONE purpose: checking whether the rules-based risk
                # score actually finds the degrading cohort. Never a model
                # feature, never a dashboard column, never a filter offered to a
                # user. A model that sees this scores perfectly by reading the
                # answer key, which is the circularity recorded in the AIP
                # section of ontology-spec.md.
                syntheticProfileGroundTruth=p)

# --------------------------------------------------------- leases and payments

leases, payments = [], []
lid = pmid = rid = 0

for p in properties:
    # Pick the FIRST lease start by season, from a window that begins up to two
    # years before our history does. Anchoring every property at START instead
    # put 31% of all lease starts in October and left May-August at 16%, the
    # exact inverse of reality: the nudge loop that was meant to fix it could
    # only step a date 10-40 days at a time and never escaped the pile-up.
    # A real portfolio is already mid-tenancy when the reporting window opens.
    earliest = max(date.fromisoformat(p["acquisitionDate"]) + timedelta(days=rng.randint(10, 90)),
                   START - timedelta(days=730))
    latest = START + timedelta(days=180)
    window = [m for m in month_iter(earliest, latest)] or [START]
    first = w_choice({m: LEASE_START_WEIGHT[m.month] for m in window})
    cursor = first + timedelta(days=rng.randint(0, 27))
    # month_iter yields month STARTS, which can fall before `earliest` and so
    # before the acquisition date. validate.py caught this on the first run.
    cursor = max(cursor, earliest)
    # 12- and 24-month terms preserve the start month, so seasonality set here
    # propagates through every renewal on its own.
    prev_lease = None
    while cursor < AS_OF:

        renewal = prev_lease is not None and rng.random() < .52
        if renewal:
            res = prev_lease["residentId"]
            profile = prev_lease["_profile"]
        else:
            rid += 1
            r = new_resident(rid); residents.append(r)
            res, profile = r["residentId"], r["syntheticProfileGroundTruth"]

        lid += 1
        # 12 and 24 preserve the start month; 18 shifts it by six, which on
        # each renewal walks a summer lease into winter and flattened the
        # May-Aug peak to 37%. Their published range is "12 to 24 months" and
        # whole-year terms dominate in practice, so 18 is rare rather than 1-in-6.
        term = rng.choice([12, 12, 12, 12, 24, 24, 24, 18])
        rent = int(p["marketRent"] * rng.uniform(.94, 1.02) / 5) * 5
        if renewal:
            rent = int(prev_lease["monthlyRent"] * rng.uniform(1.01, 1.07) / 5) * 5
        end = add_months(cursor, term)

        L = dict(leaseId="LSE-%06d" % lid, propertyId=p["propertyId"],
                 residentId=res, startDate=cursor.isoformat(),
                 endDate=end.isoformat(), termMonths=term, monthlyRent=rent,
                 deposit=int(rent * rng.choice([.5, 1.0, 1.0])),
                 concessionMonths=1 if rng.random() < .12 else 0,
                 renewalOfLeaseId=prev_lease["leaseId"] if renewal else "",
                 status="active", _profile=profile)

        # ---- payments for this lease
        sev = 0.0
        n_months = 0
        # Leases may begin before our reporting window (that is the point of
        # the staggered start), but payments are only emitted from START.
        for i, mstart in enumerate(month_iter(max(cursor, START), min(end, AS_OF))):
            due = date(mstart.year, mstart.month, 1)
            if due < cursor:
                continue
            n_months += 1
            pmid += 1
            ontime = ONTIME_BASE[due.month]
            if profile == "reliable":
                pr = ontime
            elif profile == "occasionally_late":
                pr = ontime - .18
            elif profile == "degrading":
                sev = min(.75, sev + rng.uniform(.02, .07))   # gets worse over time
                pr = ontime - sev
            else:
                pr = ontime - .55
            u = rng.random()
            if u < pr:
                status, late = "paid", 0
                paid = due + timedelta(days=rng.randint(0, 2))
                amt = L["monthlyRent"]
            elif u < pr + .55 * (1 - pr):
                status = "late"; late = rng.randint(3, 29)
                paid = due + timedelta(days=late); amt = L["monthlyRent"]
            elif u < pr + .80 * (1 - pr):
                status = "partial"; late = rng.randint(10, 45)
                paid = due + timedelta(days=late)
                amt = int(L["monthlyRent"] * rng.uniform(.3, .8))
            else:
                status, late, paid, amt = "missed", None, None, 0
            if L["concessionMonths"] and i == 0:
                status, late, amt = "waived", 0, 0
                paid = due
            payments.append(dict(
                paymentId="PAY-%07d" % pmid, leaseId=L["leaseId"],
                propertyId=p["propertyId"], residentId=res,
                dueDate=due.isoformat(), amountDue=L["monthlyRent"],
                amountPaid=amt, paidDate=paid.isoformat() if paid else "",
                daysLate=late if late is not None else "", status=status))

        # ---- how this lease ended
        if end > AS_OF:
            L["status"] = "active"
        elif profile == "severe" and rng.random() < .45:
            L["status"] = "evicted"
        elif profile == "degrading" and rng.random() < .18:
            L["status"] = "terminated-early"
        else:
            L["status"] = "expired"
        leases.append(L)
        prev_lease = L if L["status"] in ("expired",) else None
        # Turn gap: sample a few realistic vacancy lengths (5-75 days) and
        # prefer the one landing in a better leasing month. Picking blind let
        # 18-month terms and random gaps wash the summer peak out to 37%;
        # snapping straight to the next peak month would instead invent
        # months-long vacancies. This keeps the gap honest and the season visible.
        gaps = [rng.randint(5, 75) for _ in range(4)]
        cursor = end + timedelta(days=w_choice(
            {g: LEASE_START_WEIGHT[(end + timedelta(days=g)).month] for g in gaps}))

for p in properties:
    act = [l for l in leases if l["propertyId"] == p["propertyId"] and l["status"] == "active"]
    p["status"] = "occupied" if act else rng.choice(["vacant", "turn", "vacant"])
    p["currentLeaseId"] = act[0]["leaseId"] if act else ""

# --------------------------------------------------------- vendors, work orders

VENDOR_NAMES = ["Apex","Blue Ridge","Cardinal","Delta","Evergreen","Frontier",
                "Gulfstream","Heritage","Ironclad","Juniper","Keystone","Lone Star",
                "Meridian","Northstar","Optima","Pinnacle","Quantum","Rampart"]
vendors = []
markets = sorted(set(c["market"] for c in communities))
vn = 0
for m in markets:
    for cat in sorted(set(f for _, _, _, f in MAINT.values())):
        if rng.random() < .85:
            vn += 1
            vendors.append(dict(
                vendorId="VEN-%04d" % vn,
                vendorName="%s %s" % (rng.choice(VENDOR_NAMES), cat),
                category=cat, market=m,
                avgTurnaroundDays=round(rng.uniform(1.2, 9.5), 1),
                onTimePct=round(rng.uniform(.62, .98), 3)))
by_mkt_cat = defaultdict(list)
for v in vendors:
    by_mkt_cat[(v["market"], v["category"])].append(v)

slug_market = {c["slug"]: c["market"] for c in communities}
wos = []; wid = 0
for p in properties:
    per_year = rng.uniform(1.8, 4.4)
    n = int(per_year * 3 * rng.uniform(.7, 1.3))
    for _ in range(n):
        opened = START + timedelta(days=rng.randint(0, (AS_OF - START).days))
        cat = w_choice(maint_weights(opened.month, p["state"]))
        resp, lo, hi, family = MAINT[cat]
        emerg = rng.random() < (.14 if cat.startswith(("HVAC", "Plumbing")) and resp == "landlord" else .03)
        pool = by_mkt_cat.get((slug_market[p["communitySlug"]], family)) or \
               by_mkt_cat.get((slug_market[p["communitySlug"]], "General")) or vendors
        v = rng.choice(pool)
        days = max(0, rng.gauss(v["avgTurnaroundDays"], 2.0))
        if emerg:
            days = min(days, rng.uniform(0, 1.5))
        closed = opened + timedelta(days=int(days))
        # The chain worth surfacing to a CFO: a resident who skips their own
        # air-filter duty causes an HVAC failure the LANDLORD then pays for.
        # Resident responsibility becoming landlord cost is exactly the kind of
        # link an ontology shows and a spreadsheet cannot.
        neglect = resp == "landlord" and cat.startswith("HVAC") and rng.random() < .12
        wid += 1
        wos.append(dict(
            workOrderId="WO-%06d" % wid, propertyId=p["propertyId"],
            category=cat, responsibility=resp,
            chargedToResident=(resp == "resident"),
            contributingNeglect=neglect,
            priority="emergency" if emerg else rng.choice(["routine", "routine", "urgent"]),
            isEmergency=emerg, openedDate=opened.isoformat(),
            closedDate=closed.isoformat() if closed <= AS_OF else "",
            cost=int(rng.triangular(lo, hi, lo + (hi - lo) * .28)),
            vendorId=v["vendorId"], residentReported=rng.random() < .68))

# ------------------------------------------------------------------- expenses

# Expenses follow real billing cadence and the published responsibility split,
# not a uniform "N per year" loop. The first draft emitted 303,405 rows where
# HOA + Insurance + Utilities were 89.4% of the ROWS but only 30% of the
# DOLLARS — heaviest exactly where each row carried least meaning.
#
#   HOA        quarterly. Community dues are commonly billed per quarter.
#   Insurance  annual. A policy premium is one transaction, not twelve.
#   Utilities  monthly, but ONLY WHILE VACANT. Residents pay their own utilities
#              (invitationhomes.com/resident-responsibilities; the Lease Easy
#              bundle sells "utility management" as a convenience, not as the
#              landlord absorbing the bill). Charging the landlord for utilities
#              on an occupied home would have invented a cost that does not exist.
#   CapEx / Turn / Legal / Marketing stay episodic and per-transaction: they are
#              4% of rows and 57% of the money, and they are what a CFO drills into.
EPISODIC = {"Marketing": (80, 900, 2), "Legal": (200, 2400, 1),
            "CapEx": (900, 14000, 1), "Turn": (600, 5200, 1)}

# Vacancy windows per property, derived from the lease chain AFTER leases exist.
# Reconciling this during generation rather than after is how Target Air ended
# up with shorted parts showing healthy stock.
vacancy = defaultdict(list)
by_prop = defaultdict(list)
for l in leases:
    by_prop[l["propertyId"]].append(l)
for pid_, ls in by_prop.items():
    ls.sort(key=lambda x: x["startDate"])
    for a, b in zip(ls, ls[1:]):
        gap_start = date.fromisoformat(a["endDate"])
        gap_end = date.fromisoformat(b["startDate"])
        if gap_end > gap_start:
            vacancy[pid_].append((max(gap_start, START), min(gap_end, AS_OF)))

expenses = []; eid = 0
def add_expense(prop, community, cat, d, amt, scope="property"):
    global eid
    eid += 1
    expenses.append(dict(
        expenseId="EXP-%06d" % eid, propertyId=prop, communitySlug=community,
        scope=scope, category=cat, date=d.isoformat(), amount=int(amt),
        glCode="GL-%s" % cat.upper().replace(" ", "")[:6]))

slug_of = {p["propertyId"]: p["communitySlug"] for p in properties}
for p in properties:
    cs = p["communitySlug"]
    acq = date.fromisoformat(p["acquisitionDate"])
    hoa_q = rng.uniform(110, 420)
    ins_y = rng.uniform(900, 2400)
    for m in month_iter(START, AS_OF):
        if m < acq:
            continue
        if m.month in (1, 4, 7, 10):
            add_expense(p["propertyId"], cs, "HOA", m, hoa_q * rng.uniform(.97, 1.03))
        if m.month == 1:
            add_expense(p["propertyId"], cs, "Insurance", m, ins_y * rng.uniform(.94, 1.09))
    for vs, ve in vacancy.get(p["propertyId"], []):
        for m in month_iter(vs, ve):
            # month_iter yields month STARTS, and the first one falls on or
            # before the vacancy's own start — i.e. inside the previous lease.
            # That put 5,052 utilities rows on occupied months, billing the
            # landlord for a cost the resident was already paying. Only months
            # whose 1st lands strictly inside the gap count as vacant.
            if m <= vs or m >= ve:
                continue
            add_expense(p["propertyId"], cs, "Utilities", m, rng.uniform(95, 310))
    for cat, (lo, hi, per_year) in EPISODIC.items():
        n = int(per_year * 3 * rng.uniform(.5, 1.2))
        for _ in range(n):
            d = START + timedelta(days=rng.randint(0, (AS_OF - START).days))
            if d < acq:
                continue
            add_expense(p["propertyId"], cs, cat, d,
                        rng.triangular(lo, hi, lo + (hi - lo) * .3))

# COMMON-AREA LANDSCAPING is a genuine community cost funded through HOA, and it
# is NOT a per-property line. Scoped to the community, with no propertyId, which
# is why Expense carries `scope`.
for c in communities:
    per_q = 900 + sizes[c["slug"]] * rng.uniform(14, 38)
    for m in month_iter(START, AS_OF):
        if m.month in (1, 4, 7, 10):
            add_expense("", c["slug"], "Common area landscaping", m,
                        per_q * rng.uniform(.9, 1.1), scope="community")

# ------------------------------------------------------------ tax assess/bills

assessments, bills = [], []
aid = bid = 0
for p in properties:
    cty = counties.get(next(((c["_county"], c["state"]) for c in communities
                             if c["slug"] == p["communitySlug"]), None))
    if not cty:
        continue
    base = p["acquisitionPrice"] * rng.uniform(.82, .96)
    prior = None
    for yr in (2024, 2025, 2026):
        drift = cty["assessmentDrift"]
        if cty["reassessmentCycle"] == "capped-prop13":
            drift = .02                                   # Prop 13 caps growth
        elif cty["reassessmentCycle"] in ("octennial", "quadrennial") and yr != 2024:
            drift = .004                                  # holds flat between cycles
        val = int(base if prior is None else prior * (1 + drift * rng.uniform(.6, 1.5)))
        chg = 0.0 if prior is None else round((val - prior) / prior, 4)
        appeal = "none"
        if chg > .09 and rng.random() < .35:
            appeal = w_choice({"filed": .35, "won": .40, "lost": .25})
        aid += 1
        A = dict(assessmentId="ASM-%06d" % aid, propertyId=p["propertyId"],
                 countyId=cty["countyId"], taxYear=yr, assessedValue=val,
                 priorAssessedValue=prior or "", changePct=chg,
                 appealStatus=appeal,
                 appealSavings=int(val * rng.uniform(.03, .11)) if appeal == "won" else 0)
        assessments.append(A)
        billed = val - (A["appealSavings"] or 0)
        bid += 1
        due = date(yr, 11, 1)
        paid = "" if due > AS_OF else (due - timedelta(days=rng.randint(0, 40))).isoformat()
        bills.append(dict(billId="TAX-%06d" % bid, assessmentId=A["assessmentId"],
                          propertyId=p["propertyId"], countyId=cty["countyId"],
                          taxYear=yr, amountDue=int(billed * cty["millRate"]),
                          dueDate=due.isoformat(), paidDate=paid,
                          status="paid" if paid else "outstanding"))
        prior = val

# ------------------------------------------------------------ market rate comps

# Keyed on CITY, not market: the tampa market spans $1,759-$2,919 because it
# covers Fort Myers and Port Charlotte as well as Tampa proper.
city_rent = defaultdict(list)
for p in properties:
    city_rent[(p["city"], p["state"], p["beds"])].append(p["marketRent"])

comps = []; cid = 0
months = list(month_iter(START, AS_OF))
for (city, st, beds), rents in sorted(city_rent.items()):
    base = sorted(rents)[len(rents) // 2]
    for i, m in enumerate(months):
        # mild upward drift over 3 years, plus a spring/summer bump, so
        # "trending rental rates" actually has a trend to show
        trend = 1 + (i / len(months)) * rng.uniform(.06, .13)
        season = 1 + .035 * math.sin((m.month - 3) / 12 * 2 * math.pi)
        cid += 1
        comps.append(dict(
            compId="CMP-%06d" % cid, city=city, state=st, beds=beds,
            month=m.isoformat()[:7],
            medianRent=int(base * trend * season * rng.uniform(.985, 1.015) / 5) * 5,
            sampleSize=max(4, int(len(rents) * rng.uniform(1.5, 4.0))),
            source="synthetic"))

# ------------------------------------------------------------------- write out

def write(name, rows, cols=None):
    if not rows:
        print("  (skip %s: empty)" % name); return
    cols = cols or [k for k in rows[0] if not k.startswith("_")]
    path = os.path.join(OUT, name)
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)
    print("  %-28s %7d rows" % (name, len(rows)))

os.makedirs(OUT, exist_ok=True)
print("writing to data/generated/ (seed %d)" % SEED)

write("communities.csv", [dict(
    slug=c["slug"], communityName=c["community_name"], market=c["market"],
    city=c["city"], state=c["state"], county=c["_county"], countyId=c["_countyId"],
    zip=c["_zip"], startingRent=c["_rent"], rentAnchor=c["_anchor"],
    bedsMin=c["_beds_min"], bedsMax=c["_beds_max"],
    featureCount=c["feature_count"], features=c["features"],
    propertyCount=sizes[c["slug"]]) for c in communities])
write("counties.csv", list(counties.values()))
write("properties.csv", properties)
write("residents.csv", residents)
write("leases.csv", leases)
write("rent_payments.csv", payments)
write("vendors.csv", vendors)
write("maintenance_work_orders.csv", wos)
write("expenses.csv", expenses)
write("tax_assessments.csv", assessments)
write("tax_bills.csv", bills)
write("market_rate_comps.csv", comps)

print("\nprofiles:", dict(Counter(r["syntheticProfileGroundTruth"] for r in residents)))
print("lease outcomes:", dict(Counter(l["status"] for l in leases)))
print("payment status:", dict(Counter(p["status"] for p in payments)))
