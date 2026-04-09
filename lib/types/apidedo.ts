export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type EntrySource = "literal" | "variable";
export type BodyMode =
  | "none"
  | "json"
  | "raw"
  | "form-data"
  | "urlencoded"
  | "xml"
  | "html";

export interface KeyValueEntry {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  source: EntrySource;
  description?: string;
  type?: "text" | "file";
}

export interface RequestBodyConfig {
  mode: BodyMode;
  json: string;
  raw: string;
  formData: KeyValueEntry[];
  urlEncoded: KeyValueEntry[];
  rawLanguage: "text" | "json" | "xml" | "html";
}

export interface RequestScripts {
  preRequest: string;
  postResponse: string;
}

export interface ApiRequestDraft {
  method: HttpMethod;
  baseUrl: string;
  path: string;
  pathVars: KeyValueEntry[];
  queryParams: KeyValueEntry[];
  headers: KeyValueEntry[];
  body: RequestBodyConfig;
  scripts: RequestScripts;
  timeoutMs: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface WorkspaceDetails {
  id: string;
  name: string;
  variables: VariableMap;
  collections: CollectionRecord[];
  requests: ApiRequestRecord[];
  updatedAt: string;
}

export interface CollectionRecord {
  id: string;
  name: string;
  workspaceId: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiRequestRecord {
  id: string;
  name: string;
  collectionId: string;
  workspaceId: string;
  sortOrder: number;
  draft: ApiRequestDraft;
  lastDraft: ApiRequestDraft | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestSnapshot {
  method: HttpMethod;
  url: string;
  headers: Array<[string, string]>;
  bodyPreview: string;
  timeoutMs: number;
  draft: ApiRequestDraft;
}

export interface ResponseSnapshot {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Array<[string, string]>;
  bodyRaw: string;
  bodyJson: unknown | null;
  bodyWasTruncated: boolean;
  error: string | null;
  timestamp: string;
}

export interface HistoryRecord {
  id: string;
  requestId: string | null;
  workspaceId: string;
  requestSnapshot: RequestSnapshot;
  responseSnapshot: ResponseSnapshot;
  timestamp: string;
}

export interface ExecuteResponse {
  requestSnapshot: RequestSnapshot;
  responseSnapshot: ResponseSnapshot;
  history: HistoryRecord;
  updatedVariables: VariableMap;
  scriptLogs: string[];
}

export interface PostmanImportSummary {
  collectionsCreated: number;
  requestsCreated: number;
}

export type VariableMap = Record<string, string>;

export const DEFAULT_ACCENT_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#22c55e",
  "#ef4444",
  "#0ea5e9",
  "#a855f7",
  "#f97316",
] as const;

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

export function makeEntry(partial?: Partial<KeyValueEntry>): KeyValueEntry {
  return {
    id: partial?.id ?? newId("kv"),
    key: partial?.key ?? "",
    value: partial?.value ?? "",
    enabled: partial?.enabled ?? true,
    source: partial?.source ?? "literal",
    description: partial?.description,
    type: partial?.type ?? "text",
  };
}

export function makeDefaultRequestDraft(): ApiRequestDraft {
  return {
    method: "GET",
    baseUrl: "",
    path: "/",
    pathVars: [makeEntry()],
    queryParams: [makeEntry()],
    headers: [makeEntry()],
    body: {
      mode: "none",
      json: "{\n  \n}",
      raw: "",
      formData: [makeEntry()],
      urlEncoded: [makeEntry()],
      rawLanguage: "text",
    },
    scripts: {
      preRequest: "",
      postResponse: "",
    },
    timeoutMs: 30000,
  };
}
