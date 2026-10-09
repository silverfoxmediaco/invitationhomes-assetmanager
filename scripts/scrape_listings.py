"""
Snapshot of every home Invitation Homes lists for rent, from invitationhomes.com.

Used ONLY as a sampling distribution for the generator: which markets, cities
and ZIPs they operate in, and what homes there look like (beds, baths, sqft,
asking rent). Street addresses are recorded for de-duplication but must never
reach the generated data or the app: a real address next to a synthetic
arrears flag reads as a claim about a real household. See CLAUDE.md.

Polite by design: robots.txt allows /houses-for-rent/ pages; this never touches
/api or *.json, sends one request at a time with a delay, and resumes from the
output file if interrupted.

    python3 scripts/scrape_listings.py            # full run, ~75 min
    python3 scripts/scrape_listings.py --limit 5  # smoke test
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.request

SITEMAP = "https://invitationhomes.com/property/sitemap.xml"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "reference", "invitation-homes-listings.csv")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
DELAY = 0.25

FIELDS = [
    "slug", "streetAddress", "city", "state", "zip", "latitude", "longitude",
    "beds", "baths", "sqft", "askingRent", "market", "scrapedAt",
]

LD_JSON = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S)


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def listing_urls() -> list[str]:
    xml = get(SITEMAP)
    urls = re.findall(r"<loc>([^<]*/houses-for-rent/[^<]*)</loc>", xml)
    return [u for u in urls if "/markets/" not in u]


def nodes(doc):
    """Every dict in a JSON-LD document, flattening @graph."""
    stack = [doc]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            yield o
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)


def parse(url: str, page: str) -> dict | None:
    home, offer, crumbs = None, None, []
    for block in LD_JSON.findall(page):
        try:
            doc = json.loads(block)
        except json.JSONDecodeError:
            continue
        for n in nodes(doc):
            t = n.get("@type")
            if t in ("SingleFamilyResidence", "House", "Residence") and "address" in n:
                home = n
            elif t == "Offer" and "price" in n:
                offer = n
            elif t == "BreadcrumbList":
                crumbs = [i.get("name", "") for i in n.get("itemListElement", [])]
    if not home:
        return None
    addr = home.get("address", {})
    geo = home.get("geo", {})
    floor = home.get("floorSize", {})
    return {
        "slug": url.rstrip("/").rsplit("/", 1)[-1],
        "streetAddress": addr.get("streetAddress", ""),
        "city": addr.get("addressLocality", ""),
        "state": addr.get("addressRegion", ""),
        "zip": addr.get("postalCode", ""),
        "latitude": geo.get("latitude", ""),
        "longitude": geo.get("longitude", ""),
        "beds": home.get("numberOfBedrooms", ""),
        "baths": home.get("numberOfBathroomsTotal", ""),
        "sqft": floor.get("value", "") if isinstance(floor, dict) else "",
        "askingRent": offer.get("price", "") if offer else "",
        # Breadcrumbs run Home > Market > City > Address when present.
        "market": crumbs[1] if len(crumbs) > 2 else "",
        "scrapedAt": time.strftime("%Y-%m-%d"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    done = set()
    if os.path.exists(OUT):
        with open(OUT, newline="") as f:
            done = {r["slug"] for r in csv.DictReader(f)}

    urls = listing_urls()
    todo = [u for u in urls if u.rstrip("/").rsplit("/", 1)[-1] not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(urls)} listings in sitemap, {len(done)} already saved, {len(todo)} to fetch", flush=True)

    new_file = not os.path.exists(OUT)
    failed = 0
    with open(OUT, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        if new_file:
            w.writeheader()
        for i, url in enumerate(todo, 1):
            try:
                row = parse(url, get(url))
            except Exception as e:  # a dead listing is normal; keep going
                row = None
                print(f"  fail {url}: {e}", flush=True)
            if row:
                w.writerow(row)
                f.flush()
            else:
                failed += 1
            if i % 100 == 0:
                print(f"{i}/{len(todo)} fetched, {failed} without listing data", flush=True)
            time.sleep(DELAY)
    print(f"done: {len(todo) - failed} saved, {failed} without listing data", flush=True)


if __name__ == "__main__":
    sys.exit(main())
