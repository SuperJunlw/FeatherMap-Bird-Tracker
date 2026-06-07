import { useState } from "react";
import MapView, { type BirdSighting } from "./components/MapView";
import SearchBar, { type Species } from "./components/SearchBar";
import SidePanel from "./components/SidePanel";
import TimeControls from "./components/TimeControls";
import { getOccurrences, getAnalysis, getHotspots } from "./api";

// Helper to convert hex color string to RGB tuple
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Types for analysis and hotspot data returned by API
export interface SpeciesAnalysis {
  speciesKey: string;
  color: string;
  centroids: { year: number; lat: number; lon: number; count: number }[];
}

// Type for hotspot data returned by API
export interface HotspotData {
  lat: number;
  lon: number;
  type: "emerging" | "persistent" | "declining";
  early_count: number;
  recent_count: number;
  speciesKey: string;
}

function App() {
  const [selectedSpecies, setSelectedSpecies] = useState<Species[]>([]); // list of currently selected species
  const [sightings, setSightings] = useState<BirdSighting[]>([]); // list of all bird sightings
  const [analyses, setAnalyses] = useState<SpeciesAnalysis[]>([]); // list of analysis data for each species
  const [hotspots, setHotspots] = useState<HotspotData[]>([]); // list of hotspot data for each species
  const [activeSpeciesKey, setActiveSpeciesKey] = useState<string | null>(null); // which species is currently selected in side panel for showing hotspots
  const [currentYear, setCurrentYear] = useState(1990); // current year for time slider, default to 1990
  const [mapMode, setMapMode] = useState<"dot" | "heatmap">("dot"); // whether map is in dot mode or heatmap mode
  const [loading, setLoading] = useState(false); // whether we are currently loading data for a newly added species
  const [resetView, setResetView] = useState(0); // counter to trigger map view reset when changing from 0 to 1 on first species add
  const [dataTrigger, setDataTrigger] = useState(0); // counter to trigger map data update when new data is loaded for a species
  const [readyKeys, setReadyKeys] = useState<Set<string>>(new Set()); // set of species keys that are ready to be displayed on the map
  

  // Handler for when a species is added from the search bar
  const handleAdd = async (s: Species) => {
    setSelectedSpecies((prev) => [...prev, s]);
    if (selectedSpecies.length >= 1) {
      setMapMode("dot");
      setResetView((v) => v + 1);
    }
    setLoading(true);
    try {
      // Fetch all data for the new species in parallel
      const [occData, analysisData, hotspotData] = await Promise.all([
        getOccurrences(s.key).catch(() => []),
        getAnalysis(s.key).catch(() => ({ centroids: [], trend: {} })),
        getHotspots(s.key).catch(() => ({ hotspots: [] })),
      ]);

      // Transform occurrence data into BirdSighting format and add to sightings state
      const newSightings: BirdSighting[] = occData.map((d: any) => ({
        latitude: d.lat,
        longitude: d.lon,
        year: d.year,
        speciesKey: s.key,
        color: hexToRgb(s.color),
      }));
      setSightings((prev) => [...prev, ...newSightings]);

      if (analysisData?.centroids) {
        setAnalyses((prev) => [
          ...prev,
          { speciesKey: s.key, color: s.color, centroids: analysisData.centroids },
        ]);
      }

      setHotspots((prev) => [
        ...prev,
        ...hotspotData.hotspots.map((h: any) => ({ ...h, speciesKey: s.key })),
      ]);

      setDataTrigger((v) => v + 1);
      setReadyKeys((prev) => new Set([...prev, s.key]));
    } catch (err) {
      console.error("Failed to load species data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Handler for when a species is removed from the search bar
  const handleRemove = (s: Species) => {
    setSelectedSpecies((prev) => prev.filter((x) => x.key !== s.key));
    setSightings((prev) => prev.filter((x) => x.speciesKey !== s.key));
    setAnalyses((prev) => prev.filter((x) => x.speciesKey !== s.key));
    setHotspots((prev) => prev.filter((x) => x.speciesKey !== s.key));

    setReadyKeys((prev) => {
      const next = new Set(prev);
      next.delete(s.key);
      return next;
    });
  };

  // Filter hotspots to only show active species
  const activeHotspots = hotspots.filter((h) => h.speciesKey === activeSpeciesKey);

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900">
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
        <span className="text-green-500 font-bold text-lg tracking-wide shrink-0 w-32">
          FeatherMap
        </span>
        <div className="flex-1 flex justify-center">
          <div className="w-96">
            <SearchBar
              selectedSpecies={selectedSpecies}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          </div>
        </div>
        <div className="w-32 flex justify-end">
          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-ping" />
              <span className="text-xs text-gray-400">Fetching data...</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative bg-white">
          <MapView
            sightings={sightings}
            analyses={analyses}
            hotspots={activeHotspots}
            currentYear={currentYear}
            mapMode={mapMode}
            onToggleMode={() => setMapMode((prev) => (prev === "dot" ? "heatmap" : "dot"))}
            selectedSpecies={selectedSpecies}
            resetView={resetView}
            activeSpeciesKey={activeSpeciesKey}
            dataTrigger={dataTrigger}
          />

          {loading && (
            <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600 font-medium">Loading species data...</p>
              <p className="text-xs text-gray-400">This may take a while on first load</p>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white/80 to-transparent">
            <TimeControls
              currentYear={currentYear}
              onYearChange={setCurrentYear}
            />
          </div>
        </div>

        <aside className="w-80 bg-white border-l border-gray-200 overflow-y-auto shrink-0">
          <SidePanel
            selectedSpecies={selectedSpecies}
            sightings={sightings}
            onActiveKeyChange={setActiveSpeciesKey}
            readyKeys={readyKeys}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;