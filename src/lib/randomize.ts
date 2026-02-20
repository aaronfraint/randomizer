import type { Feature, FeatureCollection } from "geojson";

/**
 * Fisher-Yates partial shuffle: randomly select `count` features
 * from the collection without modifying the original.
 */
export function randomize(fc: FeatureCollection, percentage: number): FeatureCollection {
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
