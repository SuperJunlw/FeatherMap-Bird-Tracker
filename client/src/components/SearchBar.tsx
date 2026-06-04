import { useState, useEffect } from "react";
import { searchSpecies } from "../api";

// --- Types ---
export interface Species {
  key: string;
  commonName: string;
  scientificName: string;
  color: string;
}

// --- Color Pool ---
const COLORS = [
  "#ef4444", "#3b82f6", "#8b5cf6", "#f97316",
  "#06b6d4", "#eab308", "#a16207", "#64748b"
];

// --- Props ---
interface Props {
  selectedSpecies: Species[];
  onAdd: (s: Species) => void;
  onRemove: (s: Species) => void;
}

const MAX_SPECIES = 5;

export default function SearchBar({ selectedSpecies, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Species[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const usedColors = new Set(selectedSpecies.map((s) => s.color));
        const availableColors = COLORS.filter((c) => !usedColors.has(c));

        const results = await searchSpecies(query);
        const mapped: Species[] = results
          .filter((r: any) => !selectedSpecies.find((s) => s.key === String(r.key)))
          .map((r: any, i: number) => ({
            key: String(r.key),
            commonName: r.commonName || r.name,
            scientificName: r.name,
            color: availableColors[i % availableColors.length] ?? COLORS[i % COLORS.length],
          }));
        setSuggestions(mapped);
      } catch (err) {
        console.error("Species search failed:", err);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedSpecies]);

  const handleHover = async (key: string) => {
    if (hoveredKey === key) return;
    setHoveredKey(key);
    setHoverImage(null);
    setHoverLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/species/${key}/image`);
      const data = await res.json();
      setHoverImage(data.image_url ?? null);
    } catch {
      setHoverImage(null);
    } finally {
      setHoverLoading(false);
    }
  };


  return (
    <div className="relative flex-1">
      {/* Input Row */}
      <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white shadow-sm overflow-x-auto">
        {/* Selected Species Tags */}
        {selectedSpecies.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white font-medium shrink-0"
            style={{ backgroundColor: s.color }}
          >
            {s.commonName}
            <button
              onClick={() => onRemove(s)}
              className="hover:opacity-70 ml-1 text-sm leading-none"
            >
              ×
            </button>
          </span>
        ))}

        {/* Search Input */}
        {selectedSpecies.length < MAX_SPECIES && (
          <input
            className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 min-w-40 shrink-0"
            placeholder="Search for a bird species..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          />
        )}

        {selectedSpecies.length >= MAX_SPECIES && (
          <span className="text-xs text-gray-400 italic">Max {MAX_SPECIES} species</span>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {isFocused && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-gray-400">Searching...</div>
          )}

          {!isLoading && suggestions.length > 0 && suggestions.map((s) => (
          <div key={s.key} className="relative group">
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3"
              onMouseEnter={() => handleHover(s.key)}
              onMouseLeave={() => { setHoveredKey(null); setHoverImage(null); }}
              onClick={() => {
                onAdd(s);
                setQuery("");
                setSuggestions([]);
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-800">{s.commonName}</span>
                <span className="text-xs text-gray-400 italic">{s.scientificName}</span>
              </div>
            </button>

            {/* Hover image tooltip */}
            {hoveredKey === s.key && (
              <div className="absolute left-full top-0 ml-2 w-48 h-32 rounded-lg overflow-hidden bg-gray-100 shadow-lg border border-gray-200 z-50 flex items-center justify-center">
                {hoverLoading && (
                  <span className="text-xs text-gray-400 animate-pulse">Loading...</span>
                )}
                {!hoverLoading && hoverImage && (
                  <img src={hoverImage} className="w-full h-full object-cover" />
                )}
                {!hoverLoading && !hoverImage && (
                  <span className="text-xs text-gray-400">No image</span>
                )}
              </div>
            )}
          </div>
        ))}
        </div>
      )}
    </div>
  );
}