import { useState } from "react";
import MapView, { type BirdSighting } from "./components/MapView";
import SearchBar, { type Species } from "./components/SearchBar";
import SidePanel from "./components/SidePanel";
import TimeControls from "./components/TimeControls";
import { getOccurrences, getAnalysis, getHotspots } from "./api";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface SpeciesAnalysis {
  speciesKey: string;
  color: string;
  centroids: { year: number; lat: number; lon: number; count: number }[];
}

export interface HotspotData {
  lat: number;
  lon: number;
  type: "emerging" | "persistent" | "declining";
  early_count: number;
  recent_count: number;
}

function App() {
  const [selectedSpecies, setSelectedSpecies] = useState<Species[]>([]);
  const [sightings, setSightings] = useState<BirdSighting[]>([]);
  const [analyses, setAnalyses] = useState<SpeciesAnalysis[]>([]);
  const [hotspots, setHotspots] = useState<HotspotData[]>([]);
  const [currentYear, setCurrentYear] = useState(1990);
  const [mapMode, setMapMode] = useState<"dot" | "heatmap">("dot");
  const [loading, setLoading] = useState(false);

  const handleAdd = async (s: Species) => {
    setSelectedSpecies((prev) => [...prev, s]);

     // Switch back to dot mode if adding a second species
    if (selectedSpecies.length >= 1) {
      setMapMode("dot");
    }

    setLoading(true);
    try {
      const [occData, analysisData, hotspotData] = await Promise.all([
        getOccurrences(s.key),
        getAnalysis(s.key),
        getHotspots(s.key),
      ]);

      const newSightings: BirdSighting[] = occData.map((d: any) => ({
        latitude: d.lat,
        longitude: d.lon,
        year: d.year,
        speciesKey: s.key,
        color: hexToRgb(s.color),
      }));
      setSightings((prev) => [...prev, ...newSightings]);

      setAnalyses((prev) => [
        ...prev,
        { speciesKey: s.key, color: s.color, centroids: analysisData.centroids },
      ]);

      setHotspots((prev) => [
        ...prev,
        ...hotspotData.hotspots,
      ]);
    } catch (err) {
      console.error("Failed to load species data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (s: Species) => {
    setSelectedSpecies((prev) => prev.filter((x) => x.key !== s.key));
    setSightings((prev) => prev.filter((x) => x.speciesKey !== s.key));
    setAnalyses((prev) => prev.filter((x) => x.speciesKey !== s.key));
    setHotspots([]);
  };

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
          {loading && <span className="text-xs text-gray-400 animate-pulse">Loading...</span>}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative bg-white">
          <MapView
            sightings={sightings}
            analyses={analyses}
            hotspots={hotspots}
            currentYear={currentYear}
            mapMode={mapMode}
            onToggleMode={() => setMapMode((prev) => (prev === "dot" ? "heatmap" : "dot"))}
            selectedSpecies={selectedSpecies}
          />

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600 font-medium">Loading species data...</p>
              <p className="text-xs text-gray-400">This may take a few seconds on first load</p>
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
          />
        </aside>
      </main>
    </div>
  );
}

export default App;