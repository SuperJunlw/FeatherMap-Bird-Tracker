import { useState, useMemo } from "react";
import { Map } from "react-map-gl";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer, PathLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { ViewStateChangeParameters } from "@deck.gl/core";
import "mapbox-gl/dist/mapbox-gl.css";
import type { SpeciesAnalysis, HotspotData } from "../App";

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
  analyses: SpeciesAnalysis[];
  hotspots: HotspotData[];
  currentYear: number;
  mapMode: "dot" | "heatmap";
  onToggleMode: () => void;
  selectedSpecies: { key: string }[];
}

const INITIAL_VIEW = {
  longitude: -98,
  latitude: 40,
  zoom: 3,
  pitch: 0,
  bearing: 0,
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const HOTSPOT_COLORS: Record<string, [number, number, number, number]> = {
  emerging:   [34,  197, 94,  200],
  persistent: [59,  130, 246, 200],
  declining:  [239, 68,  68,  200],
};

export default function MapView({ sightings, analyses, hotspots, currentYear, mapMode, onToggleMode, selectedSpecies }: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const [showCentroids, setShowCentroids] = useState(true);
  const [showHotspots, setShowHotspots] = useState(false);

  const filteredSightings = useMemo(() => {
    let yearData = sightings.filter((s) => s.year === currentYear);
    if (yearData.length === 0) {
      for (let offset = 1; offset <= 2; offset++) {
        yearData = sightings.filter((s) => s.year === currentYear - offset);
        if (yearData.length > 0) break;
      }
    }
    return yearData;
  }, [sightings, currentYear]);

  // Build centroid trail paths up to currentYear
  const centroidPaths = useMemo(() =>
    analyses.map((a) => ({
      path: a.centroids
        .filter((c) => c.year <= currentYear)
        .map((c) => [c.lon, c.lat] as [number, number]),
      color: hexToRgb(a.color),
    })).filter((p) => p.path.length >= 2),
  [analyses, currentYear]);

  // Current centroid dots
  const centroidDots = useMemo(() =>
    analyses.map((a) => {
      const closest = [...a.centroids]
        .filter((c) => c.year <= currentYear)
        .at(-1);
      return closest ? { lon: closest.lon, lat: closest.lat, color: hexToRgb(a.color) } : null;
    }).filter(Boolean),
  [analyses, currentYear]);

  const scatterLayer = new ScatterplotLayer<BirdSighting>({
    id: "scatter-layer",
    data: filteredSightings,
    getPosition: (d) => [
      d.longitude + (Math.random() - 0.5) * 0.3,
      d.latitude + (Math.random() - 0.5) * 0.3,
    ],
    getColor: (d) => [d.color[0], d.color[1], d.color[2], 180],
    getRadius: 8000,
    radiusMinPixels: 3,
    radiusMaxPixels: 10,
    pickable: true,
    visible: mapMode === "dot" && !showHotspots,
  });

  const heatmapLayer = new HeatmapLayer<BirdSighting>({
    id: "heatmap-layer",
    data: filteredSightings,
    getPosition: (d) => [d.longitude, d.latitude],
    getWeight: 1,
    radiusPixels: 40,
    intensity: 1,
    threshold: 0.03,
    visible: mapMode === "heatmap" && !showHotspots,
  });

  // Centroid trail lines
  const centroidTrailLayer = new PathLayer({
    id: "centroid-trail",
    data: centroidPaths,
    getPath: (d) => d.path,
    getColor: (d) => [...d.color, 220] as [number, number, number, number],
    getWidth: 3,
    widthMinPixels: 2,
    visible: showCentroids && analyses.length > 0,
  });

  // Centroid current position dots
  const centroidDotLayer = new ScatterplotLayer({
    id: "centroid-dots",
    data: centroidDots,
    getPosition: (d: any) => [d.lon, d.lat],
    getColor: (d: any) => [...d.color, 255] as [number, number, number, number],
    getRadius: 30000,
    radiusMinPixels: 6,
    radiusMaxPixels: 12,
    stroked: true,
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 2,
    visible: showCentroids && analyses.length > 0,
  });

  // Hotspot layer
  const hotspotLayer = new ScatterplotLayer<HotspotData>({
    id: "hotspot-layer",
    data: hotspots,
    getPosition: (d) => [d.lon, d.lat],
    getColor: (d) => HOTSPOT_COLORS[d.type] ?? [128, 128, 128, 180],
    getRadius: 50000,
    radiusMinPixels: 5,
    radiusMaxPixels: 20,
    pickable: true,
    visible: showHotspots,
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
        layers={[scatterLayer, heatmapLayer, hotspotLayer, centroidTrailLayer, centroidDotLayer]}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/light-v10"
        />
      </DeckGL>

      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Dot/Heatmap toggle */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          <button
            className={`text-xs px-3 py-1 rounded-md transition-all ${
              mapMode === "dot" ? "bg-green-500 text-white font-semibold" : "text-gray-500 hover:bg-gray-100"
            }`}
            onClick={() => mapMode !== "dot" && onToggleMode()}
          >
            Dot Map
          </button>
          <button
            className={`text-xs px-3 py-1 rounded-md transition-all ${
              mapMode === "heatmap" && selectedSpecies.length === 1
                ? "bg-green-500 text-white font-semibold"
                : selectedSpecies.length > 1
                ? "text-gray-300 cursor-not-allowed"
                : "text-gray-500 hover:bg-gray-100"
            }`}
            onClick={() => mapMode !== "heatmap" && selectedSpecies.length === 1 && onToggleMode()}
            title={selectedSpecies.length > 1 ? "Heatmap only available for single species" : ""}
          >
            Heatmap
        </button>
        </div>

        {/* Centroid trail toggle */}
        <button
          className={`text-xs px-3 py-1 rounded-lg border shadow-sm transition-all ${
            showCentroids
              ? "bg-purple-500 text-white border-purple-500"
              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"
          }`}
          onClick={() => setShowCentroids((v) => !v)}
        >
          Centroid Trail
        </button>

        {/* Hotspot toggle */}
        <button
          className={`text-xs px-3 py-1 rounded-lg border shadow-sm transition-all ${
            showHotspots
              ? "bg-orange-500 text-white border-orange-500"
              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"
          }`}
          onClick={() => setShowHotspots((v) => !v)}
        >
          Hotspots
        </button>
      </div>

      {/* Hotspot Legend */}
      {showHotspots && (
        <div className="absolute top-4 right-4 z-10 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-xs flex flex-col gap-1">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Emerging</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Persistent</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Declining</div>
        </div>
      )}

      {/* Year Badge */}
      <div className="absolute top-4 right-4 z-10 text-3xl font-bold text-green-500 opacity-80"
        style={{ display: showHotspots ? "none" : "block" }}>
        {currentYear}
      </div>

      {/* Sighting Count */}
      <div className="absolute bottom-20 left-4 z-10 bg-white/90 border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-600 shadow-sm">
        {filteredSightings.length.toLocaleString()} sightings in {currentYear}
      </div>
    </div>
  );
}