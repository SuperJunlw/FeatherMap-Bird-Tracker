# FeatherMap: Bird Range Shift Tracker

FeatherMap is a visual analytics web app that lets users search for a bird species and explore how its geographic range has shifted from 1990 to present. Built for ECS 273 (Visual Analytics) at UC Davis. FeatherMap is an interactive web application for visualizing bird species range shifts across North America from 1990 to 2026. Users can search for up to five bird species simultaneously and watch their sighting data animate across a timeline, with occurrence records pulled live from the Global Biodiversity Information Facility (GBIF) API and aggregated into 1° grid cells for performance.

The map is built with deck.gl and Mapbox, supporting dot, heatmap, and hotspot visualization modes. A d3.js SVG overlay draws an animated centroid trail for each species, showing how the median center of a population has shifted over time. Hovering the centroid dot shows a tooltip with year, coordinates, and record counts.

The side panel shows per-species analysis including a species image, three d3.js line charts (observations per year, centroid latitude over time, and seasonal monthly patterns), and a hotspot summary classifying grid cells as emerging, persistent, or declining based on density changes between the early (before 2010) and recent (after 2010) periods.

The backend is a FastAPI server that proxies GBIF API calls and caches results in SQLite, so repeated searches are served instantly. The frontend is React + TypeScript with Vite, Tailwind CSS, deck.gl, and d3.js, which is used for the map overlay, all three side panel charts, and the custom timeline slider.

## Stack
- Backend: Python, FastAPI, SQLite
- Frontend: React, TypeScript, Deck.gl, Mapbox GL
- Data Source: [GBIF API](https://www.gbif.org/developer/summary) (Global Biodiversity Information Facility)

## Setup
Clone the project locally

Prerequisites:
- Python 3.10+
- Node.js 18+
- A Mapbox access token ([free signup](https://account.mapbox.com/access-tokens/))

## Backend
##To start Backend enter the following into a terminal 
```bash
cd server
pip install fastapi uvicorn httpx
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

## Frontend
##To start Frontend enter the following into a terminal 
```bash
cd client
echo "VITE_MAPBOX_TOKEN=your_token_here" > .env
npm install
npm run dev
```

The app runs at `http://localhost:5173`.
