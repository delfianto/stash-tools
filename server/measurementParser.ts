export type CupCategory = "small" | "medium" | "large";

/**
 * Parses a measurement string (e.g. "34DD-24-36" or "90F-59-88") and returns
 * the cup size category. Handles both US inch-based sizing (band < 60) and
 * Japanese/EU cm-based sizing (band >= 60). The cup letter categorisation is
 * the same for both systems: A/B = small, C/D = medium, E+ = large.
 */
export function parseCupCategory(measurements: string | null | undefined): CupCategory | null {
  if (!measurements?.trim()) return null;
  const match = measurements.trim().match(/^(\d+)([A-Za-z]+)/i);
  if (!match) return null;
  const cup = normalizeCup(match[2].toUpperCase());
  return categorizeCup(cup);
}

// Collapse US multi-D notation into single-letter equivalents
function normalizeCup(cup: string): string {
  if (cup === "DDDD") return "G";
  if (cup === "DDD") return "F";
  if (cup === "DD") return "E";
  return cup;
}

function categorizeCup(cup: string): CupCategory | null {
  if (["AAA", "AA", "A", "B"].includes(cup)) return "small";
  if (["C", "D"].includes(cup)) return "medium";
  // Single letter E–Z covers both US E/F/G+ and Japanese E/F/G/H/I/J/K…
  if (cup.length === 1 && cup >= "E" && cup <= "Z") return "large";
  return null;
}
