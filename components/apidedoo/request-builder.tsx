"use client";

import { useMemo, useState } from "react";

import {
  HTTP_METHODS,
  makeEntry,
  type ApiRequestDraft,
  type BodyMode,
  type KeyValueEntry,
} from "@/lib/types/apidedo";

interface RequestBuilderProps {
  requestName: string;
  requestDraft: ApiRequestDraft | null;
  isExecuting: boolean;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onDraftChange: (draft: ApiRequestDraft) => void;
  onExecute: () => void;
  onSave: () => void;
  onInjectAuthHeader: () => void;
}

function patchEntries(
  entries: KeyValueEntry[],
  id: string,
  updates: Partial<KeyValueEntry>,
): KeyValueEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry));
}

function patchEntryArray(
  draft: ApiRequestDraft,
  field: "pathVars" | "queryParams" | "headers",
  id: string,
  updates: Partial<KeyValueEntry>,
): ApiRequestDraft {
  return {
    ...draft,
    [field]: patchEntries(draft[field], id, updates),
  };
}

function ensureAtLeastOneEntry(entries: KeyValueEntry[]): KeyValueEntry[] {
  return entries.length > 0 ? entries : [makeEntry()];
}

function EntryGrid({
  entries,
  title,
  showSource = false,
  onChange,
  onAdd,
  onRemove,
}: {
  entries: KeyValueEntry[];
  title: string;
  showSource?: boolean;
  onChange: (id: string, updates: Partial<KeyValueEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="entry-grid-wrap">
      <div className="section-title-row">
        <h3>{title}</h3>
        <button type="button" className="ghost-button" onClick={onAdd}>
          Add Row
        </button>
      </div>
      <div className="entry-grid">
        {entries.map((entry) => (
          <div key={entry.id} className="entry-row">
            <input
              type="checkbox"
              checked={entry.enabled}
              onChange={(event) => onChange(entry.id, { enabled: event.target.checked })}
              title="Enable row"
            />
            <input
              className="input-text"
              value={entry.key}
              onChange={(event) => onChange(entry.id, { key: event.target.value })}
              placeholder="Key"
            />
            {showSource ? (
              <select
                className="input-select"
                value={entry.source}
                onChange={(event) =>
                  onChange(entry.id, {
                    source:
                      event.target.value === "variable" ? "variable" : "literal",
                  })
                }
              >
                <option value="literal">Literal</option>
                <option value="variable">Variable</option>
              </select>
            ) : null}
            <input
              className="input-text"
              value={entry.value}
              onChange={(event) => onChange(entry.id, { value: event.target.value })}
              placeholder={entry.source === "variable" ? "variableName" : "Value"}
            />
            <button type="button" className="mini-action danger" onClick={() => onRemove(entry.id)}>
              X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RequestBuilder({
  requestName,
  requestDraft,
  isExecuting,
  isSaving,
  onNameChange,
  onDraftChange,
  onExecute,
  onSave,
  onInjectAuthHeader,
}: RequestBuilderProps) {
  const [activeTab, setActiveTab] = useState<"params" | "headers" | "body" | "scripts">(
    "params",
  );

  const methodOptions = useMemo(() => [...HTTP_METHODS], []);

  if (!requestDraft) {
    return (
      <section className="builder-panel empty">
        <p>Select or create a request to start building.</p>
      </section>
    );
  }

  const changeBodyMode = (mode: BodyMode) => {
    onDraftChange({
      ...requestDraft,
      body: {
        ...requestDraft.body,
        mode,
      },
    });
  };

  return (
    <section className="builder-panel">
      <div className="builder-header">
        <input
          className="request-name-input"
          value={requestName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Request name"
        />
        <div className="builder-actions">
          <button type="button" className="ghost-button" onClick={onSave}>
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="primary-button" onClick={onExecute}>
            {isExecuting ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      <div className="request-line">
        <select
          className="method-select"
          value={requestDraft.method}
          onChange={(event) =>
            onDraftChange({
              ...requestDraft,
              method: event.target.value as ApiRequestDraft["method"],
            })
          }
        >
          {methodOptions.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        <input
          className="input-text"
          value={requestDraft.baseUrl}
          onChange={(event) =>
            onDraftChange({
              ...requestDraft,
              baseUrl: event.target.value,
            })
          }
          placeholder="https://api.example.com"
        />

        <input
          className="input-text path-input"
          value={requestDraft.path}
          onChange={(event) =>
            onDraftChange({
              ...requestDraft,
              path: event.target.value,
            })
          }
          placeholder="/users/:id"
        />

        <input
          className="input-text timeout-input"
          value={String(requestDraft.timeoutMs)}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            onDraftChange({
              ...requestDraft,
              timeoutMs: Number.isFinite(parsed) ? parsed : requestDraft.timeoutMs,
            });
          }}
          placeholder="30000"
          title="Timeout in milliseconds"
        />
      </div>

      <div className="tabs-row">
        <button
          type="button"
          className={`tab-button ${activeTab === "params" ? "active" : ""}`}
          onClick={() => setActiveTab("params")}
        >
          Params
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "headers" ? "active" : ""}`}
          onClick={() => setActiveTab("headers")}
        >
          Headers
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "body" ? "active" : ""}`}
          onClick={() => setActiveTab("body")}
        >
          Body
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "scripts" ? "active" : ""}`}
          onClick={() => setActiveTab("scripts")}
        >
          Scripts
        </button>
      </div>

      <div className="builder-content">
        {activeTab === "params" ? (
          <>
            <EntryGrid
              title="Path Variables"
              entries={requestDraft.pathVars}
              showSource
              onChange={(id, updates) =>
                onDraftChange(patchEntryArray(requestDraft, "pathVars", id, updates))
              }
              onAdd={() =>
                onDraftChange({
                  ...requestDraft,
                  pathVars: [...requestDraft.pathVars, makeEntry()],
                })
              }
              onRemove={(id) =>
                onDraftChange({
                  ...requestDraft,
                  pathVars: ensureAtLeastOneEntry(
                    requestDraft.pathVars.filter((entry) => entry.id !== id),
                  ),
                })
              }
            />
            <EntryGrid
              title="Query Parameters"
              entries={requestDraft.queryParams}
              showSource
              onChange={(id, updates) =>
                onDraftChange(patchEntryArray(requestDraft, "queryParams", id, updates))
              }
              onAdd={() =>
                onDraftChange({
                  ...requestDraft,
                  queryParams: [...requestDraft.queryParams, makeEntry()],
                })
              }
              onRemove={(id) =>
                onDraftChange({
                  ...requestDraft,
                  queryParams: ensureAtLeastOneEntry(
                    requestDraft.queryParams.filter((entry) => entry.id !== id),
                  ),
                })
              }
            />
          </>
        ) : null}

        {activeTab === "headers" ? (
          <>
            <div className="section-title-row">
              <h3>Headers</h3>
              <div className="inline-actions">
                <button type="button" className="ghost-button" onClick={onInjectAuthHeader}>
                  Add Bearer {"{{authToken}}"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    onDraftChange({
                      ...requestDraft,
                      headers: [...requestDraft.headers, makeEntry()],
                    })
                  }
                >
                  Add Header
                </button>
              </div>
            </div>
            <EntryGrid
              title=""
              entries={requestDraft.headers}
              showSource
              onChange={(id, updates) =>
                onDraftChange(patchEntryArray(requestDraft, "headers", id, updates))
              }
              onAdd={() =>
                onDraftChange({
                  ...requestDraft,
                  headers: [...requestDraft.headers, makeEntry()],
                })
              }
              onRemove={(id) =>
                onDraftChange({
                  ...requestDraft,
                  headers: ensureAtLeastOneEntry(
                    requestDraft.headers.filter((entry) => entry.id !== id),
                  ),
                })
              }
            />
          </>
        ) : null}

        {activeTab === "body" ? (
          <div className="body-config">
            <label className="field-label" htmlFor="body-mode">
              Body mode
            </label>
            <select
              id="body-mode"
              className="input-select"
              value={requestDraft.body.mode}
              onChange={(event) => changeBodyMode(event.target.value as BodyMode)}
            >
              <option value="none">none</option>
              <option value="json">json</option>
              <option value="raw">raw text</option>
              <option value="form-data">form-data</option>
              <option value="urlencoded">x-www-form-urlencoded</option>
              <option value="xml">xml</option>
              <option value="html">html</option>
            </select>

            {requestDraft.body.mode === "json" ? (
              <textarea
                className="body-editor"
                value={requestDraft.body.json}
                onChange={(event) =>
                  onDraftChange({
                    ...requestDraft,
                    body: {
                      ...requestDraft.body,
                      json: event.target.value,
                    },
                  })
                }
              />
            ) : null}

            {requestDraft.body.mode === "raw" ||
            requestDraft.body.mode === "xml" ||
            requestDraft.body.mode === "html" ? (
              <>
                <select
                  className="input-select"
                  value={requestDraft.body.rawLanguage}
                  onChange={(event) =>
                    onDraftChange({
                      ...requestDraft,
                      body: {
                        ...requestDraft.body,
                        rawLanguage:
                          event.target.value === "json" ||
                          event.target.value === "xml" ||
                          event.target.value === "html"
                            ? event.target.value
                            : "text",
                      },
                    })
                  }
                >
                  <option value="text">text</option>
                  <option value="json">json</option>
                  <option value="xml">xml</option>
                  <option value="html">html</option>
                </select>
                <textarea
                  className="body-editor"
                  value={requestDraft.body.raw}
                  onChange={(event) =>
                    onDraftChange({
                      ...requestDraft,
                      body: {
                        ...requestDraft.body,
                        raw: event.target.value,
                      },
                    })
                  }
                />
              </>
            ) : null}

            {requestDraft.body.mode === "form-data" ? (
              <EntryGrid
                title="Form Data"
                entries={requestDraft.body.formData}
                showSource
                onChange={(id, updates) =>
                  onDraftChange({
                    ...requestDraft,
                    body: {
                      ...requestDraft.body,
                      formData: patchEntries(requestDraft.body.formData, id, updates),
                    },
                  })
                }
                onAdd={() =>
                  onDraftChange({
                    ...requestDraft,
                    body: {
                      ...requestDraft.body,
                      formData: [...requestDraft.body.formData, makeEntry()],
                    },
                  })
                }
                onRemove={(id) =>
                  onDraftChange({
                    ...requestDraft,
                    body: {
                      ...requestDraft.body,
                      formData: ensureAtLeastOneEntry(
                        requestDraft.body.formData.filter((entry) => entry.id !== id),
                      ),
                    },
                  })
                }
              />
            ) : null}

            {requestDraft.body.mode === "urlencoded" ? (
              <EntryGrid
                title="x-www-form-urlencoded"
                entries={requestDraft.body.urlEncoded}
                showSource
                onChange={(id, updates) =>
                  onDraftChange({
                    ...requestDraft,
                    body: {
                      ...requestDraft.body,
                      urlEncoded: patchEntries(requestDraft.body.urlEncoded, id, updates),
                    },
                  })
                }
                onAdd={() =>
                  onDraftChange({
                    ...requestDraft,
                    body: {
                      ...requestDraft.body,
                      urlEncoded: [...requestDraft.body.urlEncoded, makeEntry()],
                    },
                  })
                }
                onRemove={(id) =>
                  onDraftChange({
                    ...requestDraft,
                    body: {
                      ...requestDraft.body,
                      urlEncoded: ensureAtLeastOneEntry(
                        requestDraft.body.urlEncoded.filter((entry) => entry.id !== id),
                      ),
                    },
                  })
                }
              />
            ) : null}
          </div>
        ) : null}

        {activeTab === "scripts" ? (
          <div className="scripts-grid">
            <div>
              <label className="field-label" htmlFor="pre-script">
                Pre-request Script
              </label>
              <textarea
                id="pre-script"
                className="script-editor"
                value={requestDraft.scripts.preRequest}
                onChange={(event) =>
                  onDraftChange({
                    ...requestDraft,
                    scripts: {
                      ...requestDraft.scripts,
                      preRequest: event.target.value,
                    },
                  })
                }
                placeholder="pm.variables.set('token', 'abc')"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="post-script">
                Post-response Script
              </label>
              <textarea
                id="post-script"
                className="script-editor"
                value={requestDraft.scripts.postResponse}
                onChange={(event) =>
                  onDraftChange({
                    ...requestDraft,
                    scripts: {
                      ...requestDraft.scripts,
                      postResponse: event.target.value,
                    },
                  })
                }
                placeholder="if (pm.response?.status === 200) { pm.variables.set('userId', '42'); }"
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
