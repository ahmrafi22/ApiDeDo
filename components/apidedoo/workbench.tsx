"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  createCollection,
  createRequest,
  createWorkspace,
  downloadPostmanCollection,
  executeRequest,
  getRequestHistory,
  getWorkspace,
  importPostmanCollection,
  listWorkspaces,
  removeCollection,
  removeRequest,
  removeWorkspace,
  saveRequestDraft,
  updateCollection,
  updateRequest,
  updateWorkspace,
} from "@/lib/client/apidedo-api";
import { downloadBlob } from "@/lib/client/formatters";
import {
  DEFAULT_ACCENT_COLORS,
  makeDefaultRequestDraft,
  makeEntry,
  type ApiRequestDraft,
  type HistoryRecord,
  type WorkspaceDetails,
  type WorkspaceSummary,
} from "@/lib/types/apidedo";
import { RequestBuilder } from "@/components/apidedoo/request-builder";
import { ResponseViewer } from "@/components/apidedoo/response-viewer";
import { Sidebar, type VariableRow } from "@/components/apidedoo/sidebar";
import { ToastStack, type ToastItem } from "@/components/apidedoo/toast-stack";
import { TopBar } from "@/components/apidedoo/topbar";

const ACCENT_STORAGE_KEY = "apidedoo-accent";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function workspaceVariablesToRows(workspace: WorkspaceDetails | null): VariableRow[] {
  if (!workspace) {
    return [{ id: makeId("var"), key: "", value: "" }];
  }

  const entries = Object.entries(workspace.variables);
  if (entries.length === 0) {
    return [{ id: makeId("var"), key: "", value: "" }];
  }

  return entries.map(([key, value]) => ({
    id: makeId("var"),
    key,
    value,
  }));
}

function rowsToVariableMap(rows: VariableRow[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }

    output[key] = row.value;
  }

  return output;
}

function requestBelongsToCollection(
  workspace: WorkspaceDetails,
  requestId: string | null,
  collectionId: string | null,
): boolean {
  if (!requestId || !collectionId) {
    return false;
  }

  const request = workspace.requests.find((candidate) => candidate.id === requestId);
  return request?.collectionId === collectionId;
}

function isDescendantCollection(
  collections: WorkspaceDetails["collections"],
  rootCollectionId: string,
  candidateCollectionId: string,
): boolean {
  if (rootCollectionId === candidateCollectionId) {
    return true;
  }

  const queue = [rootCollectionId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const collection of collections) {
      if (collection.parentId !== current) {
        continue;
      }

      if (collection.id === candidateCollectionId) {
        return true;
      }

      queue.push(collection.id);
    }
  }

  return false;
}

type ActiveModalState =
  | {
      kind: "create-workspace";
      name: string;
    }
  | {
      kind: "rename-collection";
      collectionId: string;
      name: string;
    }
  | {
      kind: "delete-workspace";
    }
  | {
      kind: "delete-collection";
      collectionId: string;
      name: string;
    }
  | {
      kind: "delete-request";
      requestId: string;
      name: string;
    }
  | null;

export function ApiDeDooWorkbench() {
  const [isBooting, setIsBooting] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDetails | null>(null);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");

  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestNameDraft, setRequestNameDraft] = useState("");
  const [requestDraft, setRequestDraft] = useState<ApiRequestDraft | null>(null);

  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [latestResponse, setLatestResponse] = useState<HistoryRecord["responseSnapshot"] | null>(null);
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);

  const [variableRows, setVariableRows] = useState<VariableRow[]>([{ id: makeId("var"), key: "", value: "" }]);

  const [isSavingRequest, setIsSavingRequest] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSavingVariables, setIsSavingVariables] = useState(false);
  const [hasUnsavedRequestChanges, setHasUnsavedRequestChanges] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModalState>(null);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [isModalMounted, setIsModalMounted] = useState(false);

  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT_COLORS[0]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((message: string, tone: ToastItem["tone"] = "info") => {
    setToasts((current) => [...current, { id: makeId("toast"), message, tone }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const selectedRequest = useMemo(() => {
    if (!workspace || !selectedRequestId) {
      return null;
    }

    return workspace.requests.find((request) => request.id === selectedRequestId) ?? null;
  }, [workspace, selectedRequestId]);

  const syncWorkspaceSummary = useCallback((nextWorkspace: WorkspaceDetails) => {
    setWorkspaces((current) => {
      const existing = current.find((workspaceItem) => workspaceItem.id === nextWorkspace.id);
      const nextSummary: WorkspaceSummary = {
        id: nextWorkspace.id,
        name: nextWorkspace.name,
        updatedAt: nextWorkspace.updatedAt,
      };

      if (!existing) {
        return [nextSummary, ...current];
      }

      return current.map((workspaceItem) =>
        workspaceItem.id === nextWorkspace.id ? nextSummary : workspaceItem,
      );
    });
  }, []);

  const hydrateWorkspace = useCallback(
    (
      nextWorkspace: WorkspaceDetails,
      options?: {
        preferredCollectionId?: string | null;
        preferredRequestId?: string | null;
      },
    ) => {
      setWorkspace(nextWorkspace);
      setWorkspaceNameDraft(nextWorkspace.name);
      setVariableRows(workspaceVariablesToRows(nextWorkspace));

      const nextCollectionId =
        options?.preferredCollectionId &&
        nextWorkspace.collections.some((item) => item.id === options.preferredCollectionId)
          ? options.preferredCollectionId
          : nextWorkspace.collections[0]?.id ?? null;

      const nextRequestIdFromOptions =
        options?.preferredRequestId &&
        nextWorkspace.requests.some((item) => item.id === options.preferredRequestId)
          ? options.preferredRequestId
          : null;

      const nextRequestId =
        nextRequestIdFromOptions ??
        nextWorkspace.requests.find((request) => request.collectionId === nextCollectionId)?.id ??
        nextWorkspace.requests[0]?.id ??
        null;

      setSelectedCollectionId(nextCollectionId);
      setSelectedRequestId(nextRequestId);
      syncWorkspaceSummary(nextWorkspace);
    },
    [syncWorkspaceSummary],
  );

  const loadWorkspace = useCallback(
    async (
      workspaceId: string,
      options?: {
        preferredCollectionId?: string | null;
        preferredRequestId?: string | null;
      },
    ) => {
      const payload = await getWorkspace(workspaceId);
      setActiveWorkspaceId(workspaceId);
      hydrateWorkspace(payload, options);
    },
    [hydrateWorkspace],
  );

  const refreshHistory = useCallback(
    async (requestId: string | null) => {
      if (!requestId) {
        setHistory([]);
        return;
      }

      try {
        const payload = await getRequestHistory(requestId);
        setHistory(payload);
      } catch (error) {
        pushToast(
          error instanceof Error ? error.message : "Could not load request history.",
          "error",
        );
      }
    },
    [pushToast],
  );

  useEffect(() => {
    const cachedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    if (cachedAccent && DEFAULT_ACCENT_COLORS.includes(cachedAccent as (typeof DEFAULT_ACCENT_COLORS)[number])) {
      setAccentColor(cachedAccent);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent-color", accentColor);
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accentColor);
  }, [accentColor]);

  useEffect(() => {
    setIsModalMounted(true);
  }, []);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeModal]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isModalSubmitting) {
        return;
      }

      setActiveModal(null);
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeModal, isModalSubmitting]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const workspaceList = await listWorkspaces();

        if (!isMounted) {
          return;
        }

        if (workspaceList.length === 0) {
          const created = await createWorkspace("Team Workspace");
          if (!isMounted) {
            return;
          }

          setWorkspaces([
            {
              id: created.id,
              name: created.name,
              updatedAt: created.updatedAt,
            },
          ]);
          setActiveWorkspaceId(created.id);
          hydrateWorkspace(created);
          pushToast("Created default workspace.", "success");
        } else {
          setWorkspaces(workspaceList);
          await loadWorkspace(workspaceList[0].id);
        }
      } catch (error) {
        if (isMounted) {
          pushToast(error instanceof Error ? error.message : "Unable to load workspace data.", "error");
        }
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [hydrateWorkspace, loadWorkspace, pushToast]);

  useEffect(() => {
    if (!selectedRequest) {
      setRequestNameDraft("");
      setRequestDraft(null);
      setHistory([]);
      return;
    }

    setRequestNameDraft(selectedRequest.name);
    setRequestDraft(selectedRequest.lastDraft ?? selectedRequest.draft);
    setHasUnsavedRequestChanges(false);
    void refreshHistory(selectedRequest.id);
  }, [refreshHistory, selectedRequest]);

  useEffect(() => {
    if (!selectedRequestId || !requestDraft || !hasUnsavedRequestChanges) {
      return;
    }

    const timeoutHandle = window.setTimeout(() => {
      void saveRequestDraft(selectedRequestId, requestDraft).catch(() => {
        // Autosave errors are non-blocking.
      });
    }, 900);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [hasUnsavedRequestChanges, requestDraft, selectedRequestId]);

  const openCreateWorkspaceModal = useCallback(() => {
    setActiveModal({
      kind: "create-workspace",
      name: `Workspace ${workspaces.length + 1}`,
    });
  }, [workspaces.length]);

  const closeActiveModal = useCallback(() => {
    if (isModalSubmitting) {
      return;
    }

    setActiveModal(null);
  }, [isModalSubmitting]);

  const updateActiveModalName = useCallback((nextName: string) => {
    setActiveModal((current) => {
      if (!current) {
        return null;
      }

      if (current.kind === "create-workspace" || current.kind === "rename-collection") {
        return {
          ...current,
          name: nextName,
        };
      }

      return current;
    });
  }, []);

  const handleDeleteWorkspace = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }

    setActiveModal({ kind: "delete-workspace" });
  }, [activeWorkspaceId]);

  const handleWorkspaceNameCommit = useCallback(async () => {
    if (!activeWorkspaceId || !workspace) {
      return;
    }

    const trimmed = workspaceNameDraft.trim();
    if (!trimmed || trimmed === workspace.name) {
      setWorkspaceNameDraft(workspace.name);
      return;
    }

    try {
      const updated = await updateWorkspace(activeWorkspaceId, { name: trimmed });
      hydrateWorkspace(updated, {
        preferredCollectionId: selectedCollectionId,
        preferredRequestId: selectedRequestId,
      });
      pushToast("Workspace name updated.", "success");
    } catch (error) {
      setWorkspaceNameDraft(workspace.name);
      pushToast(error instanceof Error ? error.message : "Failed to rename workspace.", "error");
    }
  }, [
    activeWorkspaceId,
    hydrateWorkspace,
    pushToast,
    selectedCollectionId,
    selectedRequestId,
    workspace,
    workspaceNameDraft,
  ]);

  const handleCreateCollection = useCallback(
    async (parentId: string | null) => {
      if (!activeWorkspaceId) {
        return;
      }

      try {
        const created = await createCollection({
          workspaceId: activeWorkspaceId,
          parentId,
          name: "New Folder",
        });

        await loadWorkspace(activeWorkspaceId, {
          preferredCollectionId: created.id,
        });
        pushToast("Collection created.", "success");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Failed to create collection.", "error");
      }
    },
    [activeWorkspaceId, loadWorkspace, pushToast],
  );

  const handleRenameCollection = useCallback(
    (collectionId: string) => {
      if (!workspace) {
        return;
      }

      const target = workspace.collections.find((collection) => collection.id === collectionId);
      if (!target) {
        return;
      }

      setActiveModal({
        kind: "rename-collection",
        collectionId,
        name: target.name,
      });
    },
    [workspace],
  );

  const handleDeleteCollection = useCallback(
    (collectionId: string) => {
      if (!workspace) {
        return;
      }

      const target = workspace.collections.find((collection) => collection.id === collectionId);
      if (!target) {
        return;
      }

      setActiveModal({
        kind: "delete-collection",
        collectionId,
        name: target.name,
      });
    },
    [workspace],
  );

  const handleCreateRequest = useCallback(
    async (collectionId: string) => {
      if (!workspace) {
        return;
      }

      try {
        const baseDraft = makeDefaultRequestDraft();
        const created = await createRequest({
          collectionId,
          name: `${baseDraft.method} ${baseDraft.path}`,
          draft: baseDraft,
        });

        await loadWorkspace(workspace.id, {
          preferredCollectionId: collectionId,
          preferredRequestId: created.id,
        });
        pushToast("Request created.", "success");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Failed to create request.", "error");
      }
    },
    [loadWorkspace, pushToast, workspace],
  );

  const handleDeleteRequest = useCallback(
    (requestId: string) => {
      if (!workspace) {
        return;
      }

      const target = workspace.requests.find((request) => request.id === requestId);
      if (!target) {
        return;
      }

      setActiveModal({
        kind: "delete-request",
        requestId,
        name: target.name,
      });
    },
    [workspace],
  );

  const confirmActiveModal = useCallback(async () => {
    if (!activeModal || isModalSubmitting) {
      return;
    }

    setIsModalSubmitting(true);
    try {
      if (activeModal.kind === "create-workspace") {
        const trimmedName = activeModal.name.trim();
        if (!trimmedName) {
          pushToast("Workspace name is required.", "error");
          return;
        }

        const created = await createWorkspace(trimmedName);
        setActiveWorkspaceId(created.id);
        hydrateWorkspace(created);
        pushToast("Workspace created.", "success");
        setActiveModal(null);
        return;
      }

      if (activeModal.kind === "rename-collection") {
        if (!workspace) {
          setActiveModal(null);
          return;
        }

        const trimmedName = activeModal.name.trim();
        if (!trimmedName) {
          pushToast("Collection name is required.", "error");
          return;
        }

        await updateCollection(activeModal.collectionId, { name: trimmedName });
        await loadWorkspace(workspace.id, {
          preferredCollectionId: activeModal.collectionId,
          preferredRequestId: selectedRequestId,
        });
        pushToast("Collection renamed.", "success");
        setActiveModal(null);
        return;
      }

      if (activeModal.kind === "delete-workspace") {
        if (!activeWorkspaceId) {
          setActiveModal(null);
          return;
        }

        await removeWorkspace(activeWorkspaceId);
        const nextWorkspaces = workspaces.filter((entry) => entry.id !== activeWorkspaceId);
        setWorkspaces(nextWorkspaces);

        if (nextWorkspaces.length === 0) {
          const created = await createWorkspace("Team Workspace");
          setWorkspaces([{ id: created.id, name: created.name, updatedAt: created.updatedAt }]);
          setActiveWorkspaceId(created.id);
          hydrateWorkspace(created);
        } else {
          await loadWorkspace(nextWorkspaces[0].id);
        }

        pushToast("Workspace deleted.", "success");
        setActiveModal(null);
        return;
      }

      if (activeModal.kind === "delete-collection") {
        if (!workspace) {
          setActiveModal(null);
          return;
        }

        await removeCollection(activeModal.collectionId);
        await loadWorkspace(workspace.id);
        pushToast("Collection deleted.", "success");
        setActiveModal(null);
        return;
      }

      if (activeModal.kind === "delete-request") {
        if (!workspace) {
          setActiveModal(null);
          return;
        }

        await removeRequest(activeModal.requestId);
        await loadWorkspace(workspace.id, {
          preferredCollectionId: selectedCollectionId,
        });
        setLatestResponse(null);
        setScriptLogs([]);
        pushToast("Request deleted.", "success");
        setActiveModal(null);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unable to complete the action.", "error");
    } finally {
      setIsModalSubmitting(false);
    }
  }, [
    activeModal,
    activeWorkspaceId,
    hydrateWorkspace,
    isModalSubmitting,
    loadWorkspace,
    pushToast,
    selectedCollectionId,
    selectedRequestId,
    workspace,
    workspaces,
  ]);

  const handleMoveCollection = useCallback(
    async (collectionId: string, targetParentId: string | null) => {
      if (!workspace) {
        return;
      }

      const sourceCollection = workspace.collections.find((collection) => collection.id === collectionId);
      if (!sourceCollection) {
        return;
      }

      if (sourceCollection.parentId === targetParentId) {
        return;
      }

      if (
        targetParentId &&
        isDescendantCollection(workspace.collections, collectionId, targetParentId)
      ) {
        pushToast("Cannot move a folder inside itself.", "error");
        return;
      }

      const nextSortOrder = workspace.collections.filter((collection) => {
        if (collection.id === collectionId) {
          return false;
        }

        return (collection.parentId ?? null) === (targetParentId ?? null);
      }).length;

      try {
        await updateCollection(collectionId, {
          parentId: targetParentId,
          sortOrder: nextSortOrder,
        });

        await loadWorkspace(workspace.id, {
          preferredCollectionId: collectionId,
          preferredRequestId: selectedRequestId,
        });
        pushToast("Folder moved.", "success");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Failed to move folder.", "error");
      }
    },
    [loadWorkspace, pushToast, selectedRequestId, workspace],
  );

  const handleMoveRequest = useCallback(
    async (requestId: string, targetCollectionId: string) => {
      if (!workspace) {
        return;
      }

      const requestRecord = workspace.requests.find((request) => request.id === requestId);
      if (!requestRecord) {
        return;
      }

      if (requestRecord.collectionId === targetCollectionId) {
        return;
      }

      const targetCollection = workspace.collections.find((collection) => collection.id === targetCollectionId);
      if (!targetCollection) {
        return;
      }

      const draftForMove =
        requestRecord.id === selectedRequestId && requestDraft
          ? requestDraft
          : requestRecord.lastDraft ?? requestRecord.draft;

      const nextSortOrder = workspace.requests.filter(
        (request) => request.collectionId === targetCollectionId && request.id !== requestId,
      ).length;

      try {
        await updateRequest({
          requestId,
          collectionId: targetCollectionId,
          sortOrder: nextSortOrder,
          name: requestRecord.name,
          draft: draftForMove,
        });

        await loadWorkspace(workspace.id, {
          preferredCollectionId: targetCollectionId,
          preferredRequestId: requestId,
        });
        pushToast("Request moved.", "success");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Failed to move request.", "error");
      }
    },
    [loadWorkspace, pushToast, requestDraft, selectedRequestId, workspace],
  );

  const handleSaveRequest = useCallback(async () => {
    if (!selectedRequestId || !requestDraft || !workspace) {
      return;
    }

    setIsSavingRequest(true);
    try {
      await updateRequest({
        requestId: selectedRequestId,
        name: requestNameDraft.trim() || `${requestDraft.method} ${requestDraft.path}`,
        draft: requestDraft,
      });

      await loadWorkspace(workspace.id, {
        preferredCollectionId: selectedCollectionId,
        preferredRequestId: selectedRequestId,
      });
      setHasUnsavedRequestChanges(false);
      pushToast("Request saved.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to save request.", "error");
    } finally {
      setIsSavingRequest(false);
    }
  }, [
    loadWorkspace,
    pushToast,
    requestDraft,
    requestNameDraft,
    selectedCollectionId,
    selectedRequestId,
    workspace,
  ]);

  const handleExecuteRequest = useCallback(
    async (draftOverride?: ApiRequestDraft) => {
      if (!selectedRequestId || !requestDraft) {
        return;
      }

      setIsExecuting(true);
      try {
        const payload = await executeRequest({
          requestId: selectedRequestId,
          draft: draftOverride ?? requestDraft,
          persistDraft: true,
        });

        setLatestResponse(payload.responseSnapshot);
        setHistory((current) => [payload.history, ...current.filter((entry) => entry.id !== payload.history.id)]);
        setScriptLogs(payload.scriptLogs);

        if (workspace && JSON.stringify(workspace.variables) !== JSON.stringify(payload.updatedVariables)) {
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  variables: payload.updatedVariables,
                }
              : current,
          );
          setVariableRows(workspaceVariablesToRows({ ...workspace, variables: payload.updatedVariables }));
        }

        if (payload.responseSnapshot.error) {
          pushToast(payload.responseSnapshot.error, "error");
        } else {
          pushToast(`Request completed: ${payload.responseSnapshot.status}`, "success");
        }
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Failed to execute request.", "error");
      } finally {
        setIsExecuting(false);
      }
    },
    [pushToast, requestDraft, selectedRequestId, workspace],
  );

  const handleInjectAuthHeader = useCallback(() => {
    if (!requestDraft) {
      return;
    }

    const existing = requestDraft.headers.find((header) =>
      header.key.toLowerCase() === "authorization",
    );

    const nextHeaders = existing
      ? requestDraft.headers.map((header) =>
          header.id === existing.id
            ? {
                ...header,
                value: "Bearer {{authToken}}",
                enabled: true,
                source: "literal" as const,
              }
            : header,
        )
      : [
          ...requestDraft.headers,
          makeEntry({
            key: "Authorization",
            value: "Bearer {{authToken}}",
            source: "literal",
          }),
        ];

    setRequestDraft({
      ...requestDraft,
      headers: nextHeaders,
    });
    setHasUnsavedRequestChanges(true);
    pushToast("Bearer header inserted.", "info");
  }, [pushToast, requestDraft]);

  const handleSaveVariables = useCallback(async () => {
    if (!activeWorkspaceId || !workspace) {
      return;
    }

    setIsSavingVariables(true);
    try {
      const updated = await updateWorkspace(activeWorkspaceId, {
        variables: rowsToVariableMap(variableRows),
      });

      hydrateWorkspace(updated, {
        preferredCollectionId: selectedCollectionId,
        preferredRequestId: selectedRequestId,
      });
      pushToast("Workspace variables saved.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to save variables.", "error");
    } finally {
      setIsSavingVariables(false);
    }
  }, [
    activeWorkspaceId,
    hydrateWorkspace,
    pushToast,
    selectedCollectionId,
    selectedRequestId,
    variableRows,
    workspace,
  ]);

  const handleImportPostman = useCallback(
    async (file: File) => {
      if (!activeWorkspaceId) {
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const payload = await importPostmanCollection(activeWorkspaceId, parsed);

        hydrateWorkspace(payload.workspace);
        pushToast(
          `Imported ${payload.summary.requestsCreated} requests from Postman JSON.`,
          "success",
        );
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "Failed to import Postman data.", "error");
      }
    },
    [activeWorkspaceId, hydrateWorkspace, pushToast],
  );

  const handleExportPostman = useCallback(async () => {
    if (!activeWorkspaceId || !workspace) {
      return;
    }

    try {
      const blob = await downloadPostmanCollection(activeWorkspaceId);
      const fileName = `${workspace.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || "workspace"}-postman.json`;
      downloadBlob(blob, fileName);
      pushToast("Exported Postman-compatible JSON.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to export workspace.", "error");
    }
  }, [activeWorkspaceId, pushToast, workspace]);

  const handleWorkspaceSwitch = useCallback(
    (workspaceId: string) => {
      if (!workspaceId || workspaceId === activeWorkspaceId) {
        return;
      }

      void loadWorkspace(workspaceId);
    },
    [activeWorkspaceId, loadWorkspace],
  );

  if (isBooting) {
    return (
      <div className="app-loading-shell">
        <div className="loader-orb" />
        <p>Loading ApiDeDoo workspace...</p>
      </div>
    );
  }

  const modalTitle =
    activeModal?.kind === "create-workspace"
      ? "Create Workspace"
      : activeModal?.kind === "rename-collection"
        ? "Rename Collection"
        : activeModal?.kind === "delete-workspace"
          ? "Delete Workspace"
          : activeModal?.kind === "delete-collection"
            ? "Delete Collection"
            : activeModal?.kind === "delete-request"
              ? "Delete Request"
              : "";

  const modalSubtitle =
    activeModal?.kind === "create-workspace"
      ? "Set up a clear workspace name before continuing."
      : activeModal?.kind === "rename-collection"
        ? "Update this folder name for your team workspace."
        : activeModal?.kind === "delete-workspace"
          ? "This action permanently removes all collections, requests, and history."
          : activeModal?.kind === "delete-collection"
            ? `\"${activeModal.name}\" and everything inside it will be removed.`
            : activeModal?.kind === "delete-request"
              ? `\"${activeModal.name}\" and its execution history will be removed.`
              : "";

  const modalConfirmLabel =
    activeModal?.kind === "create-workspace"
      ? "Create Workspace"
      : activeModal?.kind === "rename-collection"
        ? "Save Name"
        : "Delete";

  const modalIsDanger =
    activeModal?.kind === "delete-workspace" ||
    activeModal?.kind === "delete-collection" ||
    activeModal?.kind === "delete-request";

  const modalHasInput =
    activeModal?.kind === "create-workspace" || activeModal?.kind === "rename-collection";

  const modalInputLabel =
    activeModal?.kind === "create-workspace" ? "Workspace name" : "Collection name";

  const modalInputValue =
    activeModal?.kind === "create-workspace" || activeModal?.kind === "rename-collection"
      ? activeModal.name
      : "";

  const activeModalPortal =
    activeModal && isModalMounted
      ? createPortal(
          <div className="modal-backdrop" onMouseDown={closeActiveModal} role="presentation">
            <form
              className="modal-card"
              data-variant={modalIsDanger ? "danger" : "default"}
              role="dialog"
              aria-modal="true"
              aria-labelledby="active-modal-title"
              aria-describedby="active-modal-subtitle"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                void confirmActiveModal();
              }}
            >
              <h2 id="active-modal-title" className="modal-title">
                {modalTitle}
              </h2>
              <p id="active-modal-subtitle" className="modal-subtitle">
                {modalSubtitle}
              </p>

              {modalHasInput ? (
                <div className="modal-field">
                  <label className="modal-label" htmlFor="active-modal-input">
                    {modalInputLabel}
                  </label>
                  <input
                    id="active-modal-input"
                    className="input-text"
                    value={modalInputValue}
                    onChange={(event) => updateActiveModalName(event.target.value)}
                    placeholder={modalInputLabel}
                    autoFocus
                  />
                  <p className="modal-help">Use a short, descriptive name.</p>
                </div>
              ) : (
                <p className="modal-copy">This change cannot be undone.</p>
              )}

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closeActiveModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`primary-button ${modalIsDanger ? "danger" : ""}`}
                  disabled={isModalSubmitting}
                >
                  {isModalSubmitting ? "Working..." : modalConfirmLabel}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="apidedoo-root">
      <div className="desktop-only-warning">
        <h1>ApiDeDoo is desktop-only for now.</h1>
        <p>Please open this app on a larger screen.</p>
      </div>

      <div className="desktop-shell">
        <TopBar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          workspaceName={workspaceNameDraft}
          accentColor={accentColor}
          accentPalette={DEFAULT_ACCENT_COLORS}
          canSaveRequest={Boolean(selectedRequestId && requestDraft)}
          hasUnsavedChanges={hasUnsavedRequestChanges}
          isSaving={isSavingRequest}
          onCreateWorkspace={openCreateWorkspaceModal}
          onDeleteWorkspace={handleDeleteWorkspace}
          onWorkspaceSelect={handleWorkspaceSwitch}
          onWorkspaceNameChange={setWorkspaceNameDraft}
          onWorkspaceNameCommit={handleWorkspaceNameCommit}
          onAccentColorChange={setAccentColor}
          onSaveRequest={handleSaveRequest}
          onImportPostman={handleImportPostman}
          onExportPostman={handleExportPostman}
        />

        <main className="main-grid">
          <Sidebar
            workspace={workspace}
            selectedCollectionId={selectedCollectionId}
            selectedRequestId={selectedRequestId}
            variableRows={variableRows}
            isSavingVariables={isSavingVariables}
            onSelectCollection={(collectionId) => {
              setSelectedCollectionId(collectionId);
              if (workspace && !requestBelongsToCollection(workspace, selectedRequestId, collectionId)) {
                const nextRequest = workspace.requests.find(
                  (request) => request.collectionId === collectionId,
                );
                setSelectedRequestId(nextRequest?.id ?? null);
              }
            }}
            onSelectRequest={(requestId) => {
              setSelectedRequestId(requestId);
              if (workspace) {
                const ownerRequest = workspace.requests.find((request) => request.id === requestId);
                setSelectedCollectionId(ownerRequest?.collectionId ?? null);
              }
            }}
            onCreateCollection={handleCreateCollection}
            onRenameCollection={handleRenameCollection}
            onDeleteCollection={handleDeleteCollection}
            onCreateRequest={handleCreateRequest}
            onDeleteRequest={handleDeleteRequest}
            onMoveCollection={handleMoveCollection}
            onMoveRequest={handleMoveRequest}
            onVariableChange={(id, field, value) =>
              setVariableRows((current) =>
                current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
              )
            }
            onAddVariable={() =>
              setVariableRows((current) => [...current, { id: makeId("var"), key: "", value: "" }])
            }
            onRemoveVariable={(id) =>
              setVariableRows((current) => {
                const nextRows = current.filter((row) => row.id !== id);
                return nextRows.length > 0
                  ? nextRows
                  : [{ id: makeId("var"), key: "", value: "" }];
              })
            }
            onSaveVariables={handleSaveVariables}
          />

          <RequestBuilder
            requestName={requestNameDraft}
            requestDraft={requestDraft}
            isExecuting={isExecuting}
            isSaving={isSavingRequest}
            onNameChange={(name) => {
              setRequestNameDraft(name);
              setHasUnsavedRequestChanges(true);
            }}
            onDraftChange={(draft) => {
              setRequestDraft(draft);
              setHasUnsavedRequestChanges(true);
            }}
            onExecute={() => void handleExecuteRequest()}
            onSave={() => void handleSaveRequest()}
            onInjectAuthHeader={handleInjectAuthHeader}
          />

          <ResponseViewer
            response={latestResponse}
            history={history}
            scriptLogs={scriptLogs}
            onUseHistoryDraft={(historyEntry) => {
              setRequestDraft(historyEntry.requestSnapshot.draft);
              setLatestResponse(historyEntry.responseSnapshot);
              setHasUnsavedRequestChanges(true);
              pushToast("History snapshot loaded into editor.", "info");
            }}
            onRunHistory={(historyEntry) => {
              setRequestDraft(historyEntry.requestSnapshot.draft);
              setHasUnsavedRequestChanges(true);
              void handleExecuteRequest(historyEntry.requestSnapshot.draft);
            }}
          />
        </main>
      </div>

      {activeModalPortal}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
