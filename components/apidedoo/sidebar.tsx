"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import type {
  ApiRequestRecord,
  CollectionRecord,
  WorkspaceDetails,
} from "@/lib/types/apidedo";

const DRAG_PAYLOAD_MIME = "application/x-apidedoo-drag-payload";

type DragPayload =
  | {
      type: "collection";
      collectionId: string;
    }
  | {
      type: "request";
      requestId: string;
    };

function setDragPayload(event: DragEvent, payload: DragPayload): void {
  const serialized = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_PAYLOAD_MIME, serialized);
  event.dataTransfer.setData("text/plain", serialized);
}

function readDragPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_PAYLOAD_MIME) || event.dataTransfer.getData("text/plain");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    if (parsed.type === "collection" && typeof parsed.collectionId === "string") {
      return {
        type: "collection",
        collectionId: parsed.collectionId,
      };
    }

    if (parsed.type === "request" && typeof parsed.requestId === "string") {
      return {
        type: "request",
        requestId: parsed.requestId,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export interface VariableRow {
  id: string;
  key: string;
  value: string;
}

interface CollectionNode {
  id: string;
  name: string;
  parentId: string | null;
  children: CollectionNode[];
  requests: ApiRequestRecord[];
}

function buildCollectionTree(
  collections: CollectionRecord[],
  requests: ApiRequestRecord[],
): CollectionNode[] {
  const map = new Map<string, CollectionNode>();
  const roots: CollectionNode[] = [];

  for (const collection of collections) {
    map.set(collection.id, {
      id: collection.id,
      name: collection.name,
      parentId: collection.parentId,
      children: [],
      requests: [],
    });
  }

  for (const request of requests) {
    const owner = map.get(request.collectionId);
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
    const node = map.get(collection.id);
    if (!node) {
      continue;
    }

    if (collection.parentId) {
      const parent = map.get(collection.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  for (const node of map.values()) {
    node.requests.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  return roots;
}

interface SidebarProps {
  workspace: WorkspaceDetails | null;
  selectedCollectionId: string | null;
  selectedRequestId: string | null;
  variableRows: VariableRow[];
  isSavingVariables: boolean;
  onSelectCollection: (collectionId: string) => void;
  onSelectRequest: (requestId: string) => void;
  onCreateCollection: (parentId: string | null) => void;
  onRenameCollection: (collectionId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onCreateRequest: (collectionId: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onMoveCollection: (collectionId: string, targetParentId: string | null) => void;
  onMoveRequest: (requestId: string, targetCollectionId: string) => void;
  onVariableChange: (id: string, field: "key" | "value", value: string) => void;
  onAddVariable: () => void;
  onRemoveVariable: (id: string) => void;
  onSaveVariables: () => void;
}

interface CollectionItemProps {
  node: CollectionNode;
  depth: number;
  selectedCollectionId: string | null;
  selectedRequestId: string | null;
  onSelectCollection: (collectionId: string) => void;
  onSelectRequest: (requestId: string) => void;
  onCreateCollection: (parentId: string | null) => void;
  onRenameCollection: (collectionId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onCreateRequest: (collectionId: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onMoveCollection: (collectionId: string, targetParentId: string | null) => void;
  onMoveRequest: (requestId: string, targetCollectionId: string) => void;
  dropTargetKey: string | null;
  openMenuKey: string | null;
  onOpenMenu: (key: string | null) => void;
  onCloseMenu: () => void;
  onHoverTarget: (key: string) => void;
  onClearHover: () => void;
}

interface RowMenuItem {
  id: string;
  label: string;
  tone?: "default" | "danger";
  onSelect: () => void;
}

interface RowActionMenuProps {
  buttonLabel: string;
  menuLabel: string;
  isOpen: boolean;
  items: RowMenuItem[];
  onToggle: () => void;
  onClose: () => void;
}

function RowActionMenu({
  buttonLabel,
  menuLabel,
  isOpen,
  items,
  onToggle,
  onClose,
}: RowActionMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  return (
    <div className="row-menu" ref={menuRef}>
      <button
        type="button"
        className="mini-action row-menu-trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={buttonLabel}
      >
        ...
      </button>

      {isOpen ? (
        <div className="row-menu-popover" role="menu" aria-label={menuLabel}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`row-menu-item ${item.tone === "danger" ? "danger" : ""}`}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
              role="menuitem"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CollectionItem({
  node,
  depth,
  selectedCollectionId,
  selectedRequestId,
  onSelectCollection,
  onSelectRequest,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onCreateRequest,
  onDeleteRequest,
  onMoveCollection,
  onMoveRequest,
  dropTargetKey,
  openMenuKey,
  onOpenMenu,
  onCloseMenu,
  onHoverTarget,
  onClearHover,
}: CollectionItemProps) {
  const collectionDropKey = `collection:${node.id}`;
  const collectionMenuKey = `collection-menu:${node.id}`;

  const collectionMenuItems: RowMenuItem[] = [
    {
      id: `add-folder-${node.id}`,
      label: "Add Folder",
      onSelect: () => onCreateCollection(node.id),
    },
    {
      id: `add-request-${node.id}`,
      label: "Add Request",
      onSelect: () => onCreateRequest(node.id),
    },
    {
      id: `rename-folder-${node.id}`,
      label: "Rename",
      onSelect: () => onRenameCollection(node.id),
    },
    {
      id: `delete-folder-${node.id}`,
      label: "Delete",
      tone: "danger",
      onSelect: () => onDeleteCollection(node.id),
    },
  ];

  return (
    <div className="collection-node">
      <div
        className={`collection-row ${selectedCollectionId === node.id ? "active" : ""} ${dropTargetKey === collectionDropKey ? "drag-hover" : ""} ${openMenuKey === collectionMenuKey ? "menu-open" : ""}`}
        onDragOver={(event) => {
          const payload = readDragPayload(event);
          if (!payload) {
            return;
          }

          if (payload.type === "collection" && payload.collectionId === node.id) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onHoverTarget(collectionDropKey);
        }}
        onDragLeave={onClearHover}
        onDrop={(event) => {
          const payload = readDragPayload(event);
          if (!payload) {
            return;
          }

          event.preventDefault();
          onClearHover();

          if (payload.type === "collection") {
            onMoveCollection(payload.collectionId, node.id);
            return;
          }

          onMoveRequest(payload.requestId, node.id);
        }}
      >
        <button
          type="button"
          className="collection-name"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            onCloseMenu();
            onSelectCollection(node.id);
          }}
          draggable
          onDragStart={(event) =>
            setDragPayload(event, {
              type: "collection",
              collectionId: node.id,
            })
          }
        >
          {node.name}
        </button>
        <RowActionMenu
          buttonLabel="Collection actions"
          menuLabel={`${node.name} actions`}
          isOpen={openMenuKey === collectionMenuKey}
          items={collectionMenuItems}
          onToggle={() =>
            onOpenMenu(openMenuKey === collectionMenuKey ? null : collectionMenuKey)
          }
          onClose={onCloseMenu}
        />
      </div>

      {node.requests.map((request) => {
        const requestMenuKey = `request-menu:${request.id}`;

        return (
          <div
            key={request.id}
            className={`request-row ${selectedRequestId === request.id ? "active" : ""} ${dropTargetKey === `request:${request.id}` ? "drag-hover" : ""} ${openMenuKey === requestMenuKey ? "menu-open" : ""}`}
            onDragOver={(event) => {
              const payload = readDragPayload(event);
              if (!payload || payload.type !== "request" || payload.requestId === request.id) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onHoverTarget(`request:${request.id}`);
            }}
            onDragLeave={onClearHover}
            onDrop={(event) => {
              const payload = readDragPayload(event);
              if (!payload || payload.type !== "request" || payload.requestId === request.id) {
                return;
              }

              event.preventDefault();
              onClearHover();
              onMoveRequest(payload.requestId, node.id);
            }}
          >
            <button
              type="button"
              className="request-name"
              style={{ paddingLeft: `${26 + depth * 14}px` }}
              onClick={() => {
                onCloseMenu();
                onSelectRequest(request.id);
              }}
              draggable
              onDragStart={(event) =>
                setDragPayload(event, {
                  type: "request",
                  requestId: request.id,
                })
              }
            >
              <span className={`method-pill method-${request.draft.method.toLowerCase()}`}>
                {request.draft.method}
              </span>
              <span>{request.name}</span>
            </button>
            <RowActionMenu
              buttonLabel="Request actions"
              menuLabel={`${request.name} actions`}
              isOpen={openMenuKey === requestMenuKey}
              items={[
                {
                  id: `open-request-${request.id}`,
                  label: "Open",
                  onSelect: () => onSelectRequest(request.id),
                },
                {
                  id: `delete-request-${request.id}`,
                  label: "Delete",
                  tone: "danger",
                  onSelect: () => onDeleteRequest(request.id),
                },
              ]}
              onToggle={() =>
                onOpenMenu(openMenuKey === requestMenuKey ? null : requestMenuKey)
              }
              onClose={onCloseMenu}
            />
          </div>
        );
      })}

      {node.children.map((child) => (
        <CollectionItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedCollectionId={selectedCollectionId}
          selectedRequestId={selectedRequestId}
          onSelectCollection={onSelectCollection}
          onSelectRequest={onSelectRequest}
          onCreateCollection={onCreateCollection}
          onRenameCollection={onRenameCollection}
          onDeleteCollection={onDeleteCollection}
          onCreateRequest={onCreateRequest}
          onDeleteRequest={onDeleteRequest}
          onMoveCollection={onMoveCollection}
          onMoveRequest={onMoveRequest}
          dropTargetKey={dropTargetKey}
          openMenuKey={openMenuKey}
          onOpenMenu={onOpenMenu}
          onCloseMenu={onCloseMenu}
          onHoverTarget={onHoverTarget}
          onClearHover={onClearHover}
        />
      ))}
    </div>
  );
}

export function Sidebar({
  workspace,
  selectedCollectionId,
  selectedRequestId,
  variableRows,
  isSavingVariables,
  onSelectCollection,
  onSelectRequest,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onCreateRequest,
  onDeleteRequest,
  onMoveCollection,
  onMoveRequest,
  onVariableChange,
  onAddVariable,
  onRemoveVariable,
  onSaveVariables,
}: SidebarProps) {
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  const tree = useMemo(
    () => (workspace ? buildCollectionTree(workspace.collections, workspace.requests) : []),
    [workspace],
  );

  return (
    <aside className="sidebar-panel">
      <section className="sidebar-section collections-section">
        <div className="section-title-row">
          <h2>Collections</h2>
          <button type="button" className="ghost-button" onClick={() => onCreateCollection(null)}>
            New Root
          </button>
        </div>

        <div
          className={`root-drop-target ${dropTargetKey === "root" ? "drag-hover" : ""}`}
          aria-label="Drop collection here to move to root"
          onDragOver={(event) => {
            const payload = readDragPayload(event);
            if (!payload || payload.type !== "collection") {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetKey("root");
          }}
          onDragLeave={() => setDropTargetKey(null)}
          onDrop={(event) => {
            const payload = readDragPayload(event);
            if (!payload || payload.type !== "collection") {
              return;
            }

            event.preventDefault();
            setDropTargetKey(null);
            onMoveCollection(payload.collectionId, null);
          }}
        />

        <div className="tree-wrap">
          {tree.length === 0 ? (
            <p className="empty-hint">No collections yet. Create one to start.</p>
          ) : (
            tree.map((node) => (
              <CollectionItem
                key={node.id}
                node={node}
                depth={0}
                selectedCollectionId={selectedCollectionId}
                selectedRequestId={selectedRequestId}
                onSelectCollection={onSelectCollection}
                onSelectRequest={onSelectRequest}
                onCreateCollection={onCreateCollection}
                onRenameCollection={onRenameCollection}
                onDeleteCollection={onDeleteCollection}
                onCreateRequest={onCreateRequest}
                onDeleteRequest={onDeleteRequest}
                onMoveCollection={onMoveCollection}
                onMoveRequest={onMoveRequest}
                dropTargetKey={dropTargetKey}
                openMenuKey={openMenuKey}
                onOpenMenu={setOpenMenuKey}
                onCloseMenu={() => setOpenMenuKey(null)}
                onHoverTarget={(key) => setDropTargetKey(key)}
                onClearHover={() => setDropTargetKey(null)}
              />
            ))
          )}
        </div>
      </section>

      <section className="sidebar-section variables-section">
        <div className="section-title-row">
          <h2>Workspace Variables</h2>
          <button type="button" className="ghost-button" onClick={onAddVariable}>
            Add
          </button>
        </div>
        <div className="variable-grid">
          {variableRows.map((row) => (
            <div key={row.id} className="variable-row">
              <input
                className="input-text"
                value={row.key}
                onChange={(event) => onVariableChange(row.id, "key", event.target.value)}
                placeholder="key"
              />
              <input
                className="input-text"
                value={row.value}
                onChange={(event) => onVariableChange(row.id, "value", event.target.value)}
                placeholder="value"
              />
              <button
                type="button"
                className="mini-action danger"
                onClick={() => onRemoveVariable(row.id)}
              >
                Del
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="primary-button full" onClick={onSaveVariables}>
          {isSavingVariables ? "Saving Variables..." : "Save Variables"}
        </button>
      </section>
    </aside>
  );
}
