import { useState, useRef } from "react";
import type { FeltController } from "@feltmaps/js-sdk";
import { FeltClient } from "../felt-client";
import { FELT_API_TOKEN, SOURCE_MAP_ID, SOURCE_LAYER_ID } from "../config";
import { exportLayer } from "../lib/export-layer";
import { applyFilter } from "../lib/apply-filter";
import { getUniquePileTypes, randomizeByType, type TypeBreakdown } from "../lib/randomize";
import { uploadToNewMap, type NewMapResult } from "../lib/upload-to-new-map";

interface Props {
  felt: FeltController | null;
}

type Status =
  | { step: "idle" }
  | { step: "loading-types" }
  | { step: "exporting" }
  | { step: "randomizing" }
  | { step: "highlighting" }
  | { step: "selected"; byType: TypeBreakdown[]; total: number }
  | { step: "creating-map"; byType: TypeBreakdown[]; total: number }
  | { step: "done"; result: NewMapResult; byType: TypeBreakdown[]; total: number }
  | { step: "error"; message: string };

const DEFAULT_PERCENTAGE = 1;

export function RandomizerPanel({ felt }: Props) {
  const [pileTypes, setPileTypes] = useState<string[] | null>(null);
  const [percentagesByType, setPercentagesByType] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status>({ step: "idle" });
  const highlightLayerIdsRef = useRef<string[]>([]);
  const lastByTypeRef = useRef<TypeBreakdown[]>([]);
  const clientRef = useRef(new FeltClient(FELT_API_TOKEN));

  function setTypePercentage(type: string, value: number) {
    setPercentagesByType((prev) => ({ ...prev, [type]: value }));
  }

  async function handleLoadTypes() {
    if (!felt) return;
    const client = clientRef.current;

    try {
      setStatus({ step: "loading-types" });
      const fc = await exportLayer(client, SOURCE_MAP_ID, SOURCE_LAYER_ID);
      const types = getUniquePileTypes(fc);
      setPileTypes(types);

      const defaults: Record<string, number> = {};
      for (const t of types) defaults[t] = DEFAULT_PERCENTAGE;
      setPercentagesByType(defaults);

      setStatus({ step: "idle" });
    } catch (err) {
      setStatus({ step: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

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

      // 2. Apply any active filters so we only randomize visible features
      const layerFilters = await felt.getLayerFilters(SOURCE_LAYER_ID);
      const filtered = applyFilter(fc, layerFilters?.combined as unknown[] | null);

      // 3. Randomize each pile type independently
      setStatus({ step: "randomizing" });
      const { combined, byType } = randomizeByType(filtered, percentagesByType);
      lastByTypeRef.current = byType;

      // 4. Highlight on embedded map
      setStatus({ step: "highlighting" });
      const result = await felt.createLayersFromGeoJson({
        name: "Random selection by pile type",
        source: { type: "geoJsonData", data: combined as GeoJSON.FeatureCollection },
      });
      if (result) {
        highlightLayerIdsRef.current = result.layers.map((l) => l.id);
      }

      setStatus({
        step: "selected",
        byType,
        total: filtered.features.length,
      });
    } catch (err) {
      setStatus({ step: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleCreateMap() {
    const client = clientRef.current;
    const byType = lastByTypeRef.current;
    const total = status.step === "selected" ? status.total : 0;

    try {
      setStatus({ step: "creating-map", byType, total });
      const mapResult = await uploadToNewMap(
        client,
        byType,
        `Randomized by pile type — ${new Date().toLocaleString()}`,
      );

      setStatus({
        step: "done",
        result: mapResult,
        byType,
        total,
      });
    } catch (err) {
      setStatus({ step: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const randomizing =
    status.step === "exporting" ||
    status.step === "randomizing" ||
    status.step === "highlighting";

  const creatingMap = status.step === "creating-map";
  const busy = randomizing || creatingMap;

  const hasSelection =
    status.step === "selected" || status.step === "creating-map" || status.step === "done";

  const displayByType =
    status.step === "selected" || status.step === "creating-map" || status.step === "done"
      ? status.byType
      : null;
  const displayTotal =
    status.step === "selected" || status.step === "creating-map" || status.step === "done"
      ? status.total
      : 0;
  const selectedTotal = displayByType
    ? displayByType.reduce((sum, b) => sum + b.selected, 0)
    : 0;

  return (
    <div className="panel">
      <h1>Randomizer</h1>

      {pileTypes === null ? (
        <button onClick={handleLoadTypes} disabled={busy || !felt}>
          {status.step === "loading-types" ? "Loading…" : "Load Layer Data"}
        </button>
      ) : (
        <>
          <div className="pile-type-sliders">
            {pileTypes.map((type) => (
              <div key={type} className="pile-type-slider">
                <label>
                  {type}: <strong>{percentagesByType[type] ?? 0}%</strong>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={percentagesByType[type] ?? 0}
                  onChange={(e) => setTypePercentage(type, Number(e.target.value))}
                  disabled={busy}
                />
              </div>
            ))}
          </div>

          <button onClick={handleRandomize} disabled={busy || !felt}>
            {randomizing ? "Selecting…" : hasSelection ? "Re-Randomize" : "Randomize"}
          </button>
        </>
      )}

      {randomizing && (
        <>
          {status.step === "exporting" && <p className="status">Exporting layer data…</p>}
          {status.step === "randomizing" && <p className="status">Selecting random features…</p>}
          {status.step === "highlighting" && <p className="status">Highlighting on map…</p>}
        </>
      )}

      {status.step === "error" && <p className="error">Error: {status.message}</p>}

      {displayByType && (
        <div className="result">
          <p>
            Selected <strong>{selectedTotal}</strong> of {displayTotal} features
          </p>
          <ul className="type-breakdown">
            {displayByType.map((b) => (
              <li key={b.type}>
                {b.type}: <strong>{b.selected}</strong> of {b.total}
              </li>
            ))}
          </ul>

          {status.step === "selected" && (
            <button onClick={handleCreateMap} className="create-map-btn">
              Create New Map
            </button>
          )}

          {creatingMap && (
            <div className="spinner-row">
              <span className="spinner" />
              <span>Creating new map…</span>
            </div>
          )}

          {status.step === "done" && (
            <button
              className="open-map-btn"
              onClick={() => window.open(status.result.mapUrl, "_blank", "noopener,noreferrer")}
            >
              Open New Map
            </button>
          )}
        </div>
      )}
    </div>
  );
}
