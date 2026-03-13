import requests
import json
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

BASE = "https://platform.foodhelpline.org/api/resources"
all_resources, skip, take = [], 0, 100

while True:
    r = requests.get(f"{BASE}?skip={skip}&take={take}").json()
    payload = r.get("result", {}).get("data", {}).get("json", r)
    resources = payload.get("resources", [])
    if not resources:
        break
    all_resources.extend(resources)
    skip += take
    print(f"Fetched {len(all_resources)} resources...")
    if len(all_resources) >= payload.get("count", 99999):
        break

print(f"Total: {len(all_resources)}")
df = pd.json_normalize(all_resources)

df["flag_count"]       = df["flags"].apply(lambda x: len([f for f in (x or []) if not f.get("clearedAt")]))
df["requirement_tags"] = df["tags"].apply(lambda x: len([t for t in (x or []) if t.get("tagCategoryId") == "REQUIREMENT"]))
df["offering_tags"]    = df["tags"].apply(lambda x: len([t for t in (x or []) if t.get("tagCategoryId") == "OFFERING"]))
df["skip_range_count"] = df["occurrenceSkipRanges"].apply(lambda x: len(x or []))
df["confidence"]       = df["confidence"].fillna(1.0)
df["ratingAverage"]    = df["ratingAverage"].fillna(0)
df["waitTimeMinutes"]  = df["waitTimeMinutesAverage"].fillna(0)

def risk_score(row):
    score = 0
    if row["confidence"] < 0.4:   score += 35
    elif row["confidence"] < 0.7: score += 15
    score += min(row["flag_count"] * 15, 30)
    if not row.get("acceptingNewClients", True): score += 20
    if row["skip_range_count"] > 3:              score += 10
    return min(score, 100)

df["riskScore"] = df.apply(risk_score, axis=1)

cluster_df = df[["latitude", "longitude", "ratingAverage", "waitTimeMinutes"]].dropna()
scaler = StandardScaler()
X = scaler.fit_transform(cluster_df)
kmeans = KMeans(n_clusters=4, random_state=42)
cluster_df["cluster"] = kmeans.fit_predict(X)
df = df.join(cluster_df["cluster"])
df["cluster"] = df["cluster"].fillna(-1).astype(int)

cols = ["id", "name", "city", "state", "latitude", "longitude",
        "ratingAverage", "waitTimeMinutes", "confidence",
        "riskScore", "cluster", "requirement_tags", "offering_tags", "flag_count"]

df[cols].to_json("enriched_resources.json", orient="records")
df[cols].to_csv("enriched_resources.csv", index=False)
print("Saved enriched_resources.json + enriched_resources.csv")
