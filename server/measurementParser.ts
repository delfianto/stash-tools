export type CupCategory = "small" | "medium" | "large";

/**
 * Parses a measurement string (e.g. "34DD-24-36" or "90F-59-88") and returns
 * a cup size category that accounts for band size via sister-sizing normalization.
 *
 * Cup letters alone are misleading: 32DD has the same physical volume as 34D,
 * 36C, 38B, and 40A (sister sizes). The raw letter says nothing without the band.
 *
 * We normalize everything to an equivalent cup at a reference band of 36" (US)
 * / 90cm (Japanese/EU), then apply thresholds to that normalized value:
 *   ≤ C at 36"  → small
 *   D–E at 36"  → medium
 *   F+ at 36"   → large
 *
 * Examples:
 *   32DD → normalized C at 36"  → small  (same volume as 36C)
 *   34DD → normalized D at 36"  → medium
 *   36DD → normalized E at 36"  → medium
 *   38DD → normalized F at 36"  → large
 *   34G  → normalized F at 36"  → large
 *   40D  → normalized F at 36"  → large  (large band bumps a D into large territory)
 */
export function parseCupCategory(measurements: string | null | undefined): CupCategory | null {
  if (!measurements?.trim()) return null;
  const match = measurements.trim().match(/^(\d+)([A-Za-z]+)/i);
  if (!match) return null;

  const band = parseInt(match[1], 10);
  const cupNum = cupToNumber(match[2].toUpperCase());
  if (cupNum === null) return null;

  // Bands ≥ 60 are centimetre-based (Japanese / EU); anything smaller is US inches.
  const isMetric = band >= 60;
  const offset = isMetric
    ? Math.round((band - 90) / 5) // reference 90 cm ≈ 36"
    : Math.round((band - 36) / 2); // reference 36"

  return categorizeCupNormalized(cupNum + offset);
}

// Converts a cup string to a numeric volume unit (1 unit ≈ 1 inch / 2.5 cm increment).
// Multi-D US notation is collapsed to single-letter equivalents first.
function cupToNumber(cup: string): number | null {
  const c = cup === "DDDD" ? "G" : cup === "DDD" ? "F" : cup === "DD" ? "E" : cup;

  const table: Record<string, number> = {
    AAA: -1,
    AA: 0,
    A: 1,
    B: 2,
    C: 3,
    D: 4,
    E: 5,
    F: 6,
    G: 7,
    H: 8,
    I: 9,
    J: 10,
    K: 11,
    L: 12,
    M: 13,
  };
  return table[c] ?? null;
}

// Thresholds relative to the 36" / 90 cm reference band.
function categorizeCupNormalized(n: number): CupCategory {
  if (n <= 3) return "small"; // ≤ C at 36"
  if (n <= 5) return "medium"; // D or E at 36"
  return "large"; // F+ at 36"
}
