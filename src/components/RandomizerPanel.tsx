import { useState, useRef } from "react";
import type { FeltController } from "@feltmaps/js-sdk";
import type { FeatureCollection } from "geojson";
import { FeltClient } from "../felt-client";
import { FELT_API_TOKEN, SOURCE_MAP_ID, SOURCE_LAYER_ID } from "../config";
import { exportLayer } from "../lib/export-layer";
import { randomize } from "../lib/randomize";
import { uploadToNewMap, type NewMapResult } from "../lib/upload-to-new-map";

interface Props {
  felt: FeltController | null;
}

type Status =
  | { step: "idle" }
  | { step: "exporting" }
  | { step: "randomizing" }
  | { step: "highlighting" }
  | { step: "creating-map" }
  | { step: "uploading" }
  | { step: "done"; result: NewMapResult; count: number; total: number }
  | { step: "error"; message: string };

export function RandomizerPanel({ felt }: Props) {
  const [percentage, setPercentage] = useState(10);
  const [status, setStatus] = useState<Status>({ step: "idle" });
  const highlightLayerIdsRef = useRef<string[]>([]);
  const clientRef = useRef(new FeltClient(FELT_API_TOKEN));

  async function handleRandomize() {
    if (!felt) return;
    const client = clientRef.current;

    try {
      // Remove old highlight layers
      for (const id of highlightLayerIdsRef.current) {
        try {
          await felt.deleteLayer(id);
        } catch {
          // layer may already be gone
        }
      }
      highlightLayerIdsRef.current = [];

      // 1. Export
      setStatus({ step: "exporting" });
      const fc = await exportLayer(client, SOURCE_MAP_ID, SOURCE_LAYER_ID);

      // 2. Randomize
      setStatus({ step: "randomizing" });
      const selected = randomize(fc, percentage);

      // 3. Highlight on embedded map
      setStatus({ step: "highlighting" });
      const result = await felt.createLayersFromGeoJson({
        name: `Random ${percentage}% selection`,
        source: { type: "geoJsonData", data: selected as GeoJSON.FeatureCollection },
      });
      if (result) {
        highlightLayerIdsRef.current = result.layers.map((l) => l.id);
      }

      // 4. Create new map + upload
      setStatus({ step: "creating-map" });
      const mapResult = await uploadToNewMap(
        client,
        selected,
        `Randomized ${percentage}% — ${new Date().toLocaleString()}`,
      );

      setStatus({
        step: "done",
        result: mapResult,
        count: selected.features.length,
        total: fc.features.length,
      });
    } catch (err) {
      setStatus({ step: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const busy = status.step !== "idle" && status.step !== "done" && status.step !== "error";

  return (
    <div className="panel">
      <h1>Randomizer</h1>

      <label htmlFor="pct-slider">
        Select <strong>{percentage}%</strong> of features
      </label>
      <input
        id="pct-slider"
        type="range"
        min={1}
        max={100}
        value={percentage}
        onChange={(e) => setPercentage(Number(e.target.value))}
        disabled={busy}
      />

      <button onClick={handleRandomize} disabled={busy || !felt}>
        {busy ? "Working…" : "Randomize"}
      </button>

      {status.step === "exporting" && <p className="status">Exporting layer data…</p>}
      {status.step === "randomizing" && <p className="status">Selecting random features…</p>}
      {status.step === "highlighting" && <p className="status">Highlighting on map…</p>}
      {status.step === "creating-map" && <p className="status">Creating new map & uploading…</p>}
      {status.step === "uploading" && <p className="status">Uploading selection…</p>}

      {status.step === "error" && <p className="error">Error: {status.message}</p>}

      {status.step === "done" && (
        <div className="result">
          <p>
            Selected <strong>{status.count}</strong> of {status.total} features
          </p>
          <a href={status.result.mapUrl} target="_blank" rel="noopener noreferrer">
            Open new map →
          </a>
        </div>
      )}
    </div>
  );
}
