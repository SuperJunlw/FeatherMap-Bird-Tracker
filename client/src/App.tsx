import { useState } from "react";
import MapView from "./components/MapView";
import SearchBar, { type Species } from "./components/SearchBar";

function App() {
  const [selectedSpecies, setSelectedSpecies] = useState<Species[]>([]);
  const [currentYear, setCurrentYear] = useState(1990);
  const [mapMode, setMapMode] = useState<"dot" | "heatmap">("dot");

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900">

      {/* Header */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
        <span className="text-green-500 font-bold text-lg tracking-wide shrink-0 w-32">
          FeatherMap
        </span>

        {/* Center Search Bar */}
        <div className="flex-1 flex justify-center">
          <div className="w-96">
            <SearchBar
              selectedSpecies={selectedSpecies}
              onAdd={(s) => setSelectedSpecies((prev) => [...prev, s])}
              onRemove={(s) => setSelectedSpecies((prev) => prev.filter((x) => x.key !== s.key))}
            />
          </div>
        </div>

        {/* Spacer to balance the logo */}
        <div className="w-32" />
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">

        {/* Map Area */}
        <div className="flex-1 relative bg-white">
          <MapView
            sightings={[]}
            currentYear={currentYear}
            mapMode={mapMode}
            onToggleMode={() => setMapMode((prev) => (prev === "dot" ? "heatmap" : "dot"))}
          />

          {/* Time Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white/80 to-transparent">
            {/* TimeControls will go here */}
          </div>
        </div>

        {/* Side Panel */}
        <aside className="w-80 bg-white border-l border-gray-200 overflow-y-auto shrink-0">
          {/* SidePanel will go here */}
        </aside>

      </main>
    </div>
  );
}

export default App;