"""Scrape TRD Motorcycles' used-bike stock (details + images).

The showroom site (showroom.trdmotorcycles.co.za) loads its stock from a JSON
feed at 0000.ashx?info=6. This script pulls that feed, normalises each bike,
writes data/stock.json + data/stock.csv and downloads every photo into
data/images/<stock_no>/.

Usage:  python3 scraper/scrape_stock.py [--no-images]
"""

import argparse
import csv
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://showroom.trdmotorcycles.co.za"
FEED_URL = f"{BASE}/0000.ashx?info=6"
UA = "Mozilla/5.0 (compatible; trd-stock-sync/1.0)"

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
IMAGES_DIR = DATA_DIR / "images"

# Feed key -> clean output key
FIELDS = {
    "u_code": "id",
    "u_stockno": "stock_no",
    "u_year": "year",
    "u_make": "make",
    "u_model": "model",
    "u_modelshort": "model_short",
    "u_price": "price",
    "u_cashpriceincluding": "cash_price_incl_vat",
    "u_priceexcludingvat": "price_excl_vat",
    "u_installmentCost": "monthly_installment",
    "u_mileage": "mileage_km",
    "u_cc": "engine_cc",
    "u_power": "power_kw",
    "u_torque": "torque_nm",
    "u_gears": "gears",
    "u_trans": "transmission",
    "u_drive": "drive",
    "u_fuel": "fuel",
    "u_color": "colour",
    "u_body": "body",
    "u_mmcode": "mm_code",
    "u_vin": "vin",
    "u_engineno": "engine_no",
    "u_comments": "description",
    "u_extras": "extras",
    "u_video": "video",
    "u_branchLocation": "branch",
}

# Make names in the feed are inconsistent ("KAWASAKI", "Kwasaki", "QJ Motors"...)
MAKE_ALIASES = {
    "kawasaki": "Kawasaki",
    "kwasaki": "Kawasaki",
    "triumph": "Triumph",
    "harley davidson": "Harley-Davidson",
    "qj motor": "QJ Motor",
    "qj motors": "QJ Motor",
    "mv agusta": "MV Agusta",
    "lifan": "Lifan",
    "bmw": "BMW",
    "ktm": "KTM",
}


def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def to_number(value):
    try:
        n = float(str(value).replace(",", ""))
    except ValueError:
        return None
    return int(n) if n.is_integer() else round(n, 2)


def clean(raw):
    bike = {out: raw.get(src, "") for src, out in FIELDS.items()}
    for key in ("year", "price", "cash_price_incl_vat", "price_excl_vat",
                "monthly_installment", "mileage_km", "engine_cc",
                "power_kw", "torque_nm", "gears"):
        bike[key] = to_number(bike[key])
    for key, value in bike.items():
        if value in ("N/A", ""):
            bike[key] = None
    make = (bike["make"] or "").strip()
    bike["make"] = MAKE_ALIASES.get(make.lower(), make)
    bike["title"] = " ".join(str(p) for p in (bike["year"], bike["make"], bike["model"]) if p)
    bike["on_special"] = bool(
        bike["cash_price_incl_vat"] and bike["price"]
        and bike["cash_price_incl_vat"] < bike["price"]
    )
    bike["url"] = BASE + "/index.html" + raw.get("u_url", "")
    images = raw.get("u_largepic") or raw.get("u_fullpic") or raw.get("u_images") or []
    bike["image_urls"] = list(dict.fromkeys(images))  # dedupe, keep order
    return bike


def safe_name(text):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", text).strip("_") or "unknown"


def download_images(bike):
    folder = IMAGES_DIR / safe_name(bike["stock_no"] or bike["id"])
    folder.mkdir(parents=True, exist_ok=True)
    local = []
    for url in bike["image_urls"]:
        dest = folder / safe_name(url.rsplit("/", 1)[-1])
        if not dest.exists():
            try:
                dest.write_bytes(fetch(url))
            except Exception as e:
                print(f"  ! failed {url}: {e}")
                continue
        local.append(str(dest.relative_to(DATA_DIR)))
    bike["images"] = local
    return bike


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-images", action="store_true", help="skip downloading photos")
    args = parser.parse_args()

    print(f"Fetching {FEED_URL}")
    feed = json.loads(fetch(FEED_URL).decode("utf-8-sig"))
    bikes = [clean(v) for v in feed.get("usedVehicles", [])]
    print(f"Found {len(bikes)} bikes")

    DATA_DIR.mkdir(exist_ok=True)
    if not args.no_images:
        with ThreadPoolExecutor(max_workers=4) as pool:
            for i, bike in enumerate(pool.map(download_images, bikes), 1):
                print(f"[{i}/{len(bikes)}] {bike['title']} - {len(bike['images'])} images")

    (DATA_DIR / "stock.json").write_text(json.dumps(bikes, indent=2, ensure_ascii=False))

    columns = [k for k in bikes[0] if k not in ("image_urls", "images")] + ["image_count", "image_urls"]
    with open(DATA_DIR / "stock.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for bike in bikes:
            writer.writerow({**bike, "image_count": len(bike["image_urls"]),
                             "image_urls": " | ".join(bike["image_urls"])})

    print(f"Saved {DATA_DIR / 'stock.json'} and {DATA_DIR / 'stock.csv'}")


if __name__ == "__main__":
    main()
