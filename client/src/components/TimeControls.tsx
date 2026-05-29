import { useEffect, useRef } from "react";

interface Props {
  currentYear: number;
  onYearChange: (year: number) => void;
}

const MIN_YEAR = 1990;
const MAX_YEAR = 2026;
const STEP = 2;

export default function TimeControls({ currentYear, onYearChange }: Props) {
  const playingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const togglePlay = () => {
    if (playingRef.current) {
      // Pause
      playingRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else {
      // Play — reset to start if at end
      if (currentYear >= MAX_YEAR) onYearChange(MIN_YEAR);
      playingRef.current = true;
      intervalRef.current = setInterval(() => {
        onYearChange((prev) => {
          if (prev >= MAX_YEAR) {
            playingRef.current = false;
            clearInterval(intervalRef.current!);
            return MAX_YEAR;
          }
          return prev + STEP;
        });
      }, 1200); // advances every 600ms
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-white/90 backdrop-blur rounded-xl border border-gray-200 shadow-sm">
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 transition shrink-0"
      >
        {playingRef.current ? "⏸" : "▶"}
      </button>

      {/* Slider */}
      <input
        type="range"
        min={MIN_YEAR}
        max={MAX_YEAR}
        step={STEP}
        value={currentYear}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="flex-1 accent-green-500"
      />

      {/* Year Label */}
      <span className="text-sm font-semibold text-gray-700 w-10 text-right">
        {currentYear}
      </span>
    </div>
  );
}