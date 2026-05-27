import { useState, useMemo } from "react";
import { Map } from "react-map-gl";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { ViewStateChangeParameters } from "@deck.gl/core";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export interface BirdSighting {
  latitude: number;
  longitude: number;
  year: number;
  speciesKey: string;
  color: [number, number, number];
}

interface Props {
  sightings: BirdSighting[];
  currentYear: number;
  mapMode: "dot" | "heatmap";
  onToggleMode: () => void;
}

const INITIAL_VIEW = {
  longitude: -98,
  latitude: 40,
  zoom: 3,
  pitch: 0,
  bearing: 0,
};

export default function MapView({ sightings, currentYear, mapMode, onToggleMode }: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW);

  const filteredSightings = useMemo(
    () =>
      sightings.filter(
        (s) => s.year === currentYear
      ),
    [sightings, currentYear]
  );

  const scatterLayer = new ScatterplotLayer<BirdSighting>({
    id: "scatter-layer",
    data: filteredSightings,
    getPosition: (d) => [       
      d.longitude + (Math.random() - 0.5) * 0.4,
      d.latitude + (Math.random() - 0.5) * 0.4,
    ],
    getColor: (d) => [d.color[0], d.color[1], d.color[2], 180] as [number, number, number, number],
    getRadius: 8000,
    radiusMinPixels: 3,
    radiusMaxPixels: 10,
    pickable: true,
    visible: mapMode === "dot",
  });

  const heatmapLayer = new HeatmapLayer<BirdSighting>({
    id: "heatmap-layer",
    data: filteredSightings,
    getPosition: (d) => [d.longitude, d.latitude],
    getWeight: 1,
    radiusPixels: 40,
    intensity: 1,
    threshold: 0.03,
    visible: mapMode === "heatmap",
  });

  const handleViewStateChange = ({ viewState: vs }: ViewStateChangeParameters) => {
    setViewState(vs as typeof INITIAL_VIEW);
  };

  return (
    <div className="w-full h-full relative">

      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller={true}
        layers={[scatterLayer, heatmapLayer]}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/light-v10"
        />
      </DeckGL>

      {/* Map Mode Toggle */}
      <div className="absolute top-4 left-4 z-10 flex gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
        <button
          className={`text-xs px-3 py-1 rounded-md transition-all ${
            mapMode === "dot"
              ? "bg-green-500 text-white font-semibold"
              : "text-gray-500 hover:bg-gray-100"
          }`}
          onClick={() => mapMode !== "dot" && onToggleMode()}
        >
          Dot Map
        </button>
        <button
          className={`text-xs px-3 py-1 rounded-md transition-all ${
            mapMode === "heatmap"
              ? "bg-green-500 text-white font-semibold"
              : "text-gray-500 hover:bg-gray-100"
          }`}
          onClick={() => mapMode !== "heatmap" && onToggleMode()}
        >
          Heatmap
        </button>
      </div>

      {/* Year Badge */}
      <div className="absolute top-4 right-4 z-10 text-3xl font-bold text-green-500 opacity-80">
        {currentYear}
      </div>

      {/* Sighting Count */}
      <div className="absolute bottom-20 left-4 z-10 bg-white/90 border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-600 shadow-sm">
        {filteredSightings.length.toLocaleString()} sightings in {currentYear}
      </div>

    </div>
  );
}