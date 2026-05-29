
const BASE = "http://localhost:8000";

export async function searchSpecies(q: string) {
  const res = await fetch(`${BASE}/api/species/search?q=${encodeURIComponent(q)}`);
  return res.json(); // returns [{ key, name, commonName }]
}

export async function getOccurrences(speciesKey: string) {
  const res = await fetch(`${BASE}/api/species/${speciesKey}/occurrences`);
  return res.json(); // returns [{ lat, lon, year, count }]
}

export async function getAnalysis(speciesKey: string) {
  const res = await fetch(`${BASE}/api/species/${speciesKey}/analysis`);
  return res.json();
}

export async function getHotspots(speciesKey: string) {
  const res = await fetch(`${BASE}/api/species/${speciesKey}/hotspots`);
  return res.json();
}