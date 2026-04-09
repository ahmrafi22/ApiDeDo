import type {
  ApiRequest,
  Collection,
  History,
  Workspace,
} from "@/generated/prisma/client";
import type {
  ApiRequestRecord,
  CollectionRecord,
  HistoryRecord,
  WorkspaceDetails,
  WorkspaceSummary,
} from "@/lib/types/apidedo";
import { parseDraftFromDb, normalizeRequestDraft, normalizeVariables } from "@/lib/server/normalizers";

export function serializeWorkspaceSummary(workspace: Workspace): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export function serializeCollection(collection: Collection): CollectionRecord {
  return {
    id: collection.id,
    name: collection.name,
    workspaceId: collection.workspaceId,
    parentId: collection.parentId,
    sortOrder: collection.sortOrder,
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
  };
}

export function serializeApiRequest(request: ApiRequest): ApiRequestRecord {
  return {
    id: request.id,
    name: request.name,
    collectionId: request.collectionId,
    workspaceId: request.workspaceId,
    sortOrder: request.sortOrder,
    draft: parseDraftFromDb(request),
    lastDraft: request.lastDraft ? normalizeRequestDraft(request.lastDraft) : null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function serializeHistory(history: History): HistoryRecord {
  return {
    id: history.id,
    requestId: history.requestId ?? null,
    workspaceId: history.workspaceId,
    requestSnapshot: history.requestSnapshot as unknown as HistoryRecord["requestSnapshot"],
    responseSnapshot: history.responseSnapshot as unknown as HistoryRecord["responseSnapshot"],
    timestamp: history.timestamp.toISOString(),
  };
}

export function serializeWorkspaceDetails(params: {
  workspace: Workspace;
  collections: Collection[];
  requests: ApiRequest[];
}): WorkspaceDetails {
  const sortedCollections = [...params.collections].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const sortedRequests = [...params.requests].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return {
    id: params.workspace.id,
    name: params.workspace.name,
    variables: normalizeVariables(params.workspace.variables),
    collections: sortedCollections.map((collection) => serializeCollection(collection)),
    requests: sortedRequests.map((request) => serializeApiRequest(request)),
    updatedAt: params.workspace.updatedAt.toISOString(),
  };
}
