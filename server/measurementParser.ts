export type CupCategory = "small" | "medium" | "large" | "extra_large";

/**
 * Parses a measurement string and returns a cup size category.
 * 4-tier classification based on the Visual Mass Index (VMI).
 */
export function parseCupCategory(measurements: string | null | undefined): CupCategory | null {
  if (!measurements?.trim()) return null;
  // Match band (2-3 digits) and cup (letters)
  const match = measurements.trim().match(/^(\d{2,3})([A-Za-z]+)/i);
  if (!match) return null;

  const band = parseInt(match[1], 10);
  const cupNum = cupToNumber(match[2].toUpperCase());
  if (cupNum === null) return null;

  const isMetric = band >= 60;
  // Convert metric band to US equivalent (e.g., 70cm -> 32", 75cm -> 34")
  const usBand = isMetric ? Math.round((band - 70) / 5) * 2 + 32 : band;

  // Visual Mass Index (VMI) = Band Size * Cup Number
  // A wider frame makes the same cup look visually larger (e.g. 34B is Medium, 32B is Small)
  const visualMass = cupNum * usBand;
  return categorizeVisualMass(visualMass);
}

// Converts a cup string to a numeric volume unit.
function cupToNumber(cup: string): number | null {
  const normalizedCup = cup.toUpperCase();
  let c = normalizedCup;

  if (/^D{2,}$/.test(normalizedCup)) {
    const dCount = normalizedCup.length;
    c = dCount === 2 ? "E" : dCount === 3 ? "F" : dCount === 4 ? "G" : "H";
  } else if (normalizedCup.length === 2 && normalizedCup[0] === normalizedCup[1]) {
    if (normalizedCup === "FF") c = "F";
    else if (normalizedCup === "GG") c = "G";
    else if (normalizedCup === "HH") c = "H";
    else if (normalizedCup === "JJ") c = "J";
    else if (normalizedCup === "KK") c = "K";
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const table: Record<string, number> = {
    AAA: -1,
    AA: 0,
  };
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet[i]] = i + 1;
  }

  return table[c] ?? null;
}

// Thresholds for the 4-tier classification based on Visual Mass Index
function categorizeVisualMass(mass: number): CupCategory {
  if (mass <= 67) return "small"; // <= 33B (e.g. Hannah Hays, 30B, 32A, 33B)
  if (mass <= 130) return "medium"; // 34B, 32C, 34C, 36C, 40C, 30D, 32D
  if (mass <= 216) return "large"; // 34D, 36D, 36F, 42DD
  return "extra_large"; // 34G+, 36G+, Huge Tits
}
