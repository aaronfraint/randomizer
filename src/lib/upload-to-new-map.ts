import type { TypeBreakdown } from "./randomize";
import { FeltClient } from "../felt-client";

export interface NewMapResult {
  mapUrl: string;
  mapId: string;
  layerIds: string[];
}

export async function uploadToNewMap(
  client: FeltClient,
  byType: TypeBreakdown[],
  title: string,
): Promise<NewMapResult> {
  // 1. Create a new map
  const map = await client.createMap({ title, basemap: "satellite" });

  // 2. Upload each pile type as a separate layer
  const layerIds: string[] = [];
  for (const { type, selected, total, fc } of byType) {
    if (fc.features.length === 0) continue;
    const pct = Math.round((selected / total) * 100);
    const name = `${type} (${pct}% — ${selected} of ${total})`;
    const blob = new Blob([JSON.stringify(fc)], { type: "application/geo+json" });
    const upload = await client.uploadFile(map.id, blob, `${name}.geojson`);
    layerIds.push(upload.layer_id);
  }

  // 3. Poll until all layers finish processing
  await Promise.all(layerIds.map((id) => client.waitForLayer(map.id, id)));

  return {
    mapUrl: map.url,
    mapId: map.id,
    layerIds,
  };
}
