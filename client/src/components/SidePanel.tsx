import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Species } from "./SearchBar";
import type { BirdSighting } from "./MapView";
import { getAnalysis, getHotspots } from "../api";

const BASE = "http://localhost:8000";

interface Props {
  selectedSpecies: Species[];
  sightings: BirdSighting[];
}

interface SpeciesImage {
  image_url: string;
  publisher: string;
}

export default function SidePanel({ selectedSpecies, sightings }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [image, setImage] = useState<SpeciesImage | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [hotspots, setHotspots] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Auto-select first species when list changes
  useEffect(() => {
    if (selectedSpecies.length > 0) {
      setActiveKey(selectedSpecies[0].key);
    } else {
      setActiveKey(null);
      setImage(null);
    }
  }, [selectedSpecies]);

  // Fetch image when active species changes
  useEffect(() => {
    if (!activeKey) return;
    setImageLoading(true);
    setImage(null);
    fetch(`${BASE}/api/species/${activeKey}/image`)
      .then((r) => r.json())
      .then((data) => setImage(data))
      .catch(() => setImage(null))
      .finally(() => setImageLoading(false));
  }, [activeKey]);

  // Fetch analysis and hotspots when active species changes
  useEffect(() => {
    if (!activeKey) return;
    setAnalysisLoading(true);
    setAnalysis(null);
    setHotspots(null);
    Promise.all([getAnalysis(activeKey), getHotspots(activeKey)])
      .then(([analysisData, hotspotsData]) => {
        setAnalysis(analysisData);
        setHotspots(hotspotsData);
      })
      .catch(console.error)
      .finally(() => setAnalysisLoading(false));
  }, [activeKey]);

  const activeSpecies = selectedSpecies.find((s) => s.key === activeKey);

  // Build observation count per year for active species
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
          {/* Bird Photo */}
          <div className="w-full h-28 rounded-lg overflow-hidden bg-gray-100 mb-3 flex items-center justify-center">
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

          {/* Name + Color Tag */}
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
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Observations Per Year
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
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
        )}
      </div>

      {/* Centroid Latitude Chart */}
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Centroid Latitude Over Time
        </h3>
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
        ) : (
          !analysisLoading && <div className="text-xs text-gray-400 text-center py-8">No data available</div>
        )}
      </div>

      {/* Hotspot Summary */}
      <div className="p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Hotspot Summary
        </h3>
        {hotspots?.summary ? (
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg bg-green-50 border border-green-100 p-3 text-center">
              <div className="text-lg font-bold text-green-600">{hotspots.summary.emerging}</div>
              <div className="text-xs text-green-500 mt-1 font-medium">Emerging</div>
              <div className="text-xs text-gray-400 mt-1">Areas with growing activity since 2010</div>
            </div>
            <div className="flex-1 rounded-lg bg-blue-50 border border-blue-100 p-3 text-center">
              <div className="text-lg font-bold text-blue-600">{hotspots.summary.persistent}</div>
              <div className="text-xs text-blue-500 mt-1 font-medium">Persistent</div>
              <div className="text-xs text-gray-400 mt-1">Consistently active across all decades</div>
            </div>
            <div className="flex-1 rounded-lg bg-red-50 border border-red-100 p-3 text-center">
              <div className="text-lg font-bold text-red-600">{hotspots.summary.declining}</div>
              <div className="text-xs text-red-500 mt-1 font-medium">Declining</div>
              <div className="text-xs text-gray-400 mt-1">Areas with reduced activity since 2010</div>
            </div>
          </div>
        ) : (
          !analysisLoading && <div className="text-xs text-gray-400 text-center py-4">No hotspot data</div>
        )}
      </div>
    </div>
  );
}