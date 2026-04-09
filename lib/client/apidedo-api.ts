import type {
  ApiRequestDraft,
  ApiRequestRecord,
  CollectionRecord,
  ExecuteResponse,
  HistoryRecord,
  WorkspaceDetails,
  WorkspaceSummary,
} from "@/lib/types/apidedo";

interface JsonError {
  error?: string;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let payload: JsonError | null = null;
    try {
      payload = (await response.json()) as JsonError;
    } catch {
      payload = null;
    }

    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const payload = await requestJson<{ workspaces: WorkspaceSummary[] }>("/api/workspaces");
  return payload.workspaces;
}

export async function createWorkspace(name: string): Promise<WorkspaceDetails> {
  const payload = await requestJson<{ workspace: WorkspaceDetails }>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name, variables: {} }),
  });

  return payload.workspace;
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceDetails> {
  const payload = await requestJson<{ workspace: WorkspaceDetails }>(
    `/api/workspaces/${workspaceId}`,
  );
  return payload.workspace;
}

export async function updateWorkspace(
  workspaceId: string,
  updates: { name?: string; variables?: Record<string, string> },
): Promise<WorkspaceDetails> {
  const payload = await requestJson<{ workspace: WorkspaceDetails }>(
    `/api/workspaces/${workspaceId}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );

  return payload.workspace;
}

export async function removeWorkspace(workspaceId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
}

export async function createCollection(params: {
  workspaceId: string;
  name: string;
  parentId?: string | null;
}): Promise<CollectionRecord> {
  const payload = await requestJson<{ collection: CollectionRecord }>(
    `/api/workspaces/${params.workspaceId}/collections`,
    {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        parentId: params.parentId ?? null,
      }),
    },
  );

  return payload.collection;
}

export async function updateCollection(
  collectionId: string,
  updates: {
    name?: string;
    parentId?: string | null;
    sortOrder?: number;
  },
): Promise<CollectionRecord> {
  const payload = await requestJson<{ collection: CollectionRecord }>(
    `/api/collections/${collectionId}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );

  return payload.collection;
}

export async function removeCollection(collectionId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/collections/${collectionId}`, {
    method: "DELETE",
  });
}

export async function createRequest(params: {
  collectionId: string;
  name: string;
  draft: ApiRequestDraft;
}): Promise<ApiRequestRecord> {
  const payload = await requestJson<{ request: ApiRequestRecord }>(
    `/api/collections/${params.collectionId}/requests`,
    {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        draft: params.draft,
      }),
    },
  );

  return payload.request;
}

export async function updateRequest(params: {
  requestId: string;
  name?: string;
  draft?: ApiRequestDraft;
  collectionId?: string;
  sortOrder?: number;
}): Promise<ApiRequestRecord> {
  const payload = await requestJson<{ request: ApiRequestRecord }>(
    `/api/requests/${params.requestId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: params.name,
        draft: params.draft,
        collectionId: params.collectionId,
        sortOrder: params.sortOrder,
      }),
    },
  );

  return payload.request;
}

export async function removeRequest(requestId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/requests/${requestId}`, {
    method: "DELETE",
  });
}

export async function saveRequestDraft(
  requestId: string,
  draft: ApiRequestDraft,
): Promise<ApiRequestRecord> {
  const payload = await requestJson<{ request: ApiRequestRecord }>(
    `/api/requests/${requestId}/draft`,
    {
      method: "PATCH",
      body: JSON.stringify({ draft }),
    },
  );

  return payload.request;
}

export async function executeRequest(params: {
  requestId: string;
  draft: ApiRequestDraft;
  persistDraft?: boolean;
}): Promise<ExecuteResponse> {
  return requestJson<ExecuteResponse>(`/api/requests/${params.requestId}/execute`, {
    method: "POST",
    body: JSON.stringify({
      draft: params.draft,
      persistDraft: params.persistDraft ?? false,
    }),
  });
}

export async function getRequestHistory(requestId: string): Promise<HistoryRecord[]> {
  const payload = await requestJson<{ history: HistoryRecord[] }>(
    `/api/requests/${requestId}/history?limit=40`,
  );

  return payload.history;
}

export async function importPostmanCollection(
  workspaceId: string,
  payload: unknown,
): Promise<{
  summary: {
    collectionsCreated: number;
    requestsCreated: number;
  };
  workspace: WorkspaceDetails;
}> {
  return requestJson(`/api/workspaces/${workspaceId}/import/postman`, {
    method: "POST",
    body: JSON.stringify({ payload }),
  });
}

export async function downloadPostmanCollection(workspaceId: string): Promise<Blob> {
  const response = await fetch(`/api/workspaces/${workspaceId}/export/postman`);
  if (!response.ok) {
    let message = `Export failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as JsonError;
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore parse issues and keep generic message.
    }

    throw new Error(message);
  }

  return response.blob();
}
