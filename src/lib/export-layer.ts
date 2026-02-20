import JSZip from "jszip";
import type { FeatureCollection } from "geojson";
import { FeltClient, proxyUrl } from "../felt-client";

let cached: FeatureCollection | null = null;

export async function exportLayer(
  client: FeltClient,
  mapId: string,
  layerId: string,
): Promise<FeatureCollection> {
  if (cached) return cached;

  const { export_request_id } = await client.createCustomExport(mapId, layerId, { output_format: "geojson" });
  const downloadUrl = await client.waitForExport(mapId, layerId, export_request_id);

  const res = await fetch(proxyUrl(downloadUrl));
  if (!res.ok) throw new Error(`Export fetch failed (${res.status})`);

  // Response is a zip — extract the first .geojson file inside
  const zipData = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(zipData);
  const geojsonFile = Object.keys(zip.files).find((name) => name.endsWith(".geojson"));
  if (!geojsonFile) throw new Error("No .geojson file found in export zip");

  const text = await zip.files[geojsonFile].async("text");
  const fc: FeatureCollection = JSON.parse(text);
  cached = fc;
  return fc;
}
