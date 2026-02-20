const isDev = import.meta.env.DEV;

// In dev, Felt API requests go through Vite proxy to avoid CORS.
// In production (GitHub Pages), they go direct.
const BASE_URL = isDev ? "/felt-api/v2" : "https://felt.com/api/v2";

/** Wrap an external URL through the dev proxy if needed */
export function proxyUrl(url: string): string {
  return isDev ? `/proxy-external?url=${encodeURIComponent(url)}` : url;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export interface FeltMap {
  id: string;
  title: string;
  url: string;
  [key: string]: unknown;
}

export interface FeltLayer {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

export interface ExportLinkResponse {
  export_link: string;
}

export interface UploadResponse {
  layer_id: string;
  layer_group_id: string;
  url: string;
  presigned_attributes: Record<string, string>;
  [key: string]: unknown;
}

export class FeltClient {
  private token: string;

  constructor(apiToken: string) {
    if (!apiToken) throw new Error("API token is required");
    this.token = apiToken;
  }

  async request<T = unknown>(path: string, { method = "GET", body, query }: RequestOptions = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`, window.location.origin);
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v != null) url.searchParams.set(k, v);
      });
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Felt API ${method} ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) return null as T;
    return res.json();
  }

  createMap(params: { title?: string } = {}): Promise<FeltMap> {
    return this.request("/maps", { method: "POST", body: params });
  }

  getLayer(mapId: string, layerId: string): Promise<FeltLayer> {
    return this.request(`/maps/${mapId}/layers/${layerId}`);
  }

  getExportLink(mapId: string, layerId: string): Promise<ExportLinkResponse> {
    return this.request(`/maps/${mapId}/layers/${layerId}/get_export_link`);
  }

  createCustomExport(mapId: string, layerId: string, params: { output_format: string }): Promise<{ export_request_id: string }> {
    return this.request(`/maps/${mapId}/layers/${layerId}/custom_export`, { method: "POST", body: params });
  }

  getCustomExportStatus(mapId: string, layerId: string, exportId: string): Promise<{ status: string; download_url?: string }> {
    return this.request(`/maps/${mapId}/layers/${layerId}/custom_exports/${exportId}`);
  }

  async waitForExport(mapId: string, layerId: string, exportId: string, { timeoutMs = 60000, pollMs = 2000 } = {}): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.getCustomExportStatus(mapId, layerId, exportId);
      if (result.status === "completed" && result.download_url) return result.download_url;
      if (result.status === "failed") throw new Error(`Export ${exportId} failed`);
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`Export timed out after ${timeoutMs}ms`);
  }

  async uploadFile(mapId: string, file: Blob, name: string): Promise<UploadResponse> {
    // Step 1: Request presigned upload credentials from Felt
    const upload: UploadResponse = await this.request(`/maps/${mapId}/upload`, {
      method: "POST",
      body: { name },
    });

    // Step 2: POST the file directly to S3 using presigned attributes
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.presigned_attributes)) {
      form.append(key, value);
    }
    form.append("file", file, name);

    const s3Res = await fetch(proxyUrl(upload.url), { method: "POST", body: form });
    if (!s3Res.ok && s3Res.status !== 204) {
      const text = await s3Res.text();
      throw new Error(`S3 presigned upload failed (${s3Res.status}): ${text}`);
    }

    return upload;
  }

  async waitForLayer(mapId: string, layerId: string, { timeoutMs = 60000, pollMs = 2000 } = {}): Promise<FeltLayer> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const layer = await this.getLayer(mapId, layerId);
      if (layer.status === "completed") return layer;
      if (layer.status === "failed") throw new Error(`Layer ${layerId} processing failed`);
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`Layer ${layerId} processing timed out after ${timeoutMs}ms`);
  }
}
