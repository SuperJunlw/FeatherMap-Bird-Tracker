from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx
from fastapi import Query
import math
from collections import defaultdict
import asyncio
from pathlib import Path
import json
import statistics

CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)
GBIF_API = "https://api.gbif.org/v1"

import sqlite3

DB_PATH = Path("cache.db")

def _init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT)"
        )

_init_db()

def cache_get(key: str):
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT value FROM cache WHERE key = ?", (key,)
        ).fetchone()
    return json.loads(row[0]) if row else None

def cache_set(key: str, value):
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)",
            (key, json.dumps(value)),
        )
        conn.commit()


app = FastAPI(title="FeatherMap API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "FeatherMap API is running"}

## Endpoints
##Returns species key from scientific name entered
@app.get("/api/species/search")
async def search_species(q: str = Query(..., min_length=2)):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{GBIF_API}/species/suggest", params={"q": q, "limit": 10, "higherTaxonKey": 212}) # 212 is the key for Aves (birds)
    results = r.json()
    return [
        {"key": s["key"], "name": s.get("canonicalName", s.get("scientificName", "")), "commonName": s.get("vernacularName", "")}
        for s in results
    ]

##Returns Image of species searched by species key
@app.get("/api/species/{species_key}/image")
async def get_species_image(species_key: int):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{GBIF_API}/occurrence/search", params={
            "speciesKey": species_key,
            "mediaType": "StillImage",
            "limit": 50,
        })
    data = r.json()
    for rec in data.get("results", []):
        for media in rec.get("media", []):
            url = media.get("identifier")
            if media.get("type") == "StillImage" and url and url.startswith("https"):
                return {
                    "image_url": url,
                    "license": media.get("license", ""),
                    "publisher": rec.get("institutionCode", ""),
                }
    raise HTTPException(status_code=404, detail="No image found for this species")

##Gathers and aggregates data of the species attached input species key
@app.get("/api/species/{species_key}/occurrences")
async def get_occurrences(species_key: int):
    cached = cache_get(str(species_key))
    if cached is not None:
        return cached
    grid = defaultdict(int)
    years = list(range(1990, 2027, 2))
    per_year_limit = 3000
    page_size = 300

    async def fetch_year(client, year):
    # First page — also tells us total count
        try:
            r = await client.get(f"{GBIF_API}/occurrence/search", params={
                "speciesKey": species_key,
                "hasCoordinate": True,
                "hasGeospatialIssue": False,
                "year": year,
                "limit": page_size,
                "offset": 0,
            })
            first_page = r.json()
        except (httpx.TimeoutException, httpx.HTTPError):
            return []

        if not isinstance(first_page, dict):
            return []

        records = first_page.get("results", [])
        total = min(first_page.get("count", 0), per_year_limit)

        if total <= page_size:
            return records

        # Fire all remaining pages concurrently
        offsets = list(range(page_size, total, page_size))

        async def fetch_page(offset):
            try:
                r = await client.get(f"{GBIF_API}/occurrence/search", params={
                    "speciesKey": species_key,
                    "hasCoordinate": True,
                    "hasGeospatialIssue": False,
                    "year": year,
                    "limit": page_size,
                    "offset": offset,
                })
                data = r.json()
                return data.get("results", []) if isinstance(data, dict) else []
            except (httpx.TimeoutException, httpx.HTTPError):
                return []

        page_results = await asyncio.gather(*[fetch_page(o) for o in offsets])
        for batch in page_results:
            records.extend(batch)

        return records
    
    async with httpx.AsyncClient(timeout=20) as client:
        results = await asyncio.gather(*[fetch_year(client, y) for y in years])

    for batch in results:
        for rec in batch:
            lat = rec.get("decimalLatitude")
            lon = rec.get("decimalLongitude")
            year_val = rec.get("year")
            if lat and lon and year_val:
                lat_bin = round(math.floor(lat) + 0.5, 1)
                lon_bin = round(math.floor(lon) + 0.5, 1)
                grid[(lat_bin, lon_bin, year_val)] += 1

    result = [
        {"lat": k[0], "lon": k[1], "year": k[2], "count": v}
        for k, v in grid.items()
    ]

    cache_set(str(species_key), result)
    return result

@app.get("/api/species/{species_key}/seasonal")
async def get_seasonal(species_key: int):
    cached = cache_get(str(species_key))
    if cached is not None:
        return cached

    # Build 5 year windows from 1990 to 2026
    windows = {}
    start = 1990
    while start <= 2026:
        end = min(start + 4, 2026)
        windows[f"{start}-{end}"] = (start, end)
        start += 5

    async def facet_window(client, lo, hi):
        r = await client.get(f"{GBIF_API}/occurrence/search", params={
            "speciesKey": species_key,
            "hasCoordinate": True,
            "year": f"{lo},{hi}",
            "facet": "month",
            "facetLimit": 12,
            "limit": 0,
        })
        months = [0] * 12
        data = r.json()
        for facet in data.get("facets", []):
            if facet.get("field") == "MONTH":
                for entry in facet.get("counts", []):
                    m = int(entry["name"])
                    months[m - 1] = entry["count"]
        return months

    async with httpx.AsyncClient(timeout=30) as client:
        results = await asyncio.gather(*[
            facet_window(client, lo, hi) for lo, hi in windows.values()
        ])

    seasonal_result = dict(zip(windows.keys(), results))
    
    cache_set(f"{species_key}_seasonal", seasonal_result)
    return seasonal_result

##Analysis section centroid implemented
@app.get("/api/species/{species_key}/analysis")
async def get_analysis(species_key: int):
    try:
        data = await get_occurrences(species_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not data:
        raise HTTPException(status_code=404, detail="No occurrence data found")

    # Group by year, so we can compute weighted centroid
    year_lats = defaultdict(list)
    year_lons = defaultdict(list)
    for cell in data:
        for _ in range(cell["count"]):
            year_lats[cell["year"]].append(cell["lat"])
            year_lons[cell["year"]].append(cell["lon"])

    # centroids = []
    # for year in sorted(year_lats.keys()):
    #     lats = year_lats[year]
    #     lons = year_lons[year]
    #     centroids.append({
    #         "year": year,
    #         "lat": sum(lats) / len(lats),
    #         "lon": sum(lons) / len(lons),
    #         "count": len(lats),
    #     })

    # median instead of mean
    centroids = []
    for year in sorted(year_lats.keys()):
        lats = year_lats[year]
        lons = year_lons[year]
        if not lats or not lons:  
            continue
        centroids.append({
            "year": year,
            "lat": statistics.median(lats),  
            "lon": statistics.median(lons),
            "count": len(lats),
        })

    if len(centroids) < 2:
        raise HTTPException(status_code=400, detail="Not enough years of data for trend analysis")

    # Linear regression on latitude over time
    xs = [c["year"] for c in centroids]
    ys = [c["lat"] for c in centroids]
    n = len(xs)
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    ss_xx = sum((x - mean_x) ** 2 for x in xs)
    ss_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    ss_yy = sum((y - mean_y) ** 2 for y in ys)
    slope = ss_xy / ss_xx if ss_xx else 0
    r_squared = (ss_xy ** 2 / (ss_xx * ss_yy)) if ss_xx and ss_yy else 0

    return {
        "centroids": centroids,
        "trend": {
            "slope_deg_per_year": round(slope, 5),
            "km_per_year": round(slope * 111.0, 2),
            "r_squared": round(r_squared, 4),
            "direction": "northward" if slope > 0 else "southward",
        }
    }

@app.get("/api/species/{species_key}/hotspots")
async def get_hotspots(species_key: int):
    data = await get_occurrences(species_key)

    early = defaultdict(int)   # 1990-2005
    recent = defaultdict(int)  # 2010-2026
    for cell in data:
        key = (cell["lat"], cell["lon"])
        if cell["year"] <= 2005:
            early[key] += cell["count"]
        elif cell["year"] >= 2010:
            recent[key] += cell["count"]

    early_total = sum(early.values())
    recent_total = sum(recent.values())
    if early_total == 0 or recent_total == 0:
        raise HTTPException(status_code=400,
            detail="Not enough data in one of the time periods")

    SCALE = 10000
    all_cells = set(early) | set(recent)
    hotspots = []
    for cell in all_cells:
        e_raw = early.get(cell, 0)
        r_raw = recent.get(cell, 0)

        if e_raw + r_raw < 15:
            continue

        e = e_raw / early_total * SCALE     
        r = r_raw / recent_total * SCALE    

        if r > e * 2 and r > 50:
            kind = "emerging"
        elif e > r * 2 and e > 50:
            kind = "declining"
        elif e > 50 and r > 50:
            kind = "persistent"
        else:
            continue

        hotspots.append({
            "lat": cell[0], "lon": cell[1],
            "type": kind,
            "early_count": e_raw,
            "recent_count": r_raw,
            "early_share": round(e, 1),
            "recent_share": round(r, 1),
        })

    summary = {
        "emerging": len([h for h in hotspots if h["type"] == "emerging"]),
        "declining": len([h for h in hotspots if h["type"] == "declining"]),
        "persistent": len([h for h in hotspots if h["type"] == "persistent"]),
    }
    return {"hotspots": hotspots, "summary": summary}