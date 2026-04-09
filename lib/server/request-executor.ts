import type {
  ApiRequestDraft,
  ExecuteResponse,
  RequestSnapshot,
  ResponseSnapshot,
  VariableMap,
} from "@/lib/types/apidedo";
import {
  applyPathVariables,
  buildPathVariableMap,
  interpolateTemplate,
  resolveEntryValue,
  resolveHeaders,
  resolveQueryParams,
} from "@/lib/server/variables";
import { runRequestScript } from "@/lib/server/scripts";

const MAX_STORED_RESPONSE_BYTES = 2_000_000;

function trimSlashes(value: string): string {
  return value.replace(/\/+$/g, "");
}

function joinBaseAndPath(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!baseUrl.trim()) {
    return normalizedPath;
  }

  return `${trimSlashes(baseUrl)}${normalizedPath}`;
}

function buildResolvedUrl(draft: ApiRequestDraft, variables: VariableMap): URL {
  const resolvedBase = interpolateTemplate(draft.baseUrl.trim(), variables);
  const pathVars = buildPathVariableMap(draft.pathVars, variables);
  const mergedVars = { ...variables, ...pathVars };

  const resolvedPath = applyPathVariables(
    interpolateTemplate(draft.path || "/", mergedVars),
    mergedVars,
  );
  const urlCandidate = joinBaseAndPath(resolvedBase, resolvedPath || "/");

  let finalUrl: URL;
  try {
    finalUrl = new URL(urlCandidate);
  } catch {
    throw new Error(
      "Unable to build request URL. Please provide a valid base URL or full URL path.",
    );
  }

  const queryParams = resolveQueryParams(draft.queryParams, mergedVars);
  queryParams.forEach((value, key) => {
    finalUrl.searchParams.append(key, value);
  });

  return finalUrl;
}

function ensureContentType(headers: Headers, contentType: string): void {
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
}

function serializeFormEntries(
  entries: ApiRequestDraft["body"]["formData"],
  variables: VariableMap,
): Array<[string, string]> {
  return entries
    .filter((entry) => entry.enabled && entry.key.trim())
    .map((entry) => [entry.key.trim(), resolveEntryValue(entry, variables)]);
}

function buildRequestBody(
  draft: ApiRequestDraft,
  variables: VariableMap,
  headers: Headers,
): { body: BodyInit | undefined; bodyPreview: string } {
  const mode = draft.body.mode;

  if (mode === "none") {
    return {
      body: undefined,
      bodyPreview: "",
    };
  }

  if (mode === "json") {
    const payload = interpolateTemplate(draft.body.json, variables);
    ensureContentType(headers, "application/json");
    return {
      body: payload,
      bodyPreview: payload.slice(0, 1000),
    };
  }

  if (mode === "raw" || mode === "xml" || mode === "html") {
    const payload = interpolateTemplate(draft.body.raw, variables);

    if (mode === "xml") {
      ensureContentType(headers, "application/xml");
    } else if (mode === "html") {
      ensureContentType(headers, "text/html");
    } else {
      ensureContentType(
        headers,
        draft.body.rawLanguage === "json"
          ? "application/json"
          : draft.body.rawLanguage === "xml"
            ? "application/xml"
            : draft.body.rawLanguage === "html"
              ? "text/html"
              : "text/plain",
      );
    }

    return {
      body: payload,
      bodyPreview: payload.slice(0, 1000),
    };
  }

  if (mode === "urlencoded") {
    const encoded = new URLSearchParams();
    for (const [key, value] of serializeFormEntries(draft.body.urlEncoded, variables)) {
      encoded.append(key, value);
    }

    ensureContentType(headers, "application/x-www-form-urlencoded");
    return {
      body: encoded,
      bodyPreview: encoded.toString().slice(0, 1000),
    };
  }

  if (mode === "form-data") {
    const formData = new FormData();
    const previewEntries: Array<[string, string]> = [];

    for (const [key, value] of serializeFormEntries(draft.body.formData, variables)) {
      formData.append(key, value);
      previewEntries.push([key, value]);
    }

    return {
      body: formData,
      bodyPreview: previewEntries
        .map(([key, value]) => `${key}=${value}`)
        .join("&")
        .slice(0, 1000),
    };
  }

  return {
    body: undefined,
    bodyPreview: "",
  };
}

function buildResponseSnapshot(params: {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Headers;
  bodyRaw: string;
  sizeBytes: number;
  bodyWasTruncated: boolean;
  error: string | null;
}): ResponseSnapshot {
  const contentType = params.headers.get("content-type") ?? "";
  let bodyJson: unknown | null = null;

  if (contentType.includes("application/json") && params.bodyRaw) {
    try {
      bodyJson = JSON.parse(params.bodyRaw);
    } catch {
      bodyJson = null;
    }
  }

  return {
    status: params.status,
    statusText: params.statusText,
    durationMs: params.durationMs,
    sizeBytes: params.sizeBytes,
    headers: Array.from(params.headers.entries()),
    bodyRaw: params.bodyRaw,
    bodyJson,
    bodyWasTruncated: params.bodyWasTruncated,
    error: params.error,
    timestamp: new Date().toISOString(),
  };
}

function toRequestSnapshot(
  draft: ApiRequestDraft,
  url: URL,
  headers: Headers,
  bodyPreview: string,
): RequestSnapshot {
  return {
    method: draft.method,
    url: url.toString(),
    headers: Array.from(headers.entries()),
    bodyPreview,
    timeoutMs: draft.timeoutMs,
    draft,
  };
}

function runScriptSafely(params: {
  script: string;
  variables: VariableMap;
  requestSnapshot: RequestSnapshot;
  responseSnapshot?: ResponseSnapshot;
  logs: string[];
}): VariableMap {
  try {
    const result = runRequestScript({
      script: params.script,
      variables: params.variables,
      request: {
        method: params.requestSnapshot.method,
        url: params.requestSnapshot.url,
        headers: params.requestSnapshot.headers,
        bodyPreview: params.requestSnapshot.bodyPreview,
      },
      response: params.responseSnapshot,
    });

    for (const line of result.logs) {
      params.logs.push(line);
    }

    return result.variables;
  } catch (error) {
    params.logs.push(
      `Script error: ${error instanceof Error ? error.message : "Unknown script error"}`,
    );
    return params.variables;
  }
}

export async function executeApiRequest(params: {
  draft: ApiRequestDraft;
  workspaceVariables: VariableMap;
}): Promise<Omit<ExecuteResponse, "history">> {
  const scriptLogs: string[] = [];

  const previewUrl = buildResolvedUrl(params.draft, params.workspaceVariables);
  const previewHeaders = resolveHeaders(params.draft.headers, params.workspaceVariables);
  const previewBody = buildRequestBody(params.draft, params.workspaceVariables, previewHeaders);
  const previewSnapshot = toRequestSnapshot(
    params.draft,
    previewUrl,
    previewHeaders,
    previewBody.bodyPreview,
  );

  let updatedVariables = runScriptSafely({
    script: params.draft.scripts.preRequest,
    variables: params.workspaceVariables,
    requestSnapshot: previewSnapshot,
    logs: scriptLogs,
  });

  const resolvedUrl = buildResolvedUrl(params.draft, updatedVariables);
  const headers = resolveHeaders(params.draft.headers, updatedVariables);
  const bodyInfo = buildRequestBody(params.draft, updatedVariables, headers);

  const requestSnapshot = toRequestSnapshot(
    params.draft,
    resolvedUrl,
    headers,
    bodyInfo.bodyPreview,
  );

  const timeout = Math.min(Math.max(params.draft.timeoutMs, 500), 120000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);
  const startedAt = performance.now();

  try {
    const response = await fetch(resolvedUrl, {
      method: params.draft.method,
      headers,
      body: bodyInfo.body,
      signal: controller.signal,
      redirect: "follow",
    });

    const responseText = await response.text();
    const responseByteSize = Buffer.byteLength(responseText, "utf8");
    const bodyWasTruncated = responseByteSize > MAX_STORED_RESPONSE_BYTES;
    const bodyRaw = bodyWasTruncated
      ? responseText.slice(0, MAX_STORED_RESPONSE_BYTES)
      : responseText;

    const responseSnapshot = buildResponseSnapshot({
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      headers: response.headers,
      bodyRaw,
      sizeBytes: responseByteSize,
      bodyWasTruncated,
      error: null,
    });

    updatedVariables = runScriptSafely({
      script: params.draft.scripts.postResponse,
      variables: updatedVariables,
      requestSnapshot,
      responseSnapshot,
      logs: scriptLogs,
    });

    return {
      requestSnapshot,
      responseSnapshot,
      updatedVariables,
      scriptLogs,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Request timed out after ${timeout}ms.`
          : error.message
        : "Request failed.";

    const responseSnapshot = buildResponseSnapshot({
      status: 0,
      statusText: "NETWORK_ERROR",
      durationMs: Math.round(performance.now() - startedAt),
      headers: new Headers(),
      bodyRaw: "",
      sizeBytes: 0,
      bodyWasTruncated: false,
      error: message,
    });

    return {
      requestSnapshot,
      responseSnapshot,
      updatedVariables,
      scriptLogs,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
