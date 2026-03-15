"""
data/compute_coverage_gap.py

Computes coverage gap per zip code by joining Lemontree pantry data
with zip centroids. Coverage gap = how underserved is this zip?

Algorithm per zip centroid:
  1. Find all pantries within RADIUS_MILES (default: 5 miles)
  2. Compute reliability score per pantry (confidence + rating + accepting + flags)
  3. Weight each pantry's reliability by inverse distance (closer = more weight)
  4. coverage = sum(reliability * 1/(1+distance))
  5. gap = 1 / (1 + coverage)  ->  0 = well covered, 1 = no coverage

Run after: fetch_demographics.py
Run: python data/compute_coverage_gap.py
Expected runtime: 15-30 minutes (~33k zips x ~14k pantries with bbox pre-filter)
"""

import os
import json
import math
import requests
import pandas as pd
import numpy as np
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

RADIUS_MILES = 5
LEMONTREE_API = "https://platform.foodhelpline.org/api/resources"
DEG_PER_MILE = 1 / 69.0  # approximate degrees latitude per mile

# Optional API key — unlocks private fields (acceptingNewClients, flags)
_LEMONTREE_KEY = os.environ.get("LEMONTREE_API_KEY")
_LEMONTREE_HEADERS = {"Authorization": f"Bearer {_LEMONTREE_KEY}"} if _LEMONTREE_KEY else {}


def fetch_all_lemontree_resources():
    """
    Fetch ALL resources from Lemontree API using cursor-based pagination.
    Response shape (superjson): { "json": { "count": N, "resources": [...], "cursor": "..." } }
    Pagination: pass cursor from previous response as ?cursor=<value>.
    When cursor is absent from response, we are on the last page.
    Filters out resources missing lat/lon or already merged.
    """
    all_resources = []
    take = 100
    cursor = None
    total = None

    while True:
        params = {"take": take}
        if cursor:
            params["cursor"] = cursor

        resp = requests.get(
            LEMONTREE_API,
            params=params,
            headers=_LEMONTREE_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        raw = resp.json()
        data = raw.get("json", raw)

        resources = data.get("resources", [])
        if total is None:
            total = data.get("count", 0)

        all_resources.extend(resources)

        fetched = len(all_resources)
        if fetched % 1000 < take or not data.get("cursor"):
            print(f"  Fetched {fetched}/{total} resources...")

        cursor = data.get("cursor")
        if not cursor:
            break

    # Filter invalid/deprecated resources
    valid = [
        r for r in all_resources
        if r.get("latitude") is not None
        and r.get("longitude") is not None
        and r.get("mergedToResourceId") is None
    ]
    return valid


def compute_reliability_score(resource):
    """
    Compute a 0-1 reliability score for a single pantry.

    confidence_component  = (confidence or 0.5) * 0.40
    rating_component      = (ratingAverage or 0) / 5 * 0.30
    accepting_component   = (1 if acceptingNewClients else 0) * 0.20
    flag_component        = (1 - min(uncleared_flags, 5) / 5) * 0.10

    uncleared flags = flags where clearedAt is None AND abandonedForReason is None
    """
    confidence = resource.get("confidence") or 0.5
    rating = resource.get("ratingAverage") or 0.0
    accepting = 1 if resource.get("acceptingNewClients", True) else 0

    flags = resource.get("flags") or []
    uncleared = sum(
        1 for f in flags
        if f.get("clearedAt") is None and f.get("abandonedForReason") is None
    )
    flag_penalty = min(uncleared, 5) / 5

    score = (
        confidence * 0.40
        + (rating / 5.0) * 0.30
        + accepting * 0.20
        + (1 - flag_penalty) * 0.10
    )
    return float(np.clip(score, 0.0, 1.0))


def haversine_miles(lat1, lon1, lat2, lon2):
    """Distance in miles between two lat/lon points (Haversine formula)."""
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_zip_centroids():
    """
    Load zip centroids from data/raw/2025_Gaz_zcta_national.txt (pipe-delimited).
    Columns used: GEOID (zip), INTPTLAT, INTPTLONG
    Returns DataFrame: zip, zip_lat, zip_lon
    """
    gaz_path = os.path.join(os.path.dirname(__file__), "raw", "2025_Gaz_zcta_national.txt")
    if not os.path.exists(gaz_path):
        print(f"ERROR: {gaz_path} not found.")
        raise FileNotFoundError(gaz_path)

    df = pd.read_csv(
        gaz_path,
        sep="|",
        dtype={"GEOID": str},
        usecols=["GEOID", "INTPTLAT", "INTPTLONG"],
    )
    df = df.rename(columns={"GEOID": "zip", "INTPTLAT": "zip_lat", "INTPTLONG": "zip_lon"})
    df["zip"] = df["zip"].str.strip().str.zfill(5)
    df = df[(df["zip_lat"] != 0) & (df["zip_lon"] != 0)].dropna(subset=["zip_lat", "zip_lon"])
    return df.reset_index(drop=True)


def compute_gap_for_zip(zip_row, pantries_df):
    """
    Compute coverage gap for a single zip centroid.
    Uses bounding box pre-filter before full haversine to keep runtime manageable.
    Returns dict: coverage_gap, pantry_count_nearby, nearest_pantry_name, nearest_pantry_miles
    """
    lat, lon = zip_row["zip_lat"], zip_row["zip_lon"]
    deg_radius = RADIUS_MILES * DEG_PER_MILE

    # Bounding box pre-filter
    nearby = pantries_df[
        (pantries_df["lat"] >= lat - deg_radius) &
        (pantries_df["lat"] <= lat + deg_radius) &
        (pantries_df["lon"] >= lon - deg_radius) &
        (pantries_df["lon"] <= lon + deg_radius)
    ].copy()

    if nearby.empty:
        return {
            "coverage_gap": 1.0,
            "pantry_count_nearby": 0,
            "nearest_pantry_name": None,
            "nearest_pantry_miles": None,
        }

    # Exact haversine distances
    nearby["dist"] = nearby.apply(
        lambda r: haversine_miles(lat, lon, r["lat"], r["lon"]), axis=1
    )
    within = nearby[nearby["dist"] <= RADIUS_MILES]

    if within.empty:
        nearest = nearby.loc[nearby["dist"].idxmin()]
        return {
            "coverage_gap": 1.0,
            "pantry_count_nearby": 0,
            "nearest_pantry_name": nearest["name"],
            "nearest_pantry_miles": round(nearest["dist"], 2),
        }

    # Weighted coverage
    within = within.copy()
    within["weight"] = 1.0 / (1.0 + within["dist"])
    coverage = (within["reliability"] * within["weight"]).sum()
    gap = round(1.0 / (1.0 + coverage), 4)

    nearest = within.loc[within["dist"].idxmin()]
    return {
        "coverage_gap": gap,
        "pantry_count_nearby": len(within),
        "nearest_pantry_name": nearest["name"],
        "nearest_pantry_miles": round(nearest["dist"], 2),
    }


if __name__ == "__main__":
    print("Fetching Lemontree resources...")
    resources = fetch_all_lemontree_resources()
    print(f"  Fetched {len(resources)} valid resources")

    print("Computing reliability scores...")
    pantries = pd.DataFrame([{
        "id": r["id"],
        "name": r.get("name", "Unknown"),
        "zip": r.get("zipCode"),
        "lat": float(r["latitude"]),
        "lon": float(r["longitude"]),
        "reliability": compute_reliability_score(r),
        "subscriptions": (r.get("_count") or {}).get("resourceSubscriptions", 0),
    } for r in resources])
    print(f"  Built pantry DataFrame: {len(pantries)} rows")

    print("Loading zip centroids...")
    zcta = load_zip_centroids()
    print(f"  Loaded {len(zcta)} zip centroids")

    print("Computing coverage gaps (this takes ~20 minutes)...")
    results = []
    total = len(zcta)
    for i, row in zcta.iterrows():
        gap_data = compute_gap_for_zip(row, pantries)
        results.append({
            "zip": row["zip"],
            "zip_lat": row["zip_lat"],
            "zip_lon": row["zip_lon"],
            **gap_data,
        })
        if i % 1000 == 0:
            print(f"  {i}/{total} zips processed...")

    gap_df = pd.DataFrame(results)
    print(f"  Computed gaps for {len(gap_df)} zip codes")

    print("Writing to Supabase...")
    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )
    records = json.loads(gap_df.dropna(subset=["zip"]).to_json(orient="records"))
    failed = 0
    for i in range(0, len(records), 500):
        try:
            supabase.table("zip_coverage_gap").upsert(records[i : i + 500]).execute()
        except Exception as e:
            print(f"  ERROR on batch {i//500}: {e}")
            failed += 500

    if failed:
        print(f"  WARNING: ~{failed} rows failed to upsert")
    print(f"Done. {len(records) - failed} coverage gap records written.")
