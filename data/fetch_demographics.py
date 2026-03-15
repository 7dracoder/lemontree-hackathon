"""
data/fetch_demographics.py

Fetches national demographic data and writes to Supabase zip_demographics table.
Data sources:
  - Census ACS 5-year 2023: SNAP, income, poverty, language
  - CDC Social Vulnerability Index 2022: vulnerability score per zip
  - EPA Smart Location Database v3: transit accessibility per zip

Run: python data/fetch_demographics.py
Expected runtime: 3-5 minutes
Expected output: ~33,000 zip code records written to Supabase

Prerequisites:
  - data/raw/SVI_2022_US.csv       (download from ATSDR — see ARCHITECTURE.md)
  - data/raw/SmartLocationDatabase_v3.csv  (user has zip from EPA)
  - .env with SUPABASE_URL, SUPABASE_SERVICE_KEY, CENSUS_API_KEY
"""

import os
import sys
import json
import requests
import pandas as pd
import numpy as np
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CENSUS_KEY = os.environ["CENSUS_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CENSUS_URL = "https://api.census.gov/data/2024/acs/acs5"
CENSUS_VARS = ",".join([
    "B19058_002E",  # SNAP/food stamp recipient households
    "B19058_001E",  # Total households (denominator for snap_rate)
    "B19013_001E",  # Median household income
    "B17001_002E",  # Population below poverty line
    "B01003_001E",  # Total population
    "B16010_002E",  # Population with limited English proficiency
    "NAME",
])


def fetch_census_acs():
    """
    Fetch Census ACS 5-year 2024 data for all US zip codes.
    Returns DataFrame with columns: zip, snap_households, total_households,
    median_income, poverty_count, total_population, limited_english,
    snap_rate, poverty_rate, limited_english_pct
    """
    print("  Requesting Census ACS data (single wildcard request)...")
    resp = requests.get(
        CENSUS_URL,
        params={
            "get": CENSUS_VARS,
            "for": "zip code tabulation area:*",
            "key": CENSUS_KEY,
        },
        timeout=120,
    )
    resp.raise_for_status()
    raw = resp.json()

    headers = raw[0]
    rows = raw[1:]
    df = pd.DataFrame(rows, columns=headers)

    # The zip column comes back as "zip code tabulation area"
    df = df.rename(columns={"zip code tabulation area": "zip"})

    # Numeric columns — Census uses "-666666666" for missing
    num_cols = [
        "B19058_002E", "B19058_001E", "B19013_001E",
        "B17001_002E", "B01003_001E", "B16010_002E",
    ]
    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df[col].replace(-666666666, np.nan)

    df = df.rename(columns={
        "B19058_002E": "snap_households",
        "B19058_001E": "total_households",
        "B19013_001E": "median_income",
        "B17001_002E": "poverty_count",
        "B01003_001E": "total_population",
        "B16010_002E": "limited_english",
    })

    df["snap_rate"] = df["snap_households"] / df["total_households"].replace(0, np.nan)
    df["poverty_rate"] = df["poverty_count"] / df["total_population"].replace(0, np.nan)
    df["limited_english_pct"] = df["limited_english"] / df["total_population"].replace(0, np.nan)

    return df[["zip", "snap_households", "total_households", "snap_rate",
               "median_income", "poverty_count", "total_population",
               "poverty_rate", "limited_english", "limited_english_pct"]]


def load_svi_data():
    """
    Load CDC Social Vulnerability Index from data/raw/SVI_2022_US.csv.
    Returns DataFrame with columns: zip, social_vulnerability_score
    """
    svi_path = os.path.join(os.path.dirname(__file__), "raw", "SVI_2022_US.csv")
    if not os.path.exists(svi_path):
        print(f"  WARNING: {svi_path} not found — social_vulnerability_score will be null")
        return pd.DataFrame(columns=["zip", "social_vulnerability_score"])

    df = pd.read_csv(svi_path, encoding="latin-1", dtype={"ZCTA5": str}, low_memory=False)

    df["RPL_THEMES"] = pd.to_numeric(df["RPL_THEMES"], errors="coerce")
    df["RPL_THEMES"] = df["RPL_THEMES"].replace(-999, np.nan)

    # Multiple census tracts per zip — take mean
    df = df.groupby("ZCTA5", as_index=False)["RPL_THEMES"].mean()
    df = df.rename(columns={"ZCTA5": "zip", "RPL_THEMES": "social_vulnerability_score"})

    # Zero-pad to 5 chars
    df["zip"] = df["zip"].str.zfill(5)
    return df[["zip", "social_vulnerability_score"]]


def load_epa_transit():
    """
    Load EPA Smart Location Database v3 from data/raw/SmartLocationDatabase_v3.csv.
    Returns DataFrame with columns: zip, transit_score, transit_distance

    D4c = Transit frequency (routes/sqmi within 0.25mi) — higher = better transit
    D4a = Distance to nearest transit stop (meters) — lower = better
    """
    epa_path = os.path.join(os.path.dirname(__file__), "raw", "EPA_SmartLocationDatabase_V3.csv")
    if not os.path.exists(epa_path):
        print(f"  WARNING: {epa_path} not found — transit columns will be null")
        return pd.DataFrame(columns=["zip", "transit_score", "transit_distance"])

    df = pd.read_csv(
        epa_path,
        usecols=["GEOID10", "D4C", "D4A"],
        dtype={"GEOID10": str},
        low_memory=False,
    )

    # GEOID10 is a 12-digit block group ID; first 5 chars = zip
    df["zip"] = df["GEOID10"].str.zfill(12).str[:5]

    df["D4C"] = pd.to_numeric(df["D4C"], errors="coerce").replace(-99999, np.nan)
    df["D4A"] = pd.to_numeric(df["D4A"], errors="coerce").replace(-99999, np.nan)

    df = df.groupby("zip", as_index=False).agg(
        transit_score=("D4C", "mean"),
        transit_distance=("D4A", "mean"),
    )
    return df[["zip", "transit_score", "transit_distance"]]


def write_to_supabase(df):
    """
    Upsert demographic data to Supabase zip_demographics in batches of 500.
    Skips rows with invalid zip or null snap_households.
    """
    # Validate zip format (5-digit string)
    df = df[df["zip"].str.match(r"^\d{5}$", na=False)].copy()
    df = df.dropna(subset=["snap_households"])

    # pandas NaN is not valid JSON — serialize through json to convert NaN → null → None
    records = json.loads(df.to_json(orient="records"))

    # Census returns integer columns as floats (e.g. 19454.0) — cast to int for Supabase INTEGER columns
    int_cols = {"snap_households", "total_households", "median_income",
                "poverty_count", "total_population", "limited_english"}
    records = [
        {k: (int(v) if k in int_cols and v is not None else v) for k, v in row.items()}
        for row in records
    ]

    failed = 0
    for i in range(0, len(records), 500):
        batch = records[i : i + 500]
        try:
            supabase.table("zip_demographics").upsert(batch).execute()
        except Exception as e:
            print(f"  ERROR on batch {i//500}: {e}")
            failed += 500

    if failed:
        print(f"  WARNING: ~{failed} rows failed to upsert")
    print(f"  Upserted {len(records) - failed} rows into zip_demographics")


if __name__ == "__main__":
    print("Fetching Census ACS 2023 data...")
    acs = fetch_census_acs()
    print(f"  Got {len(acs)} zip records from Census")

    print("Loading CDC SVI data...")
    svi = load_svi_data()
    print(f"  Loaded {len(svi)} zip records from SVI")

    print("Loading EPA Smart Location transit data...")
    epa = load_epa_transit()
    print(f"  Loaded {len(epa)} zip records from EPA")

    print("Joining datasets...")
    df = acs.merge(svi, on="zip", how="left")
    df = df.merge(epa, on="zip", how="left")
    print(f"  Final joined dataset: {len(df)} rows")

    print("Writing to Supabase...")
    write_to_supabase(df)
    print("Done. zip_demographics table populated.")
