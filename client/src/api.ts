
const BASE = "http://localhost:8000";

// Search for species matching query string, returns list of { key, name, commonName }
export async function searchSpecies(q: string) {
  const res = await fetch(`${BASE}/api/species/search?q=${encodeURIComponent(q)}`);
  return res.json();
}

// For a given species key, fetch its occurrence data (lat, lon, year, count) for all records
export async function getOccurrences(speciesKey: string) {
  const res = await fetch(`${BASE}/api/species/${speciesKey}/occurrences`);
  return res.json(); 
}

// For a given species key, fetch its analysis data 
export async function getAnalysis(speciesKey: string) {
  const res = await fetch(`${BASE}/api/species/${speciesKey}/analysis`);
  return res.json();
}

// For a given species key, fetch its hotspot data (lat, lon, year, count) for top hotspots
export async function getHotspots(speciesKey: string) {
  const res = await fetch(`${BASE}/api/species/${speciesKey}/hotspots`);
  return res.json();
}

// For a given species key, fetch its seasonal occurrence data (month, value) for seasonal chart
export async function getSeasonal(speciesKey: string) {
  const res = await fetch(`${BASE}/api/species/${speciesKey}/seasonal`);
  return res.json();
}