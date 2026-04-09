"use client";

import { useEffect, useRef, useState } from "react";

import type { WorkspaceSummary } from "@/lib/types/apidedo";

interface TopBarProps {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  workspaceName: string;
  accentColor: string;
  accentPalette: readonly string[];
  canSaveRequest: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onCreateWorkspace: () => void;
  onDeleteWorkspace: () => void;
  onWorkspaceSelect: (workspaceId: string) => void;
  onAccentColorChange: (color: string) => void;
  onSaveRequest: () => void;
  onImportPostman: (file: File) => void;
  onExportPostman: () => void;
}

export function TopBar({
  workspaces,
  activeWorkspaceId,
  workspaceName,
  accentColor,
  accentPalette,
  canSaveRequest,
  hasUnsavedChanges,
  isSaving,
  onCreateWorkspace,
  onDeleteWorkspace,
  onWorkspaceSelect,
  onAccentColorChange,
  onSaveRequest,
  onImportPostman,
  onExportPostman,
}: TopBarProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const accentMenuRef = useRef<HTMLDivElement | null>(null);
  const [isAccentMenuOpen, setIsAccentMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAccentMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        accentMenuRef.current &&
        !accentMenuRef.current.contains(target)
      ) {
        setIsAccentMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isAccentMenuOpen]);

  return (
    <header className="topbar">
      <div className="topbar-group">
        <label className="field-label" htmlFor="workspace-switcher">
          Workspace
        </label>
        <select
          id="workspace-switcher"
          className="input-select"
          value={activeWorkspaceId ?? ""}
          onChange={(event) => onWorkspaceSelect(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <button className="icon-button" onClick={onCreateWorkspace} type="button" title="Create workspace">
          New
        </button>
        <button
          className="icon-button danger"
          onClick={onDeleteWorkspace}
          type="button"
          title="Delete workspace"
          disabled={!activeWorkspaceId}
        >
          Delete
        </button>
      </div>

      <div className="topbar-group workspace-name-group">
        <span className="field-label">
          Name
        </span>
        <p className="workspace-name-value" title={workspaceName}>
          {workspaceName || "Untitled workspace"}
        </p>
      </div>

      <div className="topbar-group topbar-actions">
        <button className="ghost-button" onClick={() => importInputRef.current?.click()} type="button">
          Import Postman
        </button>
        <input
          ref={importInputRef}
          type="file"
          hidden
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImportPostman(file);
            }
            event.target.value = "";
          }}
        />
        <button className="ghost-button" onClick={onExportPostman} type="button" disabled={!activeWorkspaceId}>
          Export Postman
        </button>

        <div className="accent-menu" ref={accentMenuRef}>
          <button
            className="ghost-button accent-menu-trigger"
            onClick={() => setIsAccentMenuOpen((current) => !current)}
            type="button"
            aria-expanded={isAccentMenuOpen}
            aria-haspopup="menu"
          >
            <span className="accent-preview" style={{ backgroundColor: accentColor }} aria-hidden="true" />
            Theme
          </button>

          {isAccentMenuOpen ? (
            <div className="accent-menu-popover" role="menu" aria-label="Accent color options">
              {accentPalette.map((color) => (
                <button
                  key={color}
                  className={`accent-dot ${accentColor === color ? "active" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onAccentColorChange(color);
                    setIsAccentMenuOpen(false);
                  }}
                  type="button"
                  title={`Set accent ${color}`}
                  role="menuitem"
                />
              ))}
            </div>
          ) : null}
        </div>

        <button
          className="primary-button"
          onClick={onSaveRequest}
          type="button"
          disabled={!canSaveRequest || isSaving}
        >
          {isSaving ? "Saving..." : hasUnsavedChanges ? "Save" : "Saved"}
        </button>
      </div>
    </header>
  );
}
