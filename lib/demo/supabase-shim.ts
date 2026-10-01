import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportJobRecord } from "@/lib/types/export";
import type { JobRecord } from "@/lib/types/project";
import type { Thumbnail } from "@/lib/types/thumbnail";
import type { VisualAsset } from "@/lib/types/visual";
import type { VoiceAsset } from "@/lib/types/voice";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { demoMediaPublicUrl, getDemoMedia, putDemoMedia } from "@/lib/demo/media-store";
import { getDemoStoreSnapshot, mutateDemoStore } from "@/lib/demo/store";

type TableName =
  | "projects"
  | "visual_assets"
  | "voice_assets"
  | "thumbnails"
  | "job_queue"
  | "export_jobs";

type Filter = { col: string; op: "eq" | "in"; val: unknown };

type QueryResult<T = Record<string, unknown>> = {
  data: T | T[] | null;
  error: { message: string } | null;
};

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function pickColumns<T extends Record<string, unknown>>(row: T, selectCols: string): T | Partial<T> {
  if (selectCols === "*") return row;
  const keys = selectCols.split(",").map((key) => key.trim());
  const picked: Partial<T> = {};
  for (const key of keys) {
    if (key in row) picked[key as keyof T] = row[key as keyof T];
  }
  return picked;
}

function matchesFilters(row: Record<string, unknown>, filters: Filter[]) {
  return filters.every((filter) => {
    const value = row[filter.col];
    if (filter.op === "eq") return value === filter.val;
    if (Array.isArray(filter.val)) return filter.val.includes(value);
    return false;
  });
}

function sortRows(rows: Record<string, unknown>[], col: string, ascending: boolean) {
  rows.sort((a, b) => {
    const left = a[col];
    const right = b[col];
    if (typeof left === "number" && typeof right === "number") {
      return ascending ? left - right : right - left;
    }
    return ascending
      ? String(left ?? "").localeCompare(String(right ?? ""))
      : String(right ?? "").localeCompare(String(left ?? ""));
  });
}

function readTableRows(table: TableName): Record<string, unknown>[] {
  const snapshot = getDemoStoreSnapshot();
  switch (table) {
    case "projects":
      return Array.from(snapshot.projects.values()) as Record<string, unknown>[];
    case "visual_assets":
      return Array.from(snapshot.visualAssets.values()).flat() as Record<string, unknown>[];
    case "voice_assets":
      return Array.from(snapshot.voiceAssets.values())
        .filter(Boolean)
        .map((row) => row as Record<string, unknown>);
    case "thumbnails":
      return Array.from(snapshot.thumbnails.values()).flat() as Record<string, unknown>[];
    case "job_queue":
      return Array.from(snapshot.jobs.values()) as Record<string, unknown>[];
    case "export_jobs":
      return Array.from(snapshot.exportJobs.values()) as Record<string, unknown>[];
    default:
      return [];
  }
}

class DemoQueryBuilder {
  private filters: Filter[] = [];
  private orderSpec: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private selectCols = "*";
  private mode: "select" | "delete" = "select";

  constructor(private table: TableName) {}

  select(cols: string) {
    this.selectCols = cols;
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }

  in(col: string, vals: unknown[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }

  order(col: string, opts: { ascending: boolean }) {
    this.orderSpec = { col, ascending: opts.ascending };
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  private runSelect(): QueryResult {
    let rows = readTableRows(this.table).filter((row) => matchesFilters(row, this.filters));
    if (this.orderSpec) sortRows(rows, this.orderSpec.col, this.orderSpec.ascending);
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    const mapped = rows.map((row) => pickColumns(row, this.selectCols));
    return { data: mapped, error: null };
  }

  private runDelete(): QueryResult {
    mutateDemoStore((state) => {
      if (this.table === "visual_assets") {
        for (const [projectId, assets] of state.visualAssets.entries()) {
          state.visualAssets.set(
            projectId,
            assets.filter((asset) => !matchesFilters(asset as Record<string, unknown>, this.filters))
          );
        }
        return;
      }
      if (this.table === "voice_assets") {
        for (const [projectId, asset] of state.voiceAssets.entries()) {
          if (asset && matchesFilters(asset as Record<string, unknown>, this.filters)) {
            state.voiceAssets.set(projectId, null);
          }
        }
        return;
      }
      if (this.table === "thumbnails") {
        for (const [projectId, rows] of state.thumbnails.entries()) {
          state.thumbnails.set(
            projectId,
            rows.filter((row) => !matchesFilters(row as Record<string, unknown>, this.filters))
          );
        }
      }
    });
    return { data: null, error: null };
  }

  async single(): Promise<QueryResult> {
    if (this.mode === "delete") {
      const result = this.runDelete();
      return { data: null, error: result.error };
    }
    const result = this.runSelect();
    const rows = Array.isArray(result.data) ? result.data : [];
    if (!rows.length) return { data: null, error: { message: "Row not found." } };
    if (rows.length > 1) return { data: null, error: { message: "Multiple rows returned." } };
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<QueryResult> {
    if (this.mode === "delete") return this.single();
    const result = this.runSelect();
    const rows = Array.isArray(result.data) ? result.data : [];
    return { data: rows[0] ?? null, error: null };
  }

  then(resolve: (value: QueryResult) => unknown) {
    const result = this.mode === "delete" ? this.runDelete() : this.runSelect();
    return Promise.resolve(result).then(resolve);
  }
}

class DemoInsertBuilder {
  constructor(
    private table: TableName,
    private rows: Record<string, unknown> | Record<string, unknown>[]
  ) {}

  private selectCols = "*";

  select(cols: string) {
    this.selectCols = cols;
    return this;
  }

  private runInsert(): QueryResult {
    const inputRows = Array.isArray(this.rows) ? this.rows : [this.rows];
    const inserted: Record<string, unknown>[] = [];

    mutateDemoStore((state) => {
      for (const row of inputRows) {
        if (this.table === "visual_assets") {
          const projectId = String(row.project_id);
          const asset: VisualAsset = {
            id: newId("demo-va"),
            project_id: projectId,
            type: (row.type as VisualAsset["type"]) ?? "image",
            prompt: (row.prompt as string | null) ?? null,
            url: (row.url as string | null) ?? null,
            scene_index: Number(row.scene_index ?? 0),
            scene_title: (row.scene_title as string | null) ?? null,
            scene_beat: (row.scene_beat as string | null) ?? null,
            mode: (row.mode as VisualAsset["mode"]) ?? "image",
            created_at: new Date().toISOString(),
          };
          const list = state.visualAssets.get(projectId) ?? [];
          list.push(asset);
          state.visualAssets.set(projectId, list);
          inserted.push(asset);
          continue;
        }

        if (this.table === "voice_assets") {
          const projectId = String(row.project_id);
          const asset: VoiceAsset = {
            id: newId("demo-voice"),
            project_id: projectId,
            audio_url: (row.audio_url as string | null) ?? null,
            voice_id: (row.voice_id as string | null) ?? null,
            duration_seconds: (row.duration_seconds as number | null) ?? null,
            word_timestamps_json: (row.word_timestamps_json as VoiceAsset["word_timestamps_json"]) ?? null,
            created_at: new Date().toISOString(),
          };
          state.voiceAssets.set(projectId, asset);
          inserted.push(asset);
          continue;
        }

        if (this.table === "thumbnails") {
          const projectId = String(row.project_id);
          const thumb: Thumbnail = {
            id: newId("demo-thumb"),
            project_id: projectId,
            url: (row.url as string | null) ?? null,
            prompt: (row.prompt as string | null) ?? null,
            headline: (row.headline as string | null) ?? null,
            overlay_json: (row.overlay_json as Thumbnail["overlay_json"]) ?? null,
            is_selected: Boolean(row.is_selected),
            created_at: new Date().toISOString(),
          };
          const list = state.thumbnails.get(projectId) ?? [];
          list.push(thumb);
          state.thumbnails.set(projectId, list);
          inserted.push(thumb);
          continue;
        }

        if (this.table === "job_queue") {
          const job: JobRecord = {
            id: newId("demo-job"),
            user_id: String(row.user_id ?? DEMO_USER_ID),
            project_id: (row.project_id as string | null) ?? null,
            type: String(row.type),
            payload: (row.payload as Record<string, unknown>) ?? {},
            status: (row.status as JobRecord["status"]) ?? "queued",
            progress: Number(row.progress ?? 0),
            error: (row.error as string | null) ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          state.jobs.set(job.id, job);
          inserted.push(job);
          continue;
        }

        if (this.table === "export_jobs") {
          const exportJob: ExportJobRecord = {
            id: newId("demo-export"),
            project_id: String(row.project_id),
            status: String(row.status ?? "queued"),
            progress: Number(row.progress ?? 0),
            output_url: (row.output_url as string | null) ?? null,
            created_at: new Date().toISOString(),
            completed_at: (row.completed_at as string | null) ?? null,
          };
          state.exportJobs.set(exportJob.id, exportJob);
          inserted.push(exportJob);
        }
      }
    });

    if (!inserted.length) return { data: null, error: { message: "Insert failed." } };
    const mapped = inserted.map((row) => pickColumns(row, this.selectCols));
    return { data: inserted.length === 1 ? mapped[0] : mapped, error: null };
  }

  async single(): Promise<QueryResult> {
    const result = this.runInsert();
    if (result.error) return result;
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return { data: row ?? null, error: null };
  }

  then(resolve: (value: QueryResult) => unknown) {
    return Promise.resolve(this.runInsert()).then(resolve);
  }
}

class DemoUpdateBuilder {
  private filters: Filter[] = [];
  private selectCols = "*";

  constructor(
    private table: TableName,
    private updates: Record<string, unknown>
  ) {}

  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }

  in(col: string, vals: unknown[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }

  select(cols: string) {
    this.selectCols = cols;
    return this;
  }

  private applyUpdates(): Record<string, unknown> | null {
    let updated: Record<string, unknown> | null = null;

    mutateDemoStore((state) => {
      if (this.table === "projects") {
        for (const project of state.projects.values()) {
          if (!matchesFilters(project as Record<string, unknown>, this.filters)) continue;
          Object.assign(project, this.updates, { updated_at: new Date().toISOString() });
          updated = project as Record<string, unknown>;
        }
        return;
      }

      if (this.table === "visual_assets") {
        for (const [projectId, assets] of state.visualAssets.entries()) {
          const next = assets.map((asset) => {
            if (!matchesFilters(asset as Record<string, unknown>, this.filters)) return asset;
            const merged = { ...asset, ...this.updates };
            updated = merged as Record<string, unknown>;
            return merged;
          });
          state.visualAssets.set(projectId, next);
        }
        return;
      }

      if (this.table === "voice_assets") {
        for (const [projectId, asset] of state.voiceAssets.entries()) {
          if (!asset || !matchesFilters(asset as Record<string, unknown>, this.filters)) continue;
          const merged = { ...asset, ...this.updates };
          state.voiceAssets.set(projectId, merged);
          updated = merged as Record<string, unknown>;
        }
        return;
      }

      if (this.table === "thumbnails") {
        for (const [projectId, rows] of state.thumbnails.entries()) {
          const next = rows.map((row) => {
            if (!matchesFilters(row as Record<string, unknown>, this.filters)) return row;
            const merged = { ...row, ...this.updates };
            updated = merged as Record<string, unknown>;
            return merged;
          });
          state.thumbnails.set(projectId, next);
        }
        return;
      }

      if (this.table === "job_queue") {
        for (const job of state.jobs.values()) {
          if (!matchesFilters(job as Record<string, unknown>, this.filters)) continue;
          Object.assign(job, this.updates, { updated_at: new Date().toISOString() });
          updated = job as Record<string, unknown>;
        }
        return;
      }

      if (this.table === "export_jobs") {
        for (const exportJob of state.exportJobs.values()) {
          if (!matchesFilters(exportJob as Record<string, unknown>, this.filters)) continue;
          Object.assign(exportJob, this.updates);
          updated = exportJob as Record<string, unknown>;
        }
      }
    });

    return updated;
  }

  async single(): Promise<QueryResult> {
    const row = this.applyUpdates();
    if (!row) return { data: null, error: { message: "Row not found." } };
    return { data: pickColumns(row, this.selectCols), error: null };
  }

  then(resolve: (value: QueryResult) => unknown) {
    this.applyUpdates();
    return Promise.resolve({ data: null, error: null }).then(resolve);
  }
}

class DemoTableBuilder {
  constructor(private table: TableName) {}

  select(cols: string) {
    return new DemoQueryBuilder(this.table).select(cols);
  }

  insert(row: Record<string, unknown> | Record<string, unknown>[]) {
    return new DemoInsertBuilder(this.table, row);
  }

  update(updates: Record<string, unknown>) {
    return new DemoUpdateBuilder(this.table, updates);
  }

  delete() {
    return new DemoQueryBuilder(this.table).delete();
  }
}

function demoStorageBucket(bucket: string) {
  return {
    upload: async (path: string, file: Buffer | Uint8Array, opts?: { contentType?: string }) => {
      const bytes = Buffer.isBuffer(file) ? file : Buffer.from(file);
      const contentType = opts?.contentType ?? "application/octet-stream";
      putDemoMedia(bucket, path, bytes, contentType);
      try {
        const { uploadRemoteMedia } = await import("@/lib/demo/remote-store");
        const remoteUrl = await uploadRemoteMedia(bucket, path, bytes, contentType);
        if (remoteUrl) {
          const { setDemoMediaRemoteUrl } = await import("@/lib/demo/media-store");
          setDemoMediaRemoteUrl(bucket, path, remoteUrl);
        }
      } catch {
        // data URLs / local paths still work for this request
      }
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: demoMediaPublicUrl(bucket, path) },
    }),
    download: async (path: string) => {
      const entry = getDemoMedia(bucket, path);
      if (!entry) return { data: null, error: { message: "Object not found." } };
      return { data: new Blob([entry.bytes], { type: entry.contentType }), error: null };
    },
  };
}

export function createDemoSupabaseClient(): SupabaseClient {
  return {
    from: (table: string) => new DemoTableBuilder(table as TableName),
    storage: {
      from: (bucket: string) => demoStorageBucket(bucket),
    },
  } as unknown as SupabaseClient;
}
