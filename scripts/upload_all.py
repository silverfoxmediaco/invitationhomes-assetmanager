#!/usr/bin/env python3
"""
Replace all thirteen Foundry datasets with data/generated/, together.

CLAUDE.md gotcha 9: a PARTIAL re-upload is the worst failure in this project,
because nothing errors. So this script checks all of them before touching any,
and uploads them all in one run.

Per dataset (see memory: reference_foundry_csv_upload):
  1. Read the dataset's CURRENT schema. Column names are kept exactly as they
     are, including the lower-case `propertyid`-style names some datasets were
     created with, because the object types' property mappings point at them.
  2. Build the new schema in the CSV's column order (the parser maps columns by
     position), reusing each existing column's name and type, matched
     case-insensitively. A column that is new in the CSV becomes STRING and is
     reported, so it can be mapped in Ontology Manager.
  3. POST /api/v1/datasets/{rid}/files:upload?transactionType=SNAPSHOT: one
     call that opens, writes and commits, replacing the contents. Never the
     v2 three-step flow, which commits an empty snapshot if the PUT fails.
  4. PUT the schema back. A raw API upload carries none, and an object type on
     a schema-less dataset quietly keeps serving its old index.
  5. readTable the result and count rows against the CSV.

    python3 scripts/upload_all.py            # dry run: compare headers and schemas
    python3 scripts/upload_all.py --upload   # do it
"""

import csv
import io
import json
import os
import sys
import urllib.request

HOST = "https://silverformedia.usw-23.palantirfoundry.com"
TOKEN = os.environ["FOUNDRY_TOKEN"]
GEN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "generated")

DATASETS = {
    "properties": "ri.foundry.main.dataset.1e7f5233-e99f-44f9-8605-e7f6f91c7959",
    "leases": "ri.foundry.main.dataset.826ac31d-8217-45c3-9c26-83a5d2de3a31",
    "rent_payments": "ri.foundry.main.dataset.a54ddcc0-4286-4595-8313-5f619c146810",
    "residents": "ri.foundry.main.dataset.4c64d7c5-8b12-466c-8876-622bd725ed20",
    "communities": "ri.foundry.main.dataset.13fdf958-68b7-4801-96f7-6ef59778ee4e",
    "counties": "ri.foundry.main.dataset.eb2b052d-a273-4fb8-9417-77f54f41adec",
    "vendors": "ri.foundry.main.dataset.75c91a03-b02e-4704-b603-362f6af9464b",
    "maintenance_work_orders": "ri.foundry.main.dataset.16060f12-a331-4be2-b29a-3fe45ea5eeea",
    "expenses": "ri.foundry.main.dataset.52289381-d20a-43b6-80ad-94613b57973f",
    "tax_assessments": "ri.foundry.main.dataset.34b887d9-9710-49d3-9ffa-f4bafa6de107",
    "tax_bills": "ri.foundry.main.dataset.ff7ee3c7-5bb7-4b73-8eb9-c055ca110610",
    "market_rate_comps": "ri.foundry.main.dataset.6e3c4f35-6633-4137-830c-37bc4a5f56f4",
    # Backs Market Strategy, the one object type users write to. Created
    # 2026-10-09; re-uploading it does not undo strategy edits, which live in
    # the ontology keyed on marketId.
    "markets": "ri.foundry.main.dataset.17cad456-959e-4fd6-9ad5-79ff219065ce",
}


def call(method, path, body=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(HOST + path, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=600) as r:
        text = r.read().decode()
        return json.loads(text) if text.strip().startswith(("{", "[")) else text


def plan(name, rid):
    path = os.path.join(GEN, f"{name}.csv")
    with open(path, newline="", encoding="utf-8") as f:
        header = next(csv.reader(f))
    with open(path, "rb") as f:
        head = f.read(4096)
    if b"\r\n" not in head:
        raise SystemExit(f"{name}.csv is not CRLF; the schema's recordDelimiter says it is.")
    old = call("GET", f"/api/v1/datasets/{rid}/schema?branchId=master&preview=true")
    by_lower = {fld["name"].lower(): fld for fld in old["fieldSchemaList"]}
    fields, added = [], []
    for col in header:
        fld = by_lower.get(col.lower())
        if fld:
            fields.append(fld)
        else:
            fields.append({"name": col, "type": "STRING", "nullable": True,
                           "customMetadata": {}})
            added.append(col)
    dropped = [f["name"] for f in old["fieldSchemaList"] if f["name"].lower() not in
               {c.lower() for c in header}]
    schema = dict(old)
    schema["fieldSchemaList"] = fields
    rows = sum(1 for _ in open(path, encoding="utf-8")) - 1
    return path, schema, added, dropped, rows


def main():
    do_upload = "--upload" in sys.argv
    plans = {}
    problems = []
    for name, rid in DATASETS.items():
        path, schema, added, dropped, rows = plan(name, rid)
        plans[name] = (rid, path, schema, rows)
        print(f"{name:26} {rows:>9,} rows  {os.path.getsize(path) / 1e6:6.1f} MB"
              + (f"  NEW: {', '.join(added)}" if added else "")
              + (f"  DROPPED: {', '.join(dropped)}" if dropped else ""))
        if dropped:
            problems.append(f"{name} would lose columns {dropped}")
    if problems:
        raise SystemExit("Refusing: " + "; ".join(problems))
    if not do_upload:
        print("\ndry run only; nothing sent. Re-run with --upload.")
        return

    print(f"\nuploading all {len(plans)}")
    for name, (rid, path, schema, rows) in plans.items():
        with open(path, "rb") as f:
            payload = f.read()
        call("POST", f"/api/v1/datasets/{rid}/files:upload?filePath={name}.csv&transactionType=SNAPSHOT",
             raw=payload, ctype="application/octet-stream")
        call("PUT", f"/api/v1/datasets/{rid}/schema?branchId=master&preview=true", body=schema)
        print(f"  {name:26} uploaded, schema re-applied")

    print("\nreading back")
    bad = []
    for name, (rid, path, schema, rows) in plans.items():
        text = call("GET", f"/api/v2/datasets/{rid}/readTable?format=CSV&branchName=master&preview=true",
                    ctype="text/csv")
        got = sum(1 for _ in csv.reader(io.StringIO(text))) - 1 if isinstance(text, str) else -1
        ok = got == rows
        print(f"  {name:26} {got:>9,} / {rows:,}  {'ok' if ok else 'MISMATCH'}")
        if not ok:
            bad.append(name)
    if bad:
        raise SystemExit(f"Row counts differ for {bad}. Check readTable output before trusting the ontology.")
    print(f"\nall {len(plans)} uploaded and read back")


if __name__ == "__main__":
    main()
