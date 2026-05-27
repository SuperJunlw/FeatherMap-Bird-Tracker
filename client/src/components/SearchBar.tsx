import { useState, useEffect } from "react";
import { searchSpecies } from "../api";

// --- Types ---
export interface Species {
  key: string;
  commonName: string;
  scientificName: string;
  color: string;
}

// --- Mock Species List ---
// const MOCK_SPECIES: Species[] = [
//   { key: "1", commonName: "American Robin", scientificName: "Turdus migratorius", color: "#ef4444" },
//   { key: "2", commonName: "Bald Eagle", scientificName: "Haliaeetus leucocephalus", color: "#3b82f6" },
//   { key: "3", commonName: "Painted Bunting", scientificName: "Passerina ciris", color: "#8b5cf6" },
//   { key: "4", commonName: "Northern Cardinal", scientificName: "Cardinalis cardinalis", color: "#f97316" },
//   { key: "5", commonName: "Blue Jay", scientificName: "Cyanocitta cristata", color: "#06b6d4" },
//   { key: "6", commonName: "American Goldfinch", scientificName: "Spinus tristis", color: "#eab308" },
//   { key: "7", commonName: "Red-tailed Hawk", scientificName: "Buteo jamaicensis", color: "#a16207" },
//   { key: "8", commonName: "Great Blue Heron", scientificName: "Ardea herodias", color: "#64748b" },
// ];

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

export default function SearchBar({ selectedSpecies, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Species[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await searchSpecies(query);
        const mapped: Species[] = results
          .filter((r: any) => !selectedSpecies.find((s) => s.key === String(r.key)))
          .map((r: any, i: number) => ({
            key: String(r.key),
            commonName: r.commonName || r.name,
            scientificName: r.name,
            color: COLORS[(selectedSpecies.length + i) % COLORS.length],
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


  return (
    <div className="relative flex-1">
      {/* Input Row */}
      <div className="flex items-center flex-wrap gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white shadow-sm">
        {/* Selected Species Tags */}
        {selectedSpecies.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white font-medium"
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
        <input
          className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 min-w-40"
          placeholder="Search for a bird species..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        />
      </div>

      {/* Suggestions Dropdown */}
      {isFocused && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-gray-400">Searching...</div>
          )}

          {!isLoading && suggestions.length > 0 && suggestions.map((s) => (
            <button
              key={s.key}
              className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3"
              onClick={() => {
                onAdd(s);
                setQuery("");
                setSuggestions([]);
              }}
            >
              {/* Color Dot */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-800">{s.commonName}</span>
                <span className="text-xs text-gray-400 italic">{s.scientificName}</span>
              </div>
            </button>
          ))}

          {!isLoading && suggestions.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-400">No species found</div>
          )}
        </div>
      )}
    </div>
  );
}