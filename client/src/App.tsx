import { useState } from "react";
import MapView, { type BirdSighting } from "./components/MapView";
import SearchBar, { type Species } from "./components/SearchBar";
import { getOccurrences } from "./api";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function App() {
  const [selectedSpecies, setSelectedSpecies] = useState<Species[]>([]);
  const [sightings, setSightings] = useState<BirdSighting[]>([]);
  const [currentYear, setCurrentYear] = useState(1990);
  const [mapMode, setMapMode] = useState<"dot" | "heatmap">("dot");
  const [loading, setLoading] = useState(false);

  const handleAdd = async (s: Species) => {
    setSelectedSpecies((prev) => [...prev, s]);
    setLoading(true);
    try {
      const data = await getOccurrences(s.key);
      const newSightings: BirdSighting[] = data.map((d: any) => ({
        latitude: d.lat,
        longitude: d.lon,
        year: d.year,
        speciesKey: s.key,
        color: hexToRgb(s.color),
      }));
      setSightings((prev) => [...prev, ...newSightings]);
    } catch (err) {
      console.error("Failed to load occurrences:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (s: Species) => {
    setSelectedSpecies((prev) => prev.filter((x) => x.key !== s.key));
    setSightings((prev) => prev.filter((x) => x.speciesKey !== s.key));
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
        {/* Loading indicator */}
        <div className="w-32 flex justify-end">
          {loading && <span className="text-xs text-gray-400 animate-pulse">Loading...</span>}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative bg-white">
          <MapView
            sightings={sightings}
            currentYear={currentYear}
            mapMode={mapMode}
            onToggleMode={() => setMapMode((prev) => (prev === "dot" ? "heatmap" : "dot"))}
          />
        </div>
        <aside className="w-80 bg-white border-l border-gray-200 overflow-y-auto shrink-0">
          {/* SidePanel will go here */}
        </aside>
      </main>
    </div>
  );
}

export default App;