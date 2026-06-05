# FeatherMap: Bird Range Shift Tracker

FeatherMap is a visual analytics web app that lets users search for a bird species and explore how its geographic range has shifted from 1990 to present. Built for ECS 273 (Visual Analytics) at UC Davis.

## Stack
- Backend: Python, FastAPI, SQLite
- Frontend: React, TypeScript, Deck.gl, Mapbox GL
- Data Source: [GBIF API](https://www.gbif.org/developer/summary) (Global Biodiversity Information Facility)

## Setup
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