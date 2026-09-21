#!/usr/bin/env python3
"""
Integrity checks over data/generated/.

    cd invitationhomes-foundry && python3 scripts/validate.py

Run this after EVERY generator change. The Target Air lesson is that generated
data fails silently: it is structurally valid and semantically wrong, nothing
throws, and the mistake only surfaces when a page renders it in front of you.
Wiring harnesses consumed autonomy compute modules for a week because two
unrelated lists happened to share a length.

Exit code is non-zero if any check fails, so this can gate an upload.
"""

import csv, io, os, sys
from collections import Counter

G = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "data", "generated")

def load(n):
    return list(csv.DictReader(io.open(os.path.join(G, n), encoding="utf-8")))

comm = {r["slug"]: r for r in load("communities.csv")}
cty = {r["countyId"]: r for r in load("counties.csv")}
props = {r["propertyId"]: r for r in load("properties.csv")}
res = {r["residentId"]: r for r in load("residents.csv")}
lea = {r["leaseId"]: r for r in load("leases.csv")}
pay = load("rent_payments.csv")
wo = load("maintenance_work_orders.csv")
ven = {r["vendorId"]: r for r in load("vendors.csv")}
asm = {r["assessmentId"]: r for r in load("tax_assessments.csv")}
bil = load("tax_bills.csv")
comps = load("market_rate_comps.csv")

failures = []

def check(name, bad, total, sample=None):
    ok = not bad
    if not ok:
        failures.append(name)
    print("%-54s %-4s (%d/%d)%s" % (
        name, "ok" if ok else "FAIL", bad, total,
        "  e.g. " + str(sample[:2]) if (not ok and sample) else ""))

print("== referential integrity ==")
check("property.communitySlug resolves",
      sum(1 for p in props.values() if p["communitySlug"] not in comm), len(props))
check("property.countyId resolves",
      sum(1 for p in props.values() if p["countyId"] and p["countyId"] not in cty), len(props))
check("lease.propertyId resolves",
      sum(1 for l in lea.values() if l["propertyId"] not in props), len(lea))
check("lease.residentId resolves",
      sum(1 for l in lea.values() if l["residentId"] not in res), len(lea))
check("lease.renewalOfLeaseId resolves",
      sum(1 for l in lea.values() if l["renewalOfLeaseId"] and l["renewalOfLeaseId"] not in lea), len(lea))
check("payment.leaseId resolves",
      sum(1 for p in pay if p["leaseId"] not in lea), len(pay))
check("workOrder.vendorId resolves",
      sum(1 for w in wo if w["vendorId"] not in ven), len(wo))
check("taxBill.assessmentId resolves",
      sum(1 for b in bil if b["assessmentId"] not in asm), len(bil))

print("\n== temporal consistency ==")
bad = [l["leaseId"] for l in lea.values()
       if l["startDate"] < props[l["propertyId"]]["acquisitionDate"]]
check("lease never starts before property acquisition", len(bad), len(lea), bad)
bad = [p["paymentId"] for p in pay
       if p["dueDate"] < lea[p["leaseId"]]["startDate"][:8] + "01"]
check("payment never due before its lease month", len(bad), len(pay), bad)
bad = [p["paymentId"] for p in pay if p["paidDate"] and p["paidDate"] < p["dueDate"]]
check("payment never paid before it is due", len(bad), len(pay), bad)
bad = [w["workOrderId"] for w in wo if w["closedDate"] and w["closedDate"] < w["openedDate"]]
check("work order closed on or after opened", len(bad), len(wo), bad)
bad = [b["billId"] for b in bil if not b["dueDate"].startswith(b["taxYear"])]
check("tax bill due date falls inside its tax year", len(bad), len(bil), bad)

print("\n== business rules ==")
bad = [p["propertyId"] for p in props.values()
       if p["status"] == "occupied" and not p["currentLeaseId"]]
check("occupied property has a current lease", len(bad), len(props), bad)
bad = [p["propertyId"] for p in props.values()
       if p["currentLeaseId"] and lea[p["currentLeaseId"]]["status"] != "active"]
check("currentLeaseId points at an active lease", len(bad), len(props), bad)
# "Starting at $X" is a floor. Nothing may sit below its community's anchor.
bad = [p["propertyId"] for p in props.values()
       if int(p["marketRent"]) < int(comm[p["communitySlug"]]["startingRent"])]
check("rent >= community 'starting at' floor", len(bad), len(props), bad)
dup = Counter(l["propertyId"] for l in lea.values() if l["status"] == "active")
check("no property holds two active leases",
      sum(1 for v in dup.values() if v > 1), len(props))
# City must always be qualified by state: "The Reserve" is in Dallas, GEORGIA,
# while a separate Dallas market exists in Texas.
bad = [p["propertyId"] for p in props.values()
       if (p["city"], p["state"]) != (comm[p["communitySlug"]]["city"],
                                      comm[p["communitySlug"]]["state"])]
check("property city/state matches its community", len(bad), len(props), bad)
keys = set((c["city"], c["state"], c["beds"]) for c in comps)
bad = [p["propertyId"] for p in props.values()
       if (p["city"], p["state"], p["beds"]) not in keys]
check("every property has a comp for its city+beds", len(bad), len(props), bad)

exp = load("expenses.csv")
bad = [e["expenseId"] for e in exp if e["scope"] == "property" and not e["propertyId"]]
check("property-scope expense has a propertyId", len(bad), len(exp), bad)
bad = [e["expenseId"] for e in exp if e["scope"] == "community" and e["propertyId"]]
check("community-scope expense has NO propertyId", len(bad), len(exp), bad)
bad = [e["expenseId"] for e in exp if e["communitySlug"] not in comm]
check("expense.communitySlug resolves", len(bad), len(exp), bad)
bad = [e["expenseId"] for e in exp
       if e["propertyId"] and e["date"] < props[e["propertyId"]]["acquisitionDate"]]
check("no expense before property acquisition", len(bad), len(exp), bad)
# Residents pay their own utilities (their published responsibilities page), so
# the landlord only carries them while a home is VACANT. A utilities row during
# an occupied month is an invented cost. Check it properly rather than by
# eyeballing a ratio: every utilities row must fall outside every lease term for
# its own property.
from collections import defaultdict as _dd
terms = _dd(list)
for l in lea.values():
    terms[l["propertyId"]].append((l["startDate"], l["endDate"]))
bad = []
for e in exp:
    if e["category"] != "Utilities" or not e["propertyId"]:
        continue
    d = e["date"]
    if any(a <= d <= b for a, b in terms.get(e["propertyId"], [])):
        bad.append(e["expenseId"])
check("utilities billed only while the home is vacant", len(bad), len(exp), bad)

print("\n== shape (not pass/fail, but look at it) ==")
occ = sum(1 for p in props.values() if p["status"] == "occupied")
print("  occupancy                %.1f%%" % (100 * occ / len(props)))
print("  payment status           %s" % dict(Counter(p["status"] for p in pay)))
print("  lease outcomes           %s" % dict(Counter(l["status"] for l in lea.values())))
print("  resident profiles        %s" % dict(Counter(r["syntheticProfileGroundTruth"] for r in res.values())))
print("  rent anchors             %s" % dict(Counter(c["rentAnchor"] for c in comm.values())))
degr = sum(1 for r in res.values() if r["syntheticProfileGroundTruth"] in ("degrading", "severe"))
print("  at-risk cohort           %.1f%% of residents" % (100 * degr / len(res)))

print("\n%s" % ("FAILURES: " + ", ".join(failures) if failures else "all checks passed"))
sys.exit(1 if failures else 0)
