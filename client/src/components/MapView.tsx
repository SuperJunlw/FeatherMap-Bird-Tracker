import { useState, useMemo, useEffect, useRef } from "react";
import { Map } from "react-map-gl";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { ViewStateChangeParameters } from "@deck.gl/core";
import * as d3 from "d3";
import "mapbox-gl/dist/mapbox-gl.css";
import type { SpeciesAnalysis, HotspotData } from "../App";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Types
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

const HOTSPOT_COLORS: Record<string, [number, number, number, number]> = {
  emerging:   [16,  185, 129, 210],
  persistent: [245, 158, 11,  210],
  declining:  [220, 38,  127, 210],
};

export default function MapView({
  sightings, analyses, hotspots, currentYear, mapMode, onToggleMode,
  selectedSpecies, resetView, activeSpeciesKey, dataTrigger
}: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW); // For map position and zoom
  const [showCentroids, setShowCentroids] = useState(true); // Toggle for centroid trails and points
  const [showHotspots, setShowHotspots] = useState(false);  // Toggle for hotspot points and heatmap
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // Track map load state to avoid rendering D3 elements too early
  const [mapLoaded, setMapLoaded] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null); // For D3 overlay
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null); // Map instance: from lat/lon to pixel projection
  
  // true when year/analyses change, false for pan/zoom and instant redraws
  const animateRef = useRef(false); 

  // Update container size on mount and when resized
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Reset hotspots when view resets
  useEffect(() => { setShowHotspots(false); }, [resetView]);

  // Disable centroids when in heatmap or hotspot mode
  useEffect(() => {
    if (mapMode === "heatmap" || showHotspots) setShowCentroids(false);
  }, [mapMode, showHotspots]);

  // Fall back to nearest available year if no sightings exist for the exact currentYear 
  const filteredSightings = useMemo(() => {
    let yearData = sightings.filter((s) => s.year === currentYear);
    if (yearData.length === 0) {
      const availableYears = [...new Set(sightings.map((s) => s.year))]
        .sort((a, b) => Math.abs(a - currentYear) - Math.abs(b - currentYear));
      if (availableYears.length > 0) {
        yearData = sightings.filter((s) => s.year === availableYears[0]);
      }
    }
    return yearData;
  }, [sightings, currentYear, dataTrigger]);

  // Trigger centroid animation on year or analyses change
  useEffect(() => {
    animateRef.current = true;
  }, [analyses, currentYear]);

  // Trigger animation when year or analyses change
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Instant redraw for pan/zoom, delayed 50ms for year changes to let mapbox finish updating
    const redraw = () => {
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      if (!showCentroids || analyses.length === 0 || !mapLoaded) return;

      const map = mapRef.current?.getMap();
      if (!map) return;

      const shouldAnimate = animateRef.current;
      animateRef.current = false;

      // Project lat/lon to screen coordinates
      const project = (lon: number, lat: number): [number, number] => {
        const point = map.project([lon, lat]);
        return [point.x, point.y];
      };

      const tooltip = svg.append("g")
        .attr("class", "centroid-tooltip")
        .style("opacity", 0)
        .style("pointer-events", "none");

      const tooltipBg = tooltip.append("rect")
        .attr("rx", 8).attr("ry", 8)
        .attr("fill", "white")
        .attr("stroke", "#e5e7eb")
        .attr("stroke-width", 1)
        .style("filter", "drop-shadow(0 2px 8px rgba(0,0,0,0.12))");

      const tooltipContent = tooltip.append("g").attr("transform", "translate(12, 12)");

      // Draw centroid trails and points
      analyses.forEach((a) => {
        const centroids = a.centroids.filter((c) => c.year <= currentYear);

        // Only animate if there are 2+ points to show the trail forming
        if (centroids.length >= 2) {
          const points = centroids.map((c) => project(c.lon, c.lat));

          const line = d3.line<[number, number]>()
            .x((d) => d[0])
            .y((d) => d[1])
            .curve(d3.curveCatmullRom.alpha(0.5));

          const path = svg.insert("path", ".centroid-tooltip")
            .datum(points)
            .attr("fill", "none")
            .attr("stroke", a.color)
            .attr("stroke-width", 3)
            .attr("stroke-opacity", 0.85)
            .attr("stroke-linecap", "round")
            .attr("stroke-linejoin", "round")
            .attr("d", line as any);

          const totalLength = (path.node() as SVGPathElement).getTotalLength();
          if (shouldAnimate) {
            path
              .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
              .attr("stroke-dashoffset", totalLength)
              .transition()
              .duration(900)
              .ease(d3.easeCubicInOut)
              .attr("stroke-dashoffset", 0);
          } else {
            path
              .attr("stroke-dasharray", null)
              .attr("stroke-dashoffset", null);
          }
        }

        const closest = centroids.at(-1);
        if (!closest) return;

        const [x, y] = project(closest.lon, closest.lat);
        const gridCells = filteredSightings.filter((s) => s.speciesKey === a.speciesKey).length;

        // Draw invisible larger circle for easier hover
        const g = svg.insert("g", ".centroid-tooltip")
          .attr("transform", `translate(${x},${y})`)
          .style("opacity", 0)
          .style("cursor", "pointer")
          .style("pointer-events", "all");

        g.append("circle")
          .attr("r", 14)
          .attr("fill", a.color)
          .attr("fill-opacity", 0.2)
          .attr("stroke", "none");

        g.append("circle")
          .attr("r", 10)
          .attr("fill", a.color)
          .attr("stroke", "white")
          .attr("stroke-width", 2.5);

        g.append("circle")
          .attr("r", 18)
          .attr("fill", "transparent")
          .attr("stroke", "none");

        // Hover interactions
        g.on("mouseenter", function(event) {
            d3.select(this).select("circle:nth-child(2)")
              .transition().duration(150).attr("r", 13);
            d3.select(this).select("circle:first-child")
              .transition().duration(150).attr("r", 18).attr("fill-opacity", 0.3);

            tooltipContent.selectAll("*").remove();

            const header = tooltipContent.append("g");
            header.append("circle")
              .attr("r", 4).attr("cx", 4).attr("cy", 4)
              .attr("fill", a.color);
            header.append("text")
              .attr("x", 14).attr("y", 8)
              .attr("font-size", "11px")
              .attr("font-weight", "600")
              .attr("fill", "#374151")
              .text(`Year ${closest.year}`);

            const lines = [
              `Lat: ${closest.lat.toFixed(2)}°`,
              `Lon: ${closest.lon.toFixed(2)}°`,
              `Grid cells: ${gridCells.toLocaleString()}`,
              `Raw records: ${closest.count.toLocaleString()}`,
            ];

            lines.forEach((text, i) => {
              tooltipContent.append("text")
                .attr("x", 0).attr("y", 26 + i * 17)
                .attr("font-size", "11px")
                .attr("fill", "#6b7280")
                .text(text);
            });

            const w = 170;
            const h = 26 + lines.length * 17 + 10;
            tooltipBg.attr("width", w + 24).attr("height", h + 16);

            const svgRect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
            tooltip.attr("transform", `translate(${event.clientX - svgRect.left + 14},${event.clientY - svgRect.top - 10})`);
            tooltip.transition().duration(150).style("opacity", 1);
          })
          .on("mousemove", function(event) {
            const svgRect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
            tooltip.attr("transform", `translate(${event.clientX - svgRect.left + 14},${event.clientY - svgRect.top - 10})`);
          })
          .on("mouseleave", function() {
            d3.select(this).select("circle:nth-child(2)")
              .transition().duration(150).attr("r", 10);
            d3.select(this).select("circle:first-child")
              .transition().duration(150).attr("r", 14).attr("fill-opacity", 0.2);
            tooltip.transition().duration(150).style("opacity", 0);
          });

        // Fade in the group after adding interactions to prevent flicker
        g.transition()
          .delay(shouldAnimate && centroids.length >= 2 ? 850 : 0)
          .duration(shouldAnimate ? 250 : 0)
          .ease(d3.easeBackOut.overshoot(1.5))
          .style("opacity", 1);
      }); 
    }; 

    // Outside redraw, decides whether to delay or not
    if (animateRef.current) {
      timer = setTimeout(redraw, 50);
    } else {
      redraw();
    }

    return () => { if (timer) clearTimeout(timer); };

  }, [analyses, currentYear, viewState, showCentroids, filteredSightings, containerSize, mapLoaded]);

  // deck.gl ScatterplotLayer, individual sighting dots colored per species
  const scatterLayer = useMemo(() => new ScatterplotLayer<BirdSighting>({
    id: "scatter-layer",
    data: filteredSightings,
    getPosition: (d) => [d.longitude, d.latitude],
    getColor: (d) => [d.color[0], d.color[1], d.color[2], 180],
    getRadius: 8000,
    radiusMinPixels: 3,
    radiusMaxPixels: 10,
    pickable: true,
    visible: mapMode === "dot" && !showHotspots,
  }), [filteredSightings, mapMode, showHotspots]);

  // deck.gl HeatmapLayer, density view for the active side panel species only
  const heatmapSightings = useMemo(() => {
    return filteredSightings.filter((s) => s.speciesKey === activeSpeciesKey);
  }, [filteredSightings, activeSpeciesKey]);

  // deck.gl HeatmapLayer, density view for the active side panel species only
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

  // deck.gl ScatterplotLayer for hotspots, colored by type and only shown when toggled on
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
    <div ref={containerRef} className="w-full h-full relative">
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller={true}
        layers={[scatterLayer, heatmapLayer, hotspotLayer]}
      >
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/light-v10"
          onLoad={() => setMapLoaded(true)}
        />
      </DeckGL>

      {/* D3 SVG overlay — trail, dots, tooltip */}
      <svg
        ref={svgRef}
        className="absolute inset-0"
        width={containerSize.width}
        height={containerSize.height}
        style={{ pointerEvents: "none" }} 
      />

      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
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

        {selectedSpecies.length > 0 && (
          <p className="text-xs text-gray-500 max-w-32 leading-snug drop-shadow-sm">
            Heatmap & Hotspots show the side panel species only
          </p>
        )}
      </div>

      {showHotspots && (
        <div className="absolute top-4 right-4 z-10 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-xs flex flex-col gap-1">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Emerging</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Persistent</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-pink-600" /> Declining</div>
        </div>
      )}

      <div
        className="absolute top-4 right-4 z-10 text-3xl font-bold text-green-500 opacity-80"
        style={{ display: showHotspots ? "none" : "block" }}
      >
        {currentYear}
      </div>

      <div className="absolute bottom-20 left-4 z-10 bg-white/90 border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-600 shadow-sm">
        {filteredSightings.length.toLocaleString()} sightings in {currentYear}
      </div>
    </div>
  );
}