#!/usr/bin/env python3
"""
Independent recount of the Dispositions page, straight from data/generated/.

The page sums NOI in Foundry and prices it in the browser. This recomputes
the same figures from the CSVs by a separate path, so the page can be checked
number for number after an upload. Same rules as useDisposition.ts:

    NOI = collected rent - opex (ex CapEx, plus common-area share)
          - landlord maintenance - latest tax bill - 6% management
    price = NOI / buyer cap rate

    python3 scripts/check_disposition.py [since] [cap]
    python3 scripts/check_disposition.py 2025-10-01 0.055
"""

import csv, io, os, sys
from collections import defaultdict

G = os.environ.get("IH_GEN_OUT") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "generated")
SINCE = sys.argv[1] if len(sys.argv) > 1 else "2025-10-01"
CAP = float(sys.argv[2]) if len(sys.argv) > 2 else 0.055
MGMT = 0.06


def rows(name):
    return csv.DictReader(io.open(os.path.join(G, name), encoding="utf-8"))


props = {p["propertyId"]: p for p in rows("properties.csv")}
active = {l["leaseId"]: int(l["monthlyRent"]) for l in rows("leases.csv") if l["status"] == "active"}
comps = list(rows("market_rate_comps.csv"))
latest = max(c["month"] for c in comps)
median = {(c["city"], c["state"], c["beds"]): int(c["medianRent"]) for c in comps if c["month"] == latest}

m = defaultdict(lambda: defaultdict(float))
for p in props.values():
    b = m[p["market"]]
    b["homes"] += 1
    b["cost"] += int(p["acquisitionPrice"])
    rent = active.get(p["currentLeaseId"])
    if rent is not None:
        b["occupied"] += 1
        med = median.get((p["city"], p["state"], p["beds"]))
        if med is not None and med > rent:
            b["under"] += (med - rent) * 12

for r in rows("rent_payments.csv"):
    if r["dueDate"] >= SINCE:
        m[props[r["propertyId"]]["market"]]["collected"] += int(r["amountPaid"])

homes_in = defaultdict(int)
for p in props.values():
    if p["communitySlug"]:
        homes_in[p["communitySlug"]] += 1
common = defaultdict(float)
for e in rows("expenses.csv"):
    if e["date"] < SINCE:
        continue
    if e["scope"] == "community":
        common[e["communitySlug"]] += int(e["amount"])
    elif e["category"] != "CapEx":
        m[props[e["propertyId"]]["market"]]["opex"] += int(e["amount"])
for p in props.values():
    if p["communitySlug"]:
        m[p["market"]]["opex"] += common[p["communitySlug"]] / homes_in[p["communitySlug"]]

for w in rows("maintenance_work_orders.csv"):
    if w["responsibility"] == "landlord" and w["openedDate"] >= SINCE:
        m[props[w["propertyId"]]["market"]]["maint"] += int(w["cost"])

bills = list(rows("tax_bills.csv"))
year = max(b["taxYear"] for b in bills)
for b in bills:
    if b["taxYear"] == year:
        m[props[b["propertyId"]]["market"]]["tax"] += int(b["amountDue"])

print(f"since {SINCE}, cap {CAP:.2%}, comps {latest}, tax year {year}\n")
print(f"{'market':22}{'homes':>7}{'NOI/home':>10}{'on cost':>9}{'price':>14}{'rent disc':>12}")
tot = defaultdict(float)
for name, b in sorted(m.items(), key=lambda kv: (kv[1]["collected"] - kv[1]["opex"] - kv[1]["maint"]
                                                  - kv[1]["tax"] - kv[1]["collected"] * MGMT) / kv[1]["cost"]):
    noi = b["collected"] - b["opex"] - b["maint"] - b["tax"] - b["collected"] * MGMT
    price = noi / CAP
    disc = b["under"] * (1 - MGMT) / CAP
    for k, v in (("homes", b["homes"]), ("noi", noi), ("cost", b["cost"]), ("price", price), ("disc", disc)):
        tot[k] += v
    print(f"{name:22}{int(b['homes']):>7}{noi / b['homes']:>10,.0f}{noi / b['cost']:>9.1%}"
          f"{price:>14,.0f}{disc:>12,.0f}")
print(f"\n{'portfolio':22}{int(tot['homes']):>7}{tot['noi'] / tot['homes']:>10,.0f}"
      f"{tot['noi'] / tot['cost']:>9.1%}{tot['price']:>14,.0f}{tot['disc']:>12,.0f}")
print(f"cost basis {tot['cost']:,.0f}")
