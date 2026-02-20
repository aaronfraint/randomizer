import type { FeatureCollection } from "geojson";
import { FeltClient } from "../felt-client";

export interface NewMapResult {
  mapUrl: string;
  mapId: string;
  layerId: string;
}

export async function uploadToNewMap(
  client: FeltClient,
  fc: FeatureCollection,
  title: string,
): Promise<NewMapResult> {
  // 1. Create a new map
  const map = await client.createMap({ title });

  // 2. Upload the GeoJSON as a file
  const blob = new Blob([JSON.stringify(fc)], { type: "application/geo+json" });
  const upload = await client.uploadFile(map.id, blob, "randomized-selection.geojson");
  const layerId = upload.layer_id;

  // 3. Poll until the layer finishes processing
  await client.waitForLayer(map.id, layerId);

  return {
    mapUrl: map.url,
    mapId: map.id,
    layerId,
  };
}
