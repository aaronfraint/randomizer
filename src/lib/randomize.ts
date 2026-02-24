import type { Feature, FeatureCollection } from "geojson";

/**
 * Fisher-Yates partial shuffle: randomly select `count` features
 * from the collection without modifying the original.
 */
export function randomize(fc: FeatureCollection, percentage: number): FeatureCollection {
  if (percentage === 0 || fc.features.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  const count = Math.max(1, Math.round((percentage / 100) * fc.features.length));
  const features = [...fc.features];

  // Partial Fisher-Yates: shuffle only the first `count` positions
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (features.length - i));
    [features[i], features[j]] = [features[j], features[i]];
  }

  const selected: Feature[] = features.slice(0, count);
  return { type: "FeatureCollection", features: selected };
}

/** Extract sorted unique PILE_TYPE values from a FeatureCollection. */
export function getUniquePileTypes(fc: FeatureCollection): string[] {
  const types = new Set<string>();
  for (const f of fc.features) {
    const val = f.properties?.PILE_TYPE;
    types.add(val != null ? String(val) : "Unknown");
  }
  return [...types].sort();
}

export interface TypeBreakdown {
  type: string;
  selected: number;
  total: number;
  fc: FeatureCollection;
}

export interface RandomizeByTypeResult {
  combined: FeatureCollection;
  byType: TypeBreakdown[];
}

/**
 * Randomize independently per PILE_TYPE, using a separate percentage for each.
 * Types set to 0% are excluded entirely.
 * Returns the combined result plus a per-type breakdown.
 */
export function randomizeByType(
  fc: FeatureCollection,
  percentagesByType: Record<string, number>,
): RandomizeByTypeResult {
  // Group features by PILE_TYPE
  const groups = new Map<string, Feature[]>();
  for (const f of fc.features) {
    const val = f.properties?.PILE_TYPE;
    const key = val != null ? String(val) : "Unknown";
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(f);
  }

  // Randomize each group independently
  const allSelected: Feature[] = [];
  const byType: TypeBreakdown[] = [];

  for (const [type, features] of groups) {
    const pct = percentagesByType[type] ?? 0;
    if (pct === 0) continue;
    const sub: FeatureCollection = { type: "FeatureCollection", features };
    const selected = randomize(sub, pct);
    allSelected.push(...selected.features);
    byType.push({
      type,
      selected: selected.features.length,
      total: features.length,
      fc: selected,
    });
  }

  return {
    combined: { type: "FeatureCollection", features: allSelected },
    byType,
  };
}
