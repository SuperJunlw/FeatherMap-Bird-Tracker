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
            "hasCoordinate": False,
            "mediaType": "StillImage",
            "limit": 10,
        })
    data = r.json()
    for rec in data.get("results", []):
        for media in rec.get("media", []):
            if media.get("type") == "StillImage" and media.get("identifier"):
                return {
                    "image_url": media["identifier"],
                    "license": media.get("license", ""),
                    "publisher": rec.get("institutionCode", ""),
                }
    raise HTTPException(status_code=404, detail="No image found for this species")

##Gathers and aggregates data of the species attached input species key
@app.get("/api/species/{species_key}/occurrences")
async def get_occurrences(species_key: int):
    cache_file = CACHE_DIR / f"{species_key}.json"
    
    # Return cached result if it exists
    if cache_file.exists():
        return json.loads(cache_file.read_text())

    grid = defaultdict(int)
    years = list(range(1990, 2027, 2))
    per_year_limit = 3000
    page_size = 300

    async def fetch_year(client, year):
        records = []
        offset = 0
        while offset < per_year_limit:
            r = await client.get(f"{GBIF_API}/occurrence/search", params={
                "speciesKey": species_key,
                "hasCoordinate": True,
                "hasGeospatialIssue": False,
                "year": year,
                "limit": page_size,
                "offset": offset,
            })
            data = r.json()
            if not isinstance(data, dict):
                break
            batch = data.get("results", [])
            records.extend(batch)
            if data.get("endOfRecords", True):
                break
            offset += page_size
        return records

    async with httpx.AsyncClient(timeout=60) as client:
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

    # Save to cache
    cache_file.write_text(json.dumps(result))
    return result

##Analysis section centroid implemented
@app.get("/api/species/{species_key}/analysis")
async def get_analysis(species_key: int):
    data = await get_occurrences(species_key)

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
    
    # Group counts by grid cell across early vs recent years
    early = defaultdict(int)   # 1990-2005
    recent = defaultdict(int)  # 2010-2026
    
    for cell in data:
        key = (cell["lat"], cell["lon"])
        if cell["year"] <= 2005:
            early[key] += cell["count"]
        elif cell["year"] >= 2010:
            recent[key] += cell["count"]
    
    all_cells = set(early.keys()) | set(recent.keys())
    hotspots = []
    
    for cell in all_cells:
        e = early.get(cell, 0)
        r = recent.get(cell, 0)
        
        if r > e * 2 and r > 10:
            kind = "emerging"
        elif e > r * 2 and e > 10:
            kind = "declining"
        elif e > 10 and r > 10:
            kind = "persistent"
        else:
            continue
            
        hotspots.append({
            "lat": cell[0], "lon": cell[1],
            "type": kind,
            "early_count": e,
            "recent_count": r
        })
    
    summary = {
        "emerging": len([h for h in hotspots if h["type"] == "emerging"]),
        "declining": len([h for h in hotspots if h["type"] == "declining"]),
        "persistent": len([h for h in hotspots if h["type"] == "persistent"]),
    }
    
    return {"hotspots": hotspots, "summary": summary}