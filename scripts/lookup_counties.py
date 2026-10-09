"""
County for every city in the listing scrape, via the FCC census-area API.

Tax is levied by county, so every scattered home needs one. The listing pages
carry coordinates but no county; this resolves each (city, state) once, from
the coordinates of its first listing, and caches the answer in
data/reference/listing-city-county.csv so generate.py stays offline and
deterministic. Resumable: cities already in the cache are skipped.

A city that straddles a county line gets the county of its first listing.
That is an approximation, and fine for synthetic tax bills.

    python3 scripts/lookup_counties.py
"""

import csv
import json
import os
import time
import urllib.request

REF = os.path.join(os.path.dirname(__file__), "..", "data", "reference")
LISTINGS = os.path.join(REF, "invitation-homes-listings.csv")
OUT = os.path.join(REF, "listing-city-county.csv")
API = "https://geo.fcc.gov/api/census/area?lat={lat}&lon={lon}&format=json"
FIELDS = ["city", "state", "county", "countyFips", "latitude", "longitude"]
SUFFIXES = (" County", " Parish", " Municipality")


def main() -> None:
    first = {}
    with open(LISTINGS, newline="") as f:
        for r in csv.DictReader(f):
            if r["latitude"] and r["longitude"]:
                first.setdefault((r["city"], r["state"]), r)

    done = set()
    if os.path.exists(OUT):
        with open(OUT, newline="") as f:
            done = {(r["city"], r["state"]) for r in csv.DictReader(f)}

    todo = sorted(k for k in first if k not in done)
    print(f"{len(first)} cities, {len(done)} cached, {len(todo)} to look up", flush=True)

    new_file = not os.path.exists(OUT)
    with open(OUT, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        if new_file:
            w.writeheader()
        for i, key in enumerate(todo, 1):
            r = first[key]
            url = API.format(lat=r["latitude"], lon=r["longitude"])
            try:
                with urllib.request.urlopen(url, timeout=30) as resp:
                    hits = json.load(resp).get("results", [])
            except Exception as e:
                print(f"  fail {key}: {e}", flush=True)
                continue
            if not hits:
                print(f"  no county for {key}", flush=True)
                continue
            name = hits[0]["county_name"]
            for s in SUFFIXES:
                if name.endswith(s):
                    name = name[: -len(s)]
            w.writerow({"city": key[0], "state": key[1], "county": name,
                        "countyFips": hits[0]["county_fips"],
                        "latitude": r["latitude"], "longitude": r["longitude"]})
            f.flush()
            if i % 100 == 0:
                print(f"{i}/{len(todo)}", flush=True)
            time.sleep(0.3)
    print("done", flush=True)


if __name__ == "__main__":
    main()
