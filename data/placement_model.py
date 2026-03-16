"""
data/placement_model.py

ML model to learn feature weights for pantry placement scoring.

Target variable: utilization_rate = total_subscriptions_in_zip / snap_households
  - Low utilization + high SNAP density = underserved = good placement opportunity

Model: GradientBoostingRegressor
Weights: SHAP mean absolute values, normalised to sum to 1 (data-driven, defensible)

Output:
  - Supabase pantry_placement_recommendations table (top TOP_N zips)
  - data/outputs/placement_recs.json (fallback for API endpoint)
  - Console output of feature importances

Run after: compute_coverage_gap.py
Run: python data/placement_model.py
"""

import os
import json
import requests
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error
import shap
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

TOP_N = 5  # Number of top placement recommendations to return

FEATURE_COLS = [
    "coverage_gap",                # how underserved by existing pantries (0-1)
    "snap_rate",                   # proportion of HH receiving SNAP
    "poverty_rate",                # proportion below poverty line
    "limited_english_pct",         # language barrier proxy
    "social_vulnerability_score",  # CDC SVI composite (0-1, higher=more vulnerable)
    "transit_score",               # EPA transit frequency (inverted during scoring — higher=less access)
]

LEMONTREE_API = "https://platform.foodhelpline.org/api/resources"

# Optional API key — unlocks private fields
_LEMONTREE_KEY = os.environ.get("LEMONTREE_API_KEY")
_LEMONTREE_HEADERS = {"Authorization": f"Bearer {_LEMONTREE_KEY}"} if _LEMONTREE_KEY else {}


def fetch_subscriptions_by_zip():
    """
    Re-fetch Lemontree resources using cursor-based pagination and aggregate
    subscription counts by zip.
    Returns dict: { zip_code: total_subscriptions }
    """
    print("  Fetching Lemontree resources for subscription aggregation...")
    all_resources = []
    take = 100
    cursor = None
    total = None

    while True:
        params = {"take": take}
        if cursor:
            params["cursor"] = cursor

        resp = requests.get(LEMONTREE_API, params=params, headers=_LEMONTREE_HEADERS, timeout=30)
        resp.raise_for_status()
        raw = resp.json()
        data = raw.get("json", raw)
        resources = data.get("resources", [])
        if total is None:
            total = data.get("count", 0)
        all_resources.extend(resources)

        cursor = data.get("cursor")
        if not cursor:
            break

    print(f"  Fetched {len(all_resources)}/{total} resources")

    subs_by_zip: dict[str, int] = {}
    for r in all_resources:
        z = r.get("zipCode")
        if not z:
            continue
        z = str(z).zfill(5)
        subs = (r.get("_count") or {}).get("resourceSubscriptions", 0)
        subs_by_zip[z] = subs_by_zip.get(z, 0) + subs
    return subs_by_zip


def fetch_full_table(supabase, table_name):
    """Fetch all rows from a Supabase table using 1000-row pages."""
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        result = (
            supabase.table(table_name)
            .select("*")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def load_training_data(supabase):
    """
    Load and join zip_coverage_gap + zip_demographics + subscription aggregates.
    Computes utilization_rate as the training target.
    Returns clean DataFrame ready for training.
    """
    print("  Loading zip_coverage_gap from Supabase...")
    gap_rows = fetch_full_table(supabase, "zip_coverage_gap")
    gap_df = pd.DataFrame(gap_rows)

    print("  Loading zip_demographics from Supabase...")
    demo_rows = fetch_full_table(supabase, "zip_demographics")
    demo_df = pd.DataFrame(demo_rows)

    subs_by_zip = fetch_subscriptions_by_zip()
    subs_df = pd.DataFrame(
        list(subs_by_zip.items()), columns=["zip", "total_subscriptions"]
    )

    df = gap_df.merge(demo_df, on="zip", how="inner")
    df = df.merge(subs_df, on="zip", how="left")
    df["total_subscriptions"] = df["total_subscriptions"].fillna(0)

    # Target: utilisation rate (subscriptions per SNAP household)
    df["snap_households"] = pd.to_numeric(df["snap_households"], errors="coerce")
    df["utilization_rate"] = df["total_subscriptions"] / df["snap_households"].replace(0, np.nan)
    df["utilization_rate"] = df["utilization_rate"].clip(0, 2).fillna(0)

    # Drop rows too small to be meaningful
    df = df[df["snap_households"] >= 50]

    # Ensure feature columns are numeric
    for col in FEATURE_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Replace EPA sentinel values (-99999) before imputation
    for col in FEATURE_COLS:
        if col in df.columns:
            df[col] = df[col].replace(-99999, np.nan)

    # Impute missing feature values with column median (handles missing SVI/transit data)
    for col in FEATURE_COLS:
        if col in df.columns and df[col].isna().any():
            median_val = df[col].median()
            fill_val = median_val if pd.notna(median_val) else 0.5
            null_count = df[col].isna().sum()
            print(f"  Imputing {null_count} nulls in '{col}' with median={fill_val:.4f}")
            df[col] = df[col].fillna(fill_val)

    df = df.dropna(subset=FEATURE_COLS)
    return df.reset_index(drop=True)


def train_model(df):
    """
    Train GradientBoostingRegressor on utilization_rate.
    Returns (model, scaler, X_scaled_full, feature_names).
    """
    X = df[FEATURE_COLS].copy()
    y = df["utilization_rate"].values

    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(X)

    # Invert transit_score: higher original transit = better coverage = less placement need
    transit_idx = FEATURE_COLS.index("transit_score")
    X_scaled[:, transit_idx] = 1.0 - X_scaled[:, transit_idx]

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42
    )

    model = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    print(f"  Model R²: {r2:.4f}  |  MAE: {mae:.4f}")
    if r2 < 0.1:
        print("  WARNING: R² < 0.1 — weak signal, but SHAP weights are still valid relative importances")

    return model, scaler, X_scaled, FEATURE_COLS, r2


def extract_shap_weights(model, X_scaled):
    """
    Compute feature importance weights via SHAP TreeExplainer.
    Returns dict: { feature_name -> normalised weight (float) }
    """
    sample = X_scaled
    if len(sample) > 5000:
        idx = np.random.choice(len(sample), 5000, replace=False)
        sample = X_scaled[idx]

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(sample)

    mean_abs = np.abs(shap_values).mean(axis=0)
    total = mean_abs.sum()
    weights = (mean_abs / total) if total > 0 else np.ones(len(FEATURE_COLS)) / len(FEATURE_COLS)

    weight_dict = dict(zip(FEATURE_COLS, [round(float(w), 6) for w in weights]))
    print("\n  SHAP feature weights (normalised):")
    for feat, w in sorted(weight_dict.items(), key=lambda x: -x[1]):
        print(f"    {feat:<35} {w:.4f}")
    return weight_dict


def score_and_recommend(df, weights, scaler, top_n=TOP_N):
    """
    Apply learned weights to score every zip for placement priority.
    Returns list of top_n recommendation dicts.
    """
    X = df[FEATURE_COLS].copy()
    X_scaled = scaler.transform(X)

    transit_idx = FEATURE_COLS.index("transit_score")
    X_scaled[:, transit_idx] = 1.0 - X_scaled[:, transit_idx]

    weight_arr = np.array([weights[f] for f in FEATURE_COLS])
    weighted_sum = X_scaled.dot(weight_arr)

    need_score = 1.0 - df["utilization_rate"].clip(0, 1).values
    placement_score = weighted_sum * need_score

    df = df.copy()
    df["placement_score"] = placement_score

    df = df[df["snap_households"] >= 100]

    all_scored = df[["zip", "placement_score"]].copy()
    top = df.nlargest(top_n, "placement_score").reset_index(drop=True)

    # Percentile thresholds for explanation generation
    p75_snap = df["snap_rate"].quantile(0.75)
    p25_transit = df["transit_score"].quantile(0.25)
    p75_eng = df["limited_english_pct"].quantile(0.75)

    recommendations = []
    for _, row in top.iterrows():
        reasons = []
        if pd.notna(row.get("snap_rate")) and row["snap_rate"] > p75_snap:
            snap_hh = int(row.get("snap_households", 0))
            pct = round(row["snap_rate"] * 100, 1)
            reasons.append(f"{snap_hh:,} SNAP households ({pct}% of zip)")
        if pd.notna(row.get("coverage_gap")) and row["coverage_gap"] > 0.7:
            nearest = row.get("nearest_pantry_name") or "nearest pantry"
            reasons.append(f"nearest reliable pantry is {nearest}")
        if pd.notna(row.get("transit_score")) and row["transit_score"] < p25_transit:
            reasons.append("limited transit access")
        if pd.notna(row.get("limited_english_pct")) and row["limited_english_pct"] > p75_eng:
            pct = round(row["limited_english_pct"] * 100, 1)
            reasons.append(f"{pct}% limited English proficiency")

        explanation = " · ".join(reasons) if reasons else "High composite need score"

        recommendations.append({
            "zip": str(row["zip"]),
            "zip_lat": round(float(row["zip_lat"]), 6) if pd.notna(row.get("zip_lat")) else None,
            "zip_lon": round(float(row["zip_lon"]), 6) if pd.notna(row.get("zip_lon")) else None,
            "placement_score": round(float(row["placement_score"]), 6),
            "snap_households": int(row["snap_households"]) if pd.notna(row.get("snap_households")) else None,
            "snap_rate": round(float(row["snap_rate"]), 6) if pd.notna(row.get("snap_rate")) else None,
            "coverage_gap": round(float(row["coverage_gap"]), 6) if pd.notna(row.get("coverage_gap")) else None,
            "utilization_rate": round(float(row["utilization_rate"]), 6),
            "pantry_count_nearby": int(row["pantry_count_nearby"]) if pd.notna(row.get("pantry_count_nearby")) else 0,
            "social_vulnerability_score": round(float(row["social_vulnerability_score"]), 6) if pd.notna(row.get("social_vulnerability_score")) else None,
            "transit_score": round(float(row["transit_score"]), 6) if (pd.notna(row.get("transit_score")) and row["transit_score"] >= 0) else None,
            "explanation": explanation,
            "feature_weights": weights,
        })

    return recommendations, all_scored


def zip_to_state(zip_str):
    """Derive 2-letter state abbreviation from zip code using numeric ranges."""
    try:
        z = int(zip_str)
    except (ValueError, TypeError):
        return None
    ranges = [
        (601, 988, 'PR'), (1001, 2791, 'MA'), (2801, 2940, 'RI'),
        (3031, 3897, 'NH'), (3901, 4992, 'ME'), (5001, 5907, 'VT'),
        (6001, 6928, 'CT'), (7001, 8989, 'NJ'), (10001, 14975, 'NY'),
        (15001, 19640, 'PA'), (19701, 19980, 'DE'), (20001, 20599, 'DC'),
        (20601, 21930, 'MD'), (22001, 24658, 'VA'), (24701, 26886, 'WV'),
        (27006, 28909, 'NC'), (29001, 29948, 'SC'), (30001, 31999, 'GA'),
        (32004, 34997, 'FL'), (35004, 36925, 'AL'), (37010, 38589, 'TN'),
        (38601, 39776, 'MS'), (40003, 42788, 'KY'), (43001, 45999, 'OH'),
        (46001, 47997, 'IN'), (48001, 49971, 'MI'), (50001, 52809, 'IA'),
        (53001, 54990, 'WI'), (55001, 56763, 'MN'), (57001, 57799, 'SD'),
        (58001, 58856, 'ND'), (59001, 59937, 'MT'), (60001, 62999, 'IL'),
        (63001, 65899, 'MO'), (66002, 67954, 'KS'), (68001, 69367, 'NE'),
        (70001, 71497, 'LA'), (71601, 72959, 'AR'), (73001, 74966, 'OK'),
        (75001, 79999, 'TX'), (80001, 81658, 'CO'), (82001, 83128, 'WY'),
        (83201, 83876, 'ID'), (84001, 84784, 'UT'), (85001, 86556, 'AZ'),
        (87001, 88441, 'NM'), (88901, 89883, 'NV'), (90001, 96162, 'CA'),
        (96701, 96898, 'HI'), (97001, 97920, 'OR'), (98001, 99403, 'WA'),
        (99501, 99950, 'AK'),
    ]
    for lo, hi, state in ranges:
        if lo <= z <= hi:
            return state
    return None


def save_results(recommendations, model_r2, supabase, all_scored_df=None):
    """
    Save results to Supabase pantry_placement_recommendations and local JSON fallback.
    Also saves all scored zips to zip_placement_scores for state-level filtering.
    """
    records = [
        {**rec, "model_r2": round(float(model_r2), 6)}
        for rec in recommendations
    ]

    # Supabase upsert — strip lat/lon if table doesn't have those columns yet
    _GEO_COLS = {"zip_lat", "zip_lon"}
    supabase_records = [{k: v for k, v in r.items() if k not in _GEO_COLS} for r in records]
    try:
        supabase.table("pantry_placement_recommendations").upsert(supabase_records).execute()
        print(f"  Upserted {len(supabase_records)} recommendations to Supabase")
    except Exception as e:
        print(f"  ERROR writing to Supabase: {e}")

    # Bulk upsert all scored zips to zip_placement_scores for state filtering
    if all_scored_df is not None:
        score_rows = [
            {
                "zip": str(row["zip"]),
                "placement_score": round(float(row["placement_score"]), 6),
                "state": zip_to_state(str(row["zip"]))
            }
            for _, row in all_scored_df.iterrows()
        ]
        batch_size = 1000
        saved = 0
        for i in range(0, len(score_rows), batch_size):
            try:
                supabase.table("zip_placement_scores").upsert(score_rows[i:i+batch_size]).execute()
                saved += len(score_rows[i:i+batch_size])
            except Exception as e:
                print(f"  ERROR writing zip_placement_scores batch {i}: {e}")
        print(f"  Upserted {saved} zip scores to zip_placement_scores")

    # Local JSON fallback
    outputs_dir = os.path.join(os.path.dirname(__file__), "outputs")
    os.makedirs(outputs_dir, exist_ok=True)
    out_path = os.path.join(outputs_dir, "placement_recs.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    print(f"  Saved fallback JSON to {out_path}")


if __name__ == "__main__":
    supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )

    print("Loading training data from Supabase...")
    df = load_training_data(supabase)
    print(f"  Training dataset: {len(df)} zip codes")
    print(f"  Utilization rate — mean: {df['utilization_rate'].mean():.3f}, "
          f"median: {df['utilization_rate'].median():.3f}")

    print("\nTraining model...")
    model, scaler, X_scaled, feature_names, model_r2 = train_model(df)

    print("\nExtracting SHAP feature weights...")
    weights = extract_shap_weights(model, X_scaled)

    print("\nScoring all zip codes and generating recommendations...")
    recommendations, all_scored = score_and_recommend(df, weights, scaler)

    print("\nSaving results...")
    save_results(recommendations, model_r2, supabase, all_scored_df=all_scored)

    print(f"\n=== TOP {TOP_N} PLACEMENT RECOMMENDATIONS ===")
    for i, rec in enumerate(recommendations, 1):
        print(f"{i}. ZIP {rec['zip']} — Score: {rec['placement_score']:.4f}")
        print(f"   {rec['explanation']}")
