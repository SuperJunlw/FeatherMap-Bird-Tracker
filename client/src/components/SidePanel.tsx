import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Species } from "./SearchBar";
import type { BirdSighting } from "./MapView";
import { getAnalysis, getHotspots, getSeasonal } from "../api";

const BASE = "http://localhost:8000";

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
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [image, setImage] = useState<SpeciesImage | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [hotspots, setHotspots] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showObservations, setShowObservations] = useState(false);
  const [showCentroid, setShowCentroid] = useState(false);
  const [showHotspotSummary, setShowHotspotSummary] = useState(false);
  const [locationLabels, setLocationLabels] = useState<Record<string, string>>({});
  const [seasonal, setSeasonal] = useState<any>(null);
  const [showSeasonal, setShowSeasonal] = useState(false);
  const [windowA, setWindowA] = useState<string | null>(null);
  const [windowB, setWindowB] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSpecies.length > 0) {
      setActiveKey(selectedSpecies[0].key);
    } else {
      setActiveKey(null);
      setImage(null);
    }
  }, [selectedSpecies]);

  useEffect(() => {
    onActiveKeyChange(activeKey);
  }, [activeKey]);

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

  const activeSpecies = selectedSpecies.find((s) => s.key === activeKey);

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
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData}>
                <XAxis dataKey="year" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v) => [v, "sightings"]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={activeSpecies?.color ?? "#22c55e"}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={analysis.centroids}>
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: any) => [`${Number(v).toFixed(2)}°`, "latitude"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="lat"
                      stroke={activeSpecies?.color ?? "#22c55e"}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
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
              const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const windows = Object.keys(seasonal).filter(w => w !== "2025-2026");
              const a = windowA ?? windows[0];
              const b = windowB ?? windows[windows.length - 1];
              const dataA = seasonal[a] as number[];
              const dataB = seasonal[b] as number[];
              const chartData = MONTHS.map((month, i) => ({
                month,
                [a]: dataA[i],
                [b]: dataB[i],
              }));
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
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={55} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Line type="monotone" dataKey={a} stroke="#94a3b8" strokeWidth={2} dot={false} name={a} />
                      <Line type="monotone" dataKey={b} stroke={activeSpecies?.color ?? "#22c55e"} strokeWidth={2} dot={false} name={b} />
                    </LineChart>
                  </ResponsiveContainer>
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
            <p className="text-xs text-gray-400 normal-case font-normal">Grid cells by density change: 1990–2005 vs 2010–2026</p>
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