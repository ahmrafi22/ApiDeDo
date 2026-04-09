import {
  makeEntry,
  type ApiRequestRecord,
  type CollectionRecord,
  type VariableMap,
} from "@/lib/types/apidedo";
import { normalizeRequestDraft } from "@/lib/server/normalizers";

interface ParsedPostmanRequest {
  name: string;
  draft: ReturnType<typeof normalizeRequestDraft>;
}

export interface ParsedPostmanFolder {
  name: string;
  folders: ParsedPostmanFolder[];
  requests: ParsedPostmanRequest[];
}

export interface ParsedPostmanDocument {
  name: string;
  variables: VariableMap;
  root: ParsedPostmanFolder;
}

type PostmanRequestLike = {
  method?: unknown;
  header?: unknown;
  url?: unknown;
  body?: unknown;
};

type PostmanEventLike = {
  listen?: unknown;
  script?: {
    exec?: unknown;
  };
};

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function parseVariables(rawVariables: unknown): VariableMap {
  if (!Array.isArray(rawVariables)) {
    return {};
  }

  const output: VariableMap = {};
  for (const item of rawVariables) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const key = asString((item as { key?: unknown }).key).trim();
    if (!key) {
      continue;
    }

    output[key] = asString((item as { value?: unknown }).value);
  }

  return output;
}

function parseHeaders(rawHeaders: unknown) {
  if (!Array.isArray(rawHeaders)) {
    return [makeEntry()];
  }

  const output = rawHeaders.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return makeEntry();
    }

    return makeEntry({
      key: asString((item as { key?: unknown }).key),
      value: asString((item as { value?: unknown }).value),
      enabled: !(item as { disabled?: unknown }).disabled,
      source: "literal",
    });
  });

  return output.length > 0 ? output : [makeEntry()];
}

function parseUrl(rawUrl: unknown): {
  baseUrl: string;
  path: string;
  queryParams: ReturnType<typeof makeEntry>[];
  pathVars: ReturnType<typeof makeEntry>[];
} {
  const fallback = {
    baseUrl: "",
    path: "/",
    queryParams: [makeEntry()],
    pathVars: [makeEntry()],
  };

  if (!rawUrl) {
    return fallback;
  }

  if (typeof rawUrl === "string") {
    try {
      const parsed = new URL(rawUrl);
      return {
        baseUrl: `${parsed.protocol}//${parsed.host}`,
        path: parsed.pathname || "/",
        queryParams:
          Array.from(parsed.searchParams.entries()).map(([key, value]) =>
            makeEntry({ key, value }),
          ) || [makeEntry()],
        pathVars: [makeEntry()],
      };
    } catch {
      return {
        ...fallback,
        path: rawUrl,
      };
    }
  }

  if (typeof rawUrl !== "object" || Array.isArray(rawUrl)) {
    return fallback;
  }

  const urlObject = rawUrl as {
    raw?: unknown;
    protocol?: unknown;
    host?: unknown;
    path?: unknown;
    query?: unknown;
    variable?: unknown;
  };

  const queryParams = Array.isArray(urlObject.query)
    ? urlObject.query.map((queryItem) => {
        if (!queryItem || typeof queryItem !== "object" || Array.isArray(queryItem)) {
          return makeEntry();
        }

        return makeEntry({
          key: asString((queryItem as { key?: unknown }).key),
          value: asString((queryItem as { value?: unknown }).value),
          enabled: !(queryItem as { disabled?: unknown }).disabled,
        });
      })
    : [makeEntry()];

  const pathVars = Array.isArray(urlObject.variable)
    ? urlObject.variable.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return makeEntry();
        }

        return makeEntry({
          key: asString((item as { key?: unknown }).key),
          value: asString((item as { value?: unknown }).value),
        });
      })
    : [makeEntry()];

  let baseUrl = "";
  let path = "/";

  const host = Array.isArray(urlObject.host)
    ? urlObject.host.map((part) => asString(part)).join(".")
    : asString(urlObject.host);

  if (host) {
    const protocol = asString(urlObject.protocol, "https");
    baseUrl = `${protocol}://${host}`;
  }

  if (Array.isArray(urlObject.path) && urlObject.path.length > 0) {
    path = `/${urlObject.path.map((part) => asString(part)).join("/")}`;
  } else if (typeof urlObject.path === "string") {
    path = urlObject.path.startsWith("/") ? urlObject.path : `/${urlObject.path}`;
  } else {
    const raw = asString(urlObject.raw);
    if (raw) {
      try {
        const parsed = new URL(raw);
        baseUrl = `${parsed.protocol}//${parsed.host}`;
        path = parsed.pathname || "/";
      } catch {
        path = raw;
      }
    }
  }

  return {
    baseUrl,
    path,
    queryParams: queryParams.length > 0 ? queryParams : [makeEntry()],
    pathVars: pathVars.length > 0 ? pathVars : [makeEntry()],
  };
}

function parseBody(rawBody: unknown) {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return {
      mode: "none",
      json: "{\n  \n}",
      raw: "",
      formData: [makeEntry()],
      urlEncoded: [makeEntry()],
      rawLanguage: "text",
    } as const;
  }

  const body = rawBody as {
    mode?: unknown;
    raw?: unknown;
    options?: {
      raw?: {
        language?: unknown;
      };
    };
    formdata?: unknown;
    urlencoded?: unknown;
  };
  const mode = asString(body.mode, "none");

  if (mode === "raw") {
    const rawValue = asString(body.raw);
    const language = asString(body.options?.raw?.language, "text");

    if (language === "json") {
      return {
        mode: "json",
        json: rawValue || "{\n  \n}",
        raw: rawValue,
        formData: [makeEntry()],
        urlEncoded: [makeEntry()],
        rawLanguage: "json",
      } as const;
    }

    return {
      mode: "raw",
      json: "{\n  \n}",
      raw: rawValue,
      formData: [makeEntry()],
      urlEncoded: [makeEntry()],
      rawLanguage:
        language === "xml" || language === "html" || language === "json"
          ? language
          : "text",
    } as const;
  }

  if (mode === "formdata") {
    const formData = Array.isArray(body.formdata)
      ? body.formdata.map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return makeEntry();
          }

          return makeEntry({
            key: asString((entry as { key?: unknown }).key),
            value: asString((entry as { value?: unknown }).value),
            enabled: !(entry as { disabled?: unknown }).disabled,
            type: asString((entry as { type?: unknown }).type) === "file" ? "file" : "text",
          });
        })
      : [makeEntry()];

    return {
      mode: "form-data",
      json: "{\n  \n}",
      raw: "",
      formData: formData.length > 0 ? formData : [makeEntry()],
      urlEncoded: [makeEntry()],
      rawLanguage: "text",
    } as const;
  }

  if (mode === "urlencoded") {
    const urlEncoded = Array.isArray(body.urlencoded)
      ? body.urlencoded.map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return makeEntry();
          }

          return makeEntry({
            key: asString((entry as { key?: unknown }).key),
            value: asString((entry as { value?: unknown }).value),
            enabled: !(entry as { disabled?: unknown }).disabled,
          });
        })
      : [makeEntry()];

    return {
      mode: "urlencoded",
      json: "{\n  \n}",
      raw: "",
      formData: [makeEntry()],
      urlEncoded: urlEncoded.length > 0 ? urlEncoded : [makeEntry()],
      rawLanguage: "text",
    } as const;
  }

  return {
    mode: "none",
    json: "{\n  \n}",
    raw: "",
    formData: [makeEntry()],
    urlEncoded: [makeEntry()],
    rawLanguage: "text",
  } as const;
}

function parseScripts(rawEvents: unknown): { preRequest: string; postResponse: string } {
  if (!Array.isArray(rawEvents)) {
    return { preRequest: "", postResponse: "" };
  }

  let preRequest = "";
  let postResponse = "";

  for (const rawEvent of rawEvents) {
    const event = rawEvent as PostmanEventLike;
    const listen = asString(event.listen);
    const exec = Array.isArray(event.script?.exec)
      ? event.script.exec.map((line) => asString(line)).join("\n")
      : "";

    if (!exec.trim()) {
      continue;
    }

    if (listen === "prerequest") {
      preRequest = exec;
    }

    if (listen === "test") {
      postResponse = exec;
    }
  }

  return {
    preRequest,
    postResponse,
  };
}

function parseRequestItem(item: Record<string, unknown>): ParsedPostmanRequest {
  const requestObject = item.request as PostmanRequestLike;
  const parsedUrl = parseUrl(requestObject?.url);
  const scripts = parseScripts(item.event);

  const draft = normalizeRequestDraft({
    method: asString(requestObject?.method, "GET").toUpperCase(),
    baseUrl: parsedUrl.baseUrl,
    path: parsedUrl.path,
    headers: parseHeaders(requestObject?.header),
    queryParams: parsedUrl.queryParams,
    pathVars: parsedUrl.pathVars,
    body: parseBody(requestObject?.body),
    scripts,
    timeoutMs: 30000,
  });

  return {
    name: asString(item.name, "Untitled Request"),
    draft,
  };
}

function parseFolderNode(node: Record<string, unknown>): ParsedPostmanFolder {
  const folder: ParsedPostmanFolder = {
    name: asString(node.name, "Folder"),
    folders: [],
    requests: [],
  };

  const items = Array.isArray(node.item) ? node.item : [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const objectItem = item as Record<string, unknown>;

    if (Array.isArray(objectItem.item)) {
      folder.folders.push(parseFolderNode(objectItem));
      continue;
    }

    if (objectItem.request) {
      folder.requests.push(parseRequestItem(objectItem));
    }
  }

  return folder;
}

export function parsePostmanCollection(payload: unknown): ParsedPostmanDocument {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid Postman payload.");
  }

  const document = payload as {
    info?: {
      name?: unknown;
    };
    variable?: unknown;
    item?: unknown;
  };

  if (!Array.isArray(document.item)) {
    throw new Error("Postman payload must include an item array.");
  }

  const root: ParsedPostmanFolder = {
    name: asString(document.info?.name, "Imported Collection"),
    folders: [],
    requests: [],
  };

  for (const child of document.item) {
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      continue;
    }

    const childNode = child as Record<string, unknown>;
    if (Array.isArray(childNode.item)) {
      root.folders.push(parseFolderNode(childNode));
      continue;
    }

    if (childNode.request) {
      root.requests.push(parseRequestItem(childNode));
    }
  }

  return {
    name: root.name,
    variables: parseVariables(document.variable),
    root,
  };
}

function toPostmanRequestBody(draft: ApiRequestRecord["draft"]) {
  if (draft.body.mode === "none") {
    return undefined;
  }

  if (draft.body.mode === "json") {
    return {
      mode: "raw",
      raw: draft.body.json,
      options: {
        raw: {
          language: "json",
        },
      },
    };
  }

  if (draft.body.mode === "form-data") {
    return {
      mode: "formdata",
      formdata: draft.body.formData.map((entry) => ({
        key: entry.key,
        value: entry.value,
        type: entry.type === "file" ? "file" : "text",
        disabled: !entry.enabled,
      })),
    };
  }

  if (draft.body.mode === "urlencoded") {
    return {
      mode: "urlencoded",
      urlencoded: draft.body.urlEncoded.map((entry) => ({
        key: entry.key,
        value: entry.value,
        disabled: !entry.enabled,
      })),
    };
  }

  return {
    mode: "raw",
    raw: draft.body.raw,
    options: {
      raw: {
        language: draft.body.rawLanguage,
      },
    },
  };
}

function toPostmanUrl(draft: ApiRequestRecord["draft"]) {
  const base = draft.baseUrl || "{{base_url}}";
  const normalizedPath = draft.path.startsWith("/") ? draft.path : `/${draft.path}`;
  const rawUrl = `${base}${normalizedPath}`;

  return {
    raw: rawUrl,
    query: draft.queryParams.map((entry) => ({
      key: entry.key,
      value: entry.value,
      disabled: !entry.enabled,
    })),
    variable: draft.pathVars.map((entry) => ({
      key: entry.key,
      value: entry.value,
    })),
  };
}

function toPostmanRequest(record: ApiRequestRecord) {
  const events = [] as Array<{
    listen: string;
    script: {
      type: string;
      exec: string[];
    };
  }>;

  if (record.draft.scripts.preRequest.trim()) {
    events.push({
      listen: "prerequest",
      script: {
        type: "text/javascript",
        exec: record.draft.scripts.preRequest.split("\n"),
      },
    });
  }

  if (record.draft.scripts.postResponse.trim()) {
    events.push({
      listen: "test",
      script: {
        type: "text/javascript",
        exec: record.draft.scripts.postResponse.split("\n"),
      },
    });
  }

  return {
    name: record.name,
    request: {
      method: record.draft.method,
      header: record.draft.headers.map((header) => ({
        key: header.key,
        value: header.value,
        disabled: !header.enabled,
      })),
      url: toPostmanUrl(record.draft),
      body: toPostmanRequestBody(record.draft),
    },
    event: events,
  };
}

interface CollectionNode {
  id: string;
  name: string;
  children: CollectionNode[];
  requests: ApiRequestRecord[];
}

function buildCollectionNodeTree(
  collections: CollectionRecord[],
  requests: ApiRequestRecord[],
): CollectionNode[] {
  const nodeMap = new Map<string, CollectionNode>();
  const roots: CollectionNode[] = [];

  for (const collection of collections) {
    nodeMap.set(collection.id, {
      id: collection.id,
      name: collection.name,
      children: [],
      requests: [],
    });
  }

  for (const request of requests) {
    const owner = nodeMap.get(request.collectionId);
    if (owner) {
      owner.requests.push(request);
    }
  }

  const sortedCollections = [...collections].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });

  for (const collection of sortedCollections) {
    const current = nodeMap.get(collection.id);
    if (!current) {
      continue;
    }

    if (collection.parentId) {
      const parent = nodeMap.get(collection.parentId);
      if (parent) {
        parent.children.push(current);
      } else {
        roots.push(current);
      }
    } else {
      roots.push(current);
    }
  }

  return roots;
}

function toPostmanItems(nodes: CollectionNode[]): unknown[] {
  return nodes.map((node) => {
    const requestItems = node.requests.map((request) => toPostmanRequest(request));
    const folderItems = toPostmanItems(node.children);

    return {
      name: node.name,
      item: [...folderItems, ...requestItems],
    };
  });
}

export function buildPostmanCollectionExport(params: {
  workspaceName: string;
  variables: VariableMap;
  collections: CollectionRecord[];
  requests: ApiRequestRecord[];
}) {
  const collectionNodes = buildCollectionNodeTree(params.collections, params.requests);

  return {
    info: {
      name: params.workspaceName,
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: Object.entries(params.variables).map(([key, value]) => ({
      key,
      value,
      type: "string",
    })),
    item: toPostmanItems(collectionNodes),
  };
}
