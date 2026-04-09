import {
  HTTP_METHODS,
  type ApiRequestDraft,
  type BodyMode,
  type KeyValueEntry,
  type RequestBodyConfig,
  type RequestScripts,
  type VariableMap,
  makeDefaultRequestDraft,
  makeEntry,
} from "@/lib/types/apidedo";

const VALID_METHODS = new Set<string>(HTTP_METHODS);
const VALID_MODES = new Set<BodyMode>([
  "none",
  "json",
  "raw",
  "form-data",
  "urlencoded",
  "xml",
  "html",
]);
const VALID_LANGUAGES = new Set(["text", "json", "xml", "html"]);

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function asBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function asNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (typeof min === "number" && parsed < min) {
    return min;
  }

  if (typeof max === "number" && parsed > max) {
    return max;
  }

  return parsed;
}

export function normalizeVariables(value: unknown): VariableMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output: VariableMap = {};
  for (const [key, raw] of Object.entries(value)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      continue;
    }

    output[trimmedKey] = asString(raw);
  }

  return output;
}

export function normalizeEntries(value: unknown): KeyValueEntry[] {
  if (!Array.isArray(value)) {
    return [makeEntry()];
  }

  const entries: KeyValueEntry[] = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return makeEntry();
    }

    return makeEntry({
      id: asString((item as { id?: unknown }).id),
      key: asString((item as { key?: unknown }).key),
      value: asString((item as { value?: unknown }).value),
      enabled: asBoolean((item as { enabled?: unknown }).enabled, true),
      source:
        (item as { source?: unknown }).source === "variable" ? "variable" : "literal",
      description: asString((item as { description?: unknown }).description, ""),
      type: (item as { type?: unknown }).type === "file" ? "file" : "text",
    });
  });

  if (entries.length === 0) {
    return [makeEntry()];
  }

  return entries;
}

export function normalizeBody(value: unknown): RequestBodyConfig {
  const base = makeDefaultRequestDraft().body;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return base;
  }

  const modeCandidate = asString((value as { mode?: unknown }).mode, "none") as BodyMode;
  const mode: BodyMode = VALID_MODES.has(modeCandidate) ? modeCandidate : "none";
  const rawLanguageCandidate = asString(
    (value as { rawLanguage?: unknown }).rawLanguage,
    "text",
  );

  return {
    mode,
    json: asString((value as { json?: unknown }).json, base.json),
    raw: asString((value as { raw?: unknown }).raw, base.raw),
    formData: normalizeEntries((value as { formData?: unknown }).formData),
    urlEncoded: normalizeEntries((value as { urlEncoded?: unknown }).urlEncoded),
    rawLanguage: VALID_LANGUAGES.has(rawLanguageCandidate)
      ? (rawLanguageCandidate as RequestBodyConfig["rawLanguage"])
      : "text",
  };
}

export function normalizeScripts(value: unknown): RequestScripts {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      preRequest: "",
      postResponse: "",
    };
  }

  return {
    preRequest: asString((value as { preRequest?: unknown }).preRequest),
    postResponse: asString((value as { postResponse?: unknown }).postResponse),
  };
}

export function normalizeRequestDraft(value: unknown): ApiRequestDraft {
  const base = makeDefaultRequestDraft();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return base;
  }

  const methodCandidate = asString((value as { method?: unknown }).method, "GET").toUpperCase();

  return {
    method: VALID_METHODS.has(methodCandidate) ? (methodCandidate as ApiRequestDraft["method"]) : "GET",
    baseUrl: asString((value as { baseUrl?: unknown }).baseUrl),
    path: asString((value as { path?: unknown }).path, "/") || "/",
    pathVars: normalizeEntries((value as { pathVars?: unknown }).pathVars),
    queryParams: normalizeEntries((value as { queryParams?: unknown }).queryParams),
    headers: normalizeEntries((value as { headers?: unknown }).headers),
    body: normalizeBody((value as { body?: unknown }).body),
    scripts: normalizeScripts((value as { scripts?: unknown }).scripts),
    timeoutMs: asNumber((value as { timeoutMs?: unknown }).timeoutMs, 30000, 500, 120000),
  };
}

export function parseDraftFromDb(entity: {
  method: string;
  baseUrl: string | null;
  path: string;
  pathVars: unknown;
  queryParams: unknown;
  headers: unknown;
  body: unknown;
  scripts: unknown;
  timeoutMs: number;
}): ApiRequestDraft {
  return normalizeRequestDraft({
    method: entity.method,
    baseUrl: entity.baseUrl ?? "",
    path: entity.path,
    pathVars: entity.pathVars,
    queryParams: entity.queryParams,
    headers: entity.headers,
    body: entity.body,
    scripts: entity.scripts,
    timeoutMs: entity.timeoutMs,
  });
}
