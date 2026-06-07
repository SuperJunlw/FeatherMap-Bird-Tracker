import { useEffect, useState, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Species } from "./SearchBar";
import type { BirdSighting } from "./MapView";
import { getAnalysis, getHotspots, getSeasonal } from "../api";
import * as d3 from "d3";

const BASE = "http://localhost:8000";

// Helper function to reverse geocode lat/lon to a human-readable location using Nominatim API
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const addr = data.address;

    const city = addr?.city ?? addr?.town ?? addr?.village ?? addr?.hamlet ?? addr?.municipality;
    const subregion = addr?.county ?? addr?.state_district;
    const state = addr?.state ?? addr?.region;
    const country = addr?.country;

    // Build from most to least specific, but always include country
    if (city && state) return `${city}, ${state}, ${country}`;
    if (city) return `${city}, ${country}`;
    if (subregion) return `${subregion}, ${country}`;
    if (state) return `${state}, ${country}`;
    return country ?? `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
  } catch {
    return `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
  }
}

interface Props {
  selectedSpecies: Species[];
  sightings: BirdSighting[];
  onActiveKeyChange: (key: string | null) => void;
  readyKeys: Set<string>;
}

interface SpeciesImage {
  image_url: string;
  publisher: string;
}

export default function SidePanel({ selectedSpecies, sightings, onActiveKeyChange, readyKeys }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null); // currently selected species key for showing details in the panel
  const [image, setImage] = useState<SpeciesImage | null>(null); // image data for the active species, fetched from the backend
  const [imageLoading, setImageLoading] = useState(false); // loading state for the species image to show a spinner while fetching
  const [analysis, setAnalysis] = useState<any>(null); // analysis data 
  const [hotspots, setHotspots] = useState<any>(null); // hotspot data 
  const [analysisLoading, setAnalysisLoading] = useState(false); // loading state for the analysis data to show a spinner while fetching
  const [showObservations, setShowObservations] = useState(false); // toggle for showing the observations over time chart
  const [showCentroid, setShowCentroid] = useState(false); // toggle for showing the centroid movement over time chart
  const [showHotspotSummary, setShowHotspotSummary] = useState(false); // toggle for showing the hotspot summary section
  const [locationLabels, setLocationLabels] = useState<Record<string, string>>({}); // cache for reverse geocoded location labels keyed by "lat,lon"
  const [seasonal, setSeasonal] = useState<any>(null); // seasonal pattern data 
  const [showSeasonal, setShowSeasonal] = useState(false); // toggle for showing the seasonal pattern chart
  const [windowA, setWindowA] = useState<string | null>(null); 
  const [windowB, setWindowB] = useState<string | null>(null);
  const observationsChartRef = useRef<SVGSVGElement>(null); // ref for the D3 observations chart SVG element
  const centroidChartRef = useRef<SVGSVGElement>(null); // ref for the D3 centroid chart SVG element
  const seasonalChartRef = useRef<SVGSVGElement>(null); // ref for the D3 seasonal pattern chart SVG element

  const activeSpecies = selectedSpecies.find((s) => s.key === activeKey);

  // Prepare data for the observations over time chart by counting sightings per year
  const chartData = (() => {
    if (!activeKey) return [];
    const yearCounts: Record<number, number> = {};
    sightings
      .filter((s) => s.speciesKey === activeKey)
      .forEach((s) => {
        yearCounts[s.year] = (yearCounts[s.year] || 0) + 1;
      });
    return Object.entries(yearCounts)
      .map(([year, count]) => ({ year: Number(year), count }))
      .sort((a, b) => a.year - b.year);
  })();

  // Prepare data for the heatmap layer 
  useEffect(() => {
    if (selectedSpecies.length > 0) {
      setActiveKey(selectedSpecies[0].key);
    } else {
      setActiveKey(null);
      setImage(null);
    }
  }, [selectedSpecies]);

  // Active key change
  useEffect(() => {
    onActiveKeyChange(activeKey);
  }, [activeKey]);

  // Fetch species image when activeKey changes and is in readyKeys
  useEffect(() => {
    if (!activeKey || !readyKeys.has(activeKey)) return;
    setImageLoading(true);
    setImage(null);
    fetch(`${BASE}/api/species/${activeKey}/image`)
      .then((r) => r.json())
      .then((data) => setImage(data))
      .catch(() => setImage(null))
      .finally(() => setImageLoading(false));
  }, [activeKey, readyKeys]);

  // Fetch analysis data when activeKey changes and is in readyKeys
  useEffect(() => {
    if (!activeKey || !readyKeys.has(activeKey)) return;
    setAnalysisLoading(true);
    setAnalysis(null);
    setHotspots(null);
    setSeasonal(null);
    setWindowA(null);
    setWindowB(null);
    Promise.all([getAnalysis(activeKey), getHotspots(activeKey), getSeasonal(activeKey)])
      .then(([analysisData, hotspotsData, seasonalData]) => {
        setAnalysis(analysisData);
        setHotspots(hotspotsData);
        setSeasonal(seasonalData)
      })
      .catch(console.error)
      .finally(() => setAnalysisLoading(false));
  }, [activeKey, readyKeys]);

  // Reverse geocode hotspot locations when hotspots data is loaded
  useEffect(() => {
    if (!hotspots?.hotspots) return;
    const top5 = [...hotspots.hotspots]
      .sort((a: any, b: any) => b.recent_count - a.recent_count)
      .slice(0, 5);

    top5.forEach(async (h: any) => {
      const key = `${h.lat},${h.lon}`;
      if (locationLabels[key]) return; // already cached
      const label = await reverseGeocode(h.lat, h.lon);
      setLocationLabels((prev) => ({ ...prev, [key]: label }));
    });
  }, [hotspots]);

  // D3 observations chart setup
  useEffect(() => {
    if (!observationsChartRef.current || chartData.length === 0) return;

    const svg = d3.select(observationsChartRef.current);
    svg.selectAll("*").remove();

    const width = observationsChartRef.current.clientWidth || 280;
    const height = 140;
    const margin = { top: 8, right: 8, bottom: 24, left: 36 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain(d3.extent(chartData, d => d.year) as [number, number])
      .range([0, innerW]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(chartData, d => d.count) as number])
      .nice()
      .range([innerH, 0]);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll("text").attr("font-size", "10px").attr("fill", "#9ca3af"));

    g.append("g")
      .call(d3.axisLeft(y).ticks(4))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll("text").attr("font-size", "10px").attr("fill", "#9ca3af"));

    // Line
    const line = d3.line<{year: number; count: number}>()
      .x(d => x(d.year))
      .y(d => y(d.count))
      .curve(d3.curveCatmullRom);

    g.append("path")
      .datum(chartData)
      .attr("fill", "none")
      .attr("stroke", activeSpecies?.color ?? "#22c55e")
      .attr("stroke-width", 2)
      .attr("d", line);

    // Tooltip line and dot
    const focus = g.append("g").style("display", "none");
    focus.append("line")
      .attr("stroke", "#e5e7eb")
      .attr("stroke-width", 1)
      .attr("y1", 0).attr("y2", innerH);
    focus.append("circle")
      .attr("r", 4)
      .attr("fill", activeSpecies?.color ?? "#22c55e")
      .attr("stroke", "white")
      .attr("stroke-width", 2);

    const tooltipEl = g.append("g").style("display", "none");
    const tooltipRect = tooltipEl.append("rect")
      .attr("rx", 4).attr("ry", 4)
      .attr("fill", "white")
      .attr("stroke", "#e5e7eb")
      .style("filter", "drop-shadow(0 1px 4px rgba(0,0,0,0.1))");
    const tooltipText = tooltipEl.append("text")
      .attr("font-size", "11px")
      .attr("fill", "#374151");

    g.append("rect")
      .attr("width", innerW).attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", function(event) {
        const [mx] = d3.pointer(event);
        const year = Math.round(x.invert(mx));
        const d = chartData.find(d => d.year === year) ?? chartData.reduce((a, b) =>
          Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a);
        focus.style("display", null);
        focus.select("line").attr("x1", x(d.year)).attr("x2", x(d.year));
        focus.select("circle").attr("cx", x(d.year)).attr("cy", y(d.count));

        tooltipEl.style("display", null);
        tooltipText.text(`${d.year}: ${d.count} sightings`);
        const bbox = (tooltipText.node() as SVGTextElement).getBBox();
        tooltipRect.attr("x", bbox.x - 6).attr("y", bbox.y - 4)
          .attr("width", bbox.width + 12).attr("height", bbox.height + 8);
        const tx = Math.min(x(d.year) + 8, innerW - bbox.width - 16);
        const ty = Math.max(y(d.count) - 28, 0);
        tooltipEl.attr("transform", `translate(${tx},${ty})`);
      })
      .on("mouseleave", () => {
        focus.style("display", "none");
        tooltipEl.style("display", "none");
      });

  }, [chartData, activeSpecies?.color, showObservations]);

  // D3 centroid chart setup
  useEffect(() => {
    if (!centroidChartRef.current || !analysis?.centroids?.length) return;

    const svg = d3.select(centroidChartRef.current);
    svg.selectAll("*").remove();

    const data = analysis.centroids;
    const width = centroidChartRef.current.clientWidth || 280;
    const height = 140;
    const margin = { top: 8, right: 8, bottom: 24, left: 36 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleLinear()
      .domain(d3.extent(data, (d: any) => d.year) as [number, number])
      .range([0, innerW]);

    const y = d3.scaleLinear()
      .domain(d3.extent(data, (d: any) => d.lat) as [number, number])
      .nice()
      .range([innerH, 0]);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll("text").attr("font-size", "10px").attr("fill", "#9ca3af"));

    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}°`))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll("text").attr("font-size", "10px").attr("fill", "#9ca3af"));

    // Line
    const line = d3.line<any>()
      .x(d => x(d.year))
      .y(d => y(d.lat))
      .curve(d3.curveCatmullRom);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", activeSpecies?.color ?? "#22c55e")
      .attr("stroke-width", 2)
      .attr("d", line);

    // Centroid points
    const focus = g.append("g").style("display", "none");
    focus.append("line")
      .attr("stroke", "#e5e7eb").attr("stroke-width", 1)
      .attr("y1", 0).attr("y2", innerH);
    focus.append("circle")
      .attr("r", 4)
      .attr("fill", activeSpecies?.color ?? "#22c55e")
      .attr("stroke", "white").attr("stroke-width", 2);

    // Tooltip setup
    const tooltipEl = g.append("g").style("display", "none");
    const tooltipRect = tooltipEl.append("rect")
      .attr("rx", 4).attr("ry", 4)
      .attr("fill", "white").attr("stroke", "#e5e7eb")
      .style("filter", "drop-shadow(0 1px 4px rgba(0,0,0,0.1))");
    const tooltipText = tooltipEl.append("text")
      .attr("font-size", "11px").attr("fill", "#374151");

    g.append("rect")
      .attr("width", innerW).attr("height", innerH)
      .attr("fill", "transparent")
      .on("mousemove", function(event) {
        const [mx] = d3.pointer(event);
        const year = Math.round(x.invert(mx));
        const d = data.reduce((a: any, b: any) =>
          Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a);
        focus.style("display", null);
        focus.select("line").attr("x1", x(d.year)).attr("x2", x(d.year));
        focus.select("circle").attr("cx", x(d.year)).attr("cy", y(d.lat));

        tooltipEl.style("display", null);
        tooltipText.text(`${d.year}: ${Number(d.lat).toFixed(2)}°`);
        const bbox = (tooltipText.node() as SVGTextElement).getBBox();
        tooltipRect.attr("x", bbox.x - 6).attr("y", bbox.y - 4)
          .attr("width", bbox.width + 12).attr("height", bbox.height + 8);
        const tx = Math.min(x(d.year) + 8, innerW - bbox.width - 16);
        const ty = Math.max(y(d.lat) - 28, 0);
        tooltipEl.attr("transform", `translate(${tx},${ty})`);
      })
      .on("mouseleave", () => {
        focus.style("display", "none");
        tooltipEl.style("display", "none");
      });

  }, [analysis, activeSpecies?.color, showCentroid]);

  // D3 seasonal pattern chart setup
  useEffect(() => {
    if (!seasonalChartRef.current || !seasonal) return;

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const windows = Object.keys(seasonal).filter(w => w !== "2025-2026");
    const a = windowA ?? windows[0];
    const b = windowB ?? windows[windows.length - 1];
    const dataA = (seasonal[a] as number[]).map((v, i) => ({ month: MONTHS[i], value: v }));
    const dataB = (seasonal[b] as number[]).map((v, i) => ({ month: MONTHS[i], value: v }));

    const svg = d3.select(seasonalChartRef.current);
    svg.selectAll("*").remove();

    const width = seasonalChartRef.current.clientWidth || 280;
    const height = 140;
    const margin = { top: 8, right: 8, bottom: 24, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scalePoint()
      .domain(MONTHS)
      .range([0, innerW]);

    const maxVal = d3.max([...dataA, ...dataB], d => d.value) as number;
    const y = d3.scaleLinear().domain([0, maxVal]).nice().range([innerH, 0]);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues(["Jan","Mar","May","Jul","Sep","Nov"]))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll("text").attr("font-size", "9px").attr("fill", "#9ca3af"));

    g.append("g")
      .call(d3.axisLeft(y).ticks(4))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").remove())
      .call(g => g.selectAll("text").attr("font-size", "10px").attr("fill", "#9ca3af"));

    // Lines
    const line = d3.line<{month: string; value: number}>()
      .x(d => x(d.month) as number)
      .y(d => y(d.value))
      .curve(d3.curveCatmullRom);

    const drawLine = (data: {month: string; value: number}[], color: string) => {
      const path = g.append("path").datum(data)
        .attr("fill", "none").attr("stroke", color)
        .attr("stroke-width", 2).attr("d", line);
      const len = (path.node() as SVGPathElement).getTotalLength();
      path
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", len)
        .transition().duration(700).ease(d3.easeCubicInOut)
        .attr("stroke-dashoffset", 0);
    };

    drawLine(dataA, "#94a3b8");
    drawLine(dataB, activeSpecies?.color ?? "#22c55e");

    // Legend
    const focus = g.append("g").style("display", "none");
    
    focus.append("line")
      .attr("stroke", "#e5e7eb").attr("stroke-width", 1)
      .attr("y1", 0).attr("y2", innerH);
    focus.append("circle").attr("class", "dot-a").attr("r", 4)
      .attr("fill", "#94a3b8").attr("stroke", "white").attr("stroke-width", 2);
    focus.append("circle").attr("class", "dot-b").attr("r", 4)
      .attr("fill", activeSpecies?.color ?? "#22c55e").attr("stroke", "white").attr("stroke-width", 2);

    // Tooltip setup
    const tooltipEl = g.append("g").style("display", "none");
    const tooltipRect = tooltipEl.append("rect")
      .attr("rx", 4).attr("ry", 4).attr("fill", "white").attr("stroke", "#e5e7eb")
      .style("filter", "drop-shadow(0 1px 4px rgba(0,0,0,0.1))");
    const tooltipTextA = tooltipEl.append("text").attr("font-size", "11px").attr("fill", "#94a3b8");
    const tooltipTextB = tooltipEl.append("text").attr("font-size", "11px").attr("fill", activeSpecies?.color ?? "#22c55e");

    g.append("rect")
      .attr("width", innerW).attr("height", innerH).attr("fill", "transparent")
      .on("mousemove", function(event) {
        const [mx] = d3.pointer(event);
        const allMonths = MONTHS.map(m => ({ m, px: x(m) as number }));
        const closest = allMonths.reduce((a, b) => Math.abs(b.px - mx) < Math.abs(a.px - mx) ? b : a);
        const idx = MONTHS.indexOf(closest.m);
        focus.style("display", null);
        focus.select("line").attr("x1", closest.px).attr("x2", closest.px);
        focus.select(".dot-a").attr("cx", closest.px).attr("cy", y(dataA[idx].value));
        focus.select(".dot-b").attr("cx", closest.px).attr("cy", y(dataB[idx].value));

        tooltipEl.style("display", null);
        tooltipTextA.text(`${closest.m} ${a}: ${dataA[idx].value.toLocaleString()}`).attr("x", 6).attr("y", 14);
        tooltipTextB.text(`${closest.m} ${b}: ${dataB[idx].value.toLocaleString()}`).attr("x", 6).attr("y", 28);

        const bboxA = (tooltipTextA.node() as SVGTextElement).getBBox();
        const bboxB = (tooltipTextB.node() as SVGTextElement).getBBox();
        const w = Math.max(bboxA.width, bboxB.width) + 12;
        const h = 36;
        tooltipRect.attr("x", 0).attr("y", 0).attr("width", w).attr("height", h);

        const tx = Math.min(closest.px + 8, innerW - w - 4);
        // If near top, show below the dots instead of above
        const minY = Math.min(y(dataA[idx].value), y(dataB[idx].value));
        const ty = minY - h - 8 < 0 ? minY + 12 : minY - h - 8;
        tooltipEl.attr("transform", `translate(${tx},${ty})`);
      })
      .on("mouseleave", () => {
        focus.style("display", "none");
        tooltipEl.style("display", "none");
      });

  }, [seasonal, windowA, windowB, activeSpecies?.color, showSeasonal]);

  if (selectedSpecies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm px-6 text-center">
        Search for a bird species to see details here
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Species Selector */}
      {selectedSpecies.length > 1 && (
        <div className="p-4 border-b border-gray-100">
          <select
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none"
            value={activeKey ?? ""}
            onChange={(e) => setActiveKey(e.target.value)}
          >
            {selectedSpecies.map((s) => (
              <option key={s.key} value={s.key}>
                {s.commonName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Species Info Card */}
      {activeSpecies && (
        <div className="p-4 border-b border-gray-100">
          <div className="w-full h-40 rounded-lg overflow-hidden bg-gray-100 mb-3 flex items-center justify-center">
            {imageLoading && (
              <span className="text-xs text-gray-400 animate-pulse">Loading image...</span>
            )}
            {!imageLoading && image?.image_url && (
              <img
                src={image.image_url}
                alt={activeSpecies.commonName}
                className="w-full h-full object-cover"
                onError={() => setImage(null)}
              />
            )}
            {!imageLoading && !image && (
              <span className="text-xs text-gray-400">No image available</span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: activeSpecies.color }}
            />
            <span className="font-semibold text-gray-800">{activeSpecies.commonName}</span>
          </div>
          <p className="text-xs text-gray-400 italic ml-5">{activeSpecies.scientificName}</p>
        </div>
      )}

      {/* Observation Count Chart */}
      <div className="p-4 border-b border-gray-100">
        <button
          className="w-full flex items-center justify-between mb-3"
          onClick={() => setShowObservations((v) => !v)}
        >
          <div className="flex flex-col items-start gap-0.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Observations Per Year
            </h3>
            <p className="text-[10px] text-gray-400 normal-case font-normal">Sampled sight from GBIF. Number of grid cells with sightings per year, each cell aggregates multiple raw records into one point</p>
          </div>
          <span className="text-gray-400 text-xs">{showObservations ? "▲" : "▼"}</span>
        </button>
        {showObservations && (
          chartData.length > 0 ? (
            <svg ref={observationsChartRef} width="100%" height={140} />
          ) : (
            <div className="text-xs text-gray-400 text-center py-8">No data available</div>
          )
        )}
      </div>

      {/* Centroid Latitude Chart */}
      <div className="p-4 border-b border-gray-100">
        <button
          className="w-full flex items-center justify-between mb-1"
          onClick={() => setShowCentroid((v) => !v)}
        >
          <div className="flex flex-col items-start gap-0.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Centroid Latitude Over Time
            </h3>
            <p className="text-xs text-gray-400 normal-case font-normal">Median latitude of sightings per year</p>
          </div>
          <span className="text-gray-400 text-xs">{showCentroid ? "▲" : "▼"}</span>
        </button>
        {showCentroid && (
          <>
            {analysis && (
              <p className="text-xs text-gray-400 mb-3">
                Shifting {analysis.trend.direction} at {Math.abs(analysis.trend.km_per_year)} km/year
                (R² = {analysis.trend.r_squared})
              </p>
            )}
            {analysisLoading && (
              <div className="text-xs text-gray-400 text-center py-8 animate-pulse">Loading analysis...</div>
            )}
            {!analysisLoading && analysis?.centroids?.length > 0 ? (
              <>
                <svg ref={centroidChartRef} width="100%" height={140} />
                <p className="text-xs text-gray-400 mt-2 italic">
                  * Centroid may fall in uninhabited areas for species with multiple distinct populations.
                </p>
              </>
            ) : (
              !analysisLoading && <div className="text-xs text-gray-400 text-center py-8">No data available</div>
            )}
          </>
        )}
      </div>

      {/* Seasonal Pattern */}
      <div className="p-4 border-b border-gray-100">
        <button
          className="w-full flex items-center justify-between mb-3"
          onClick={() => setShowSeasonal((v) => !v)}
        >
          <div className="flex flex-col items-start gap-0.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Seasonal Pattern
            </h3>
            <p className="text-[10px] text-gray-400 normal-case font-normal">Compare monthly sighting counts across two periods. Total GBIF records by month, unsampled</p>
          </div>
          <span className="text-gray-400 text-xs">{showSeasonal ? "▲" : "▼"}</span>
        </button>
        {showSeasonal && (
          analysisLoading ? (
            <div className="text-xs text-gray-400 text-center py-8 animate-pulse">Loading...</div>
          ) : seasonal ? (
            (() => {
              const windows = Object.keys(seasonal).filter(w => w !== "2025-2026");
              const a = windowA ?? windows[0];
              const b = windowB ?? windows[windows.length - 1];
              return (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 outline-none text-gray-600"
                      value={a}
                      onChange={(e) => setWindowA(e.target.value)}
                    >
                      {windows.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-400 shrink-0">vs</span>
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 outline-none text-gray-600"
                      value={b}
                      onChange={(e) => setWindowB(e.target.value)}
                    >
                      {windows.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                    <svg ref={seasonalChartRef} width="100%" height={140} />
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-0.5 bg-slate-400 inline-block" />
                      <span className="text-[10px] text-gray-500">{a}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: activeSpecies?.color ?? "#22c55e" }} />
                      <span className="text-[10px] text-gray-500">{b}</span>
                    </div>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="text-xs text-gray-400 text-center py-8">No data available</div>
          )
        )}
      </div>

      {/* Hotspot Summary */}
      <div className="p-4 border-b border-gray-100">
        <button
          className="w-full flex items-center justify-between mb-3"
          onClick={() => setShowHotspotSummary((v) => !v)}
        >
          <div className="flex flex-col items-start gap-0.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Hotspot Summary
            </h3>
            <p className="text-xs text-gray-400 normal-case font-normal">Grid cells by density change: before 2010 vs after 2010</p>
          </div>
          <span className="text-gray-400 text-xs">{showHotspotSummary ? "▲" : "▼"}</span>
        </button>
        {showHotspotSummary && (
          hotspots?.summary ? (
            <>
              {/* Summary Cards */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
                  <div className="text-lg font-bold text-emerald-600">{hotspots.summary.emerging}</div>
                  <div className="text-xs text-emerald-500 font-medium">Emerging</div>
                  <div className="text-xs text-gray-400 mt-0.5">Growing since 2010</div>
                </div>
                <div className="flex-1 rounded-lg bg-amber-50 border border-amber-100 p-2 text-center">
                  <div className="text-lg font-bold text-amber-500">{hotspots.summary.persistent}</div>
                  <div className="text-xs text-amber-400 font-medium">Persistent</div>
                  <div className="text-xs text-gray-400 mt-0.5">Active all decades</div>
                </div>
                <div className="flex-1 rounded-lg bg-pink-50 border border-pink-100 p-2 text-center">
                  <div className="text-lg font-bold text-pink-600">{hotspots.summary.declining}</div>
                  <div className="text-xs text-pink-500 font-medium">Declining</div>
                  <div className="text-xs text-gray-400 mt-0.5">Reduced since 2010</div>
                </div>
              </div>

              {/* Top Locations */}
              {hotspots?.hotspots?.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Top Locations</p>
                  {[...hotspots.hotspots]
                    .sort((a: any, b: any) => b.recent_count - a.recent_count)
                    .slice(0, 5)
                    .map((h: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            h.type === "emerging" ? "bg-emerald-500" :
                            h.type === "persistent" ? "bg-amber-400" : "bg-pink-600"
                          }`} />
                          <span className="text-gray-600">
                            {locationLabels[`${h.lat},${h.lon}`] ?? `${h.lat.toFixed(1)}°, ${h.lon.toFixed(1)}°`}
                          </span>
                        </div>
                        <span className="text-gray-400">{h.recent_count} obs</span>
                      </div>
                    ))
                  }
                </div>
              )}
            </>
          ) : (
            !analysisLoading && <div className="text-xs text-gray-400 text-center py-4">No hotspot data</div>
          )
        )}
      </div>
    </div>
  );
}