import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface Props {
  currentYear: number;
  onYearChange: (year: number) => void;
}

const MIN_YEAR = 1990;
const MAX_YEAR = 2026;
const STEP = 2;

export default function TimeControls({ currentYear, onYearChange }: Props) {
  const playingRef = useRef(false); // mutable ref to track play state without causing re-renders
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // ref to store interval ID for cleanup
  const [isPlaying, setIsPlaying] = useState(false); // local state to trigger re-render for play/pause button UI
  const sliderRef = useRef<SVGSVGElement>(null); // ref for the D3 slider SVG element

  // Play/pause toggle handler
  const togglePlay = () => {
    if (playingRef.current) {
      // Pause
      playingRef.current = false;
      setIsPlaying(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    } else {
      // Play — reset to start if at end
      if (currentYear >= MAX_YEAR) onYearChange(MIN_YEAR);
      playingRef.current = true;
      setIsPlaying(true);
      intervalRef.current = setInterval(() => {
        onYearChange((prev) => {
          if (prev >= MAX_YEAR) {
            playingRef.current = false;
            setIsPlaying(false);
            clearInterval(intervalRef.current!);
            return MAX_YEAR;
          }
          return prev + STEP;
        });
      }, 1200); // advances every 1200ms
    }
  };

  // Keep a ref to the onYearChange callback to avoid stale closures in the interval
  const onYearChangeRef = useRef(onYearChange);
  useEffect(() => {
    onYearChangeRef.current = onYearChange;
  }, [onYearChange]);

  // D3 slider setup
  useEffect(() => {
    if (!sliderRef.current) return;

    const svg = d3.select(sliderRef.current);
    svg.selectAll("*").remove();

    const width = sliderRef.current.clientWidth || 300;
    const height = 28;
    const margin = { left: 8, right: 8 };
    const innerW = width - margin.left - margin.right;

    const x = d3.scaleLinear()
      .domain([MIN_YEAR, MAX_YEAR])
      .range([0, innerW])
      .clamp(true);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${height / 2})`);

    // Track background
    g.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("stroke", "#e5e7eb").attr("stroke-width", 4)
      .attr("stroke-linecap", "round");

    // Track fill (progress)
    const fill = g.append("line")
      .attr("x1", 0).attr("x2", x(currentYear))
      .attr("stroke", "#22c55e").attr("stroke-width", 4)
      .attr("stroke-linecap", "round");

    // Handle
    const handle = g.append("circle")
      .attr("cx", x(currentYear))
      .attr("r", 8)
      .attr("fill", "#22c55e")
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .style("cursor", "grab");

    // Drag behavior
    const drag = d3.drag<SVGCircleElement, unknown>()
      .on("start", function() {
        d3.select(this).style("cursor", "grabbing");
      })
      .on("drag", function(event) {
        const newX = Math.max(0, Math.min(innerW, event.x));
        const rawYear = x.invert(newX);
        const snapped = Math.round(rawYear / STEP) * STEP;
        const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, snapped));
        handle.attr("cx", x(clamped));
        fill.attr("x2", x(clamped));
        onYearChangeRef.current(clamped);
      })
      .on("end", function() {
        d3.select(this).style("cursor", "grab");
      });

    handle.call(drag);

    // Click on track
    g.append("rect")
      .attr("x", 0).attr("y", -10)
      .attr("width", innerW).attr("height", 20)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("click", function(event) {
        const [mx] = d3.pointer(event);
        const rawYear = x.invert(mx);
        const snapped = Math.round(rawYear / STEP) * STEP;
        const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, snapped));
        onYearChangeRef.current(clamped);
      });

  }, []);

  // Update slider position when currentYear changes externally
  useEffect(() => {
    if (!sliderRef.current) return;
    const svg = d3.select(sliderRef.current);
    const width = sliderRef.current.clientWidth || 300;
    const margin = { left: 8, right: 8 };
    const innerW = width - margin.left - margin.right;
    const x = d3.scaleLinear().domain([MIN_YEAR, MAX_YEAR]).range([0, innerW]).clamp(true);
    svg.select("circle").attr("cx", x(currentYear));
    svg.selectAll("line").filter((_, i) => i === 1).attr("x2", x(currentYear));
  }, [currentYear]);

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
        {isPlaying ? "⏸" : "▶"}
      </button>

      {/* Step Back Button */}
    <button
      onClick={() => onYearChange(Math.max(MIN_YEAR, currentYear - STEP))}
      className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition shrink-0 text-xs"
    >
      ◀
    </button>
    
    {/* Step Forward Button */}
    <button
      onClick={() => onYearChange(Math.min(MAX_YEAR, currentYear + STEP))}
      className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition shrink-0 text-xs"
    >
      ▶
    </button>

      {/* Slider */}
      <svg ref={sliderRef} className="flex-1" height={28} />

      {/* Year Label */}
      <span className="text-sm font-semibold text-gray-700 w-10 text-right">
        {currentYear}
      </span>
    </div>
  );
}