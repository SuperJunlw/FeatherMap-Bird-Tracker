import { useState, useMemo, useEffect } from "react"; 
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
  resetView: number;
  activeSpeciesKey: string | null;
  dataTrigger: number;
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
  emerging:   [16,  185, 129, 210],  // emerald (distinct from species green)
  persistent: [245, 158, 11,  210],  // amber
  declining:  [220, 38,  127, 210],  // rose/pink
};

export default function MapView({ sightings, analyses, hotspots, currentYear, mapMode, onToggleMode, selectedSpecies, resetView, activeSpeciesKey, dataTrigger }: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const [showCentroids, setShowCentroids] = useState(true);
  const [showHotspots, setShowHotspots] = useState(false);

  useEffect(() => {
    setShowHotspots(false);
  }, [resetView]);

  useEffect(() => {
    if (mapMode === "heatmap" || showHotspots) {
      setShowCentroids(false);
    }
  }, [mapMode, showHotspots]);

  const filteredSightings = useMemo(() => {
    let yearData = sightings.filter((s) => s.year === currentYear);
    if (yearData.length === 0) {
      // find the closest year with data
      const availableYears = [...new Set(sightings.map((s) => s.year))].sort((a, b) => Math.abs(a - currentYear) - Math.abs(b - currentYear));
      if (availableYears.length > 0) {
        yearData = sightings.filter((s) => s.year === availableYears[0]);
      }
    }
    return yearData;
  }, [sightings, currentYear, dataTrigger]);

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

  const scatterLayer = useMemo(() => new ScatterplotLayer<BirdSighting>({
    id: "scatter-layer",
    data: filteredSightings,
    getPosition: (d) => [d.longitude, d.latitude], // remove Math.random here
    getColor: (d) => [d.color[0], d.color[1], d.color[2], 180],
    getRadius: 8000,
    radiusMinPixels: 3,
    radiusMaxPixels: 10,
    pickable: true,
    visible: mapMode === "dot" && !showHotspots,
  }), [filteredSightings, mapMode, showHotspots]);

  const heatmapSightings = useMemo(() => {
    return filteredSightings.filter((s) => s.speciesKey === activeSpeciesKey);
  }, [filteredSightings, activeSpeciesKey]);

  const heatmapLayer = useMemo(() => new HeatmapLayer<BirdSighting>({
    id: "heatmap-layer",
    data: heatmapSightings,
    getPosition: (d) => [d.longitude, d.latitude],
    getWeight: 1,
    radiusPixels: 40,
    intensity: 1,
    threshold: 0.03,
    visible: mapMode === "heatmap" && !showHotspots,
  }), [heatmapSightings, mapMode, showHotspots]);

  const centroidTrailLayer = useMemo(() => new PathLayer({
    id: "centroid-trail",
    data: centroidPaths,
    getPath: (d) => d.path,
    getColor: (d) => [...d.color, 220] as [number, number, number, number],
    getWidth: 5,
    widthMinPixels: 2,
    visible: showCentroids && analyses.length > 0,
  }), [centroidPaths, showCentroids, analyses.length]);

  const centroidDotLayer = useMemo(() => new ScatterplotLayer({
    id: "centroid-dots",
    data: centroidDots,
    getPosition: (d: any) => [d.lon, d.lat],
    getColor: (d: any) => [...d.color, 255] as [number, number, number, number],
    getRadius: 60000,
    radiusMinPixels: 10,
    radiusMaxPixels: 20,
    stroked: true,
    getLineColor: [255, 255, 255, 255],
    lineWidthMinPixels: 3,
    visible: showCentroids && analyses.length > 0,
  }), [centroidDots, showCentroids, analyses.length]);

  const hotspotLayer = useMemo(() => new ScatterplotLayer<HotspotData>({
    id: "hotspot-layer",
    data: hotspots,
    getPosition: (d) => [d.lon, d.lat],
    getColor: (d) => HOTSPOT_COLORS[d.type] ?? [128, 128, 128, 180],
    getRadius: 50000,
    radiusMinPixels: 5,
    radiusMaxPixels: 20,
    pickable: true,
    visible: showHotspots,
  }), [hotspots, showHotspots]);

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
              selectedSpecies.length === 0
                ? "text-gray-300 cursor-not-allowed"
                : mapMode === "heatmap"
                ? "bg-green-500 text-white font-semibold"
                : "text-gray-500 hover:bg-gray-100"
            }`}
            onClick={() => selectedSpecies.length > 0 && onToggleMode()}
            title={selectedSpecies.length === 0 ? "Search for a species first" : ""}
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
            selectedSpecies.length === 0
              ? "text-gray-300 cursor-not-allowed bg-white border-gray-200"
              : showHotspots
              ? "bg-orange-500 text-white border-orange-500"
              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"
          }`}
          onClick={() => selectedSpecies.length > 0 && setShowHotspots((v) => !v)}
          title={selectedSpecies.length === 0 ? "Search for a species first" : ""}
        >
          Hotspots
        </button>

        {/* Note */}
        {selectedSpecies.length > 1 && (
          <p className="text-xs text-gray-500 max-w-32 leading-snug drop-shadow-sm">
            Heatmap & Hotspots show the side panel species only
          </p>
        )}
      </div>

      {/* Hotspot Legend */}
      {showHotspots && (
        <div className="absolute top-4 right-4 z-10 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-xs flex flex-col gap-1">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Emerging</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Persistent</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-pink-600" /> Declining</div>
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