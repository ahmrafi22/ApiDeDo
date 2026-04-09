"use client";

import { useMemo, useState } from "react";

import { formatBytes, formatMs } from "@/lib/client/formatters";
import type { HistoryRecord, ResponseSnapshot } from "@/lib/types/apidedo";
import { JsonTree } from "@/components/apidedoo/json-tree";

interface ResponseViewerProps {
  response: ResponseSnapshot | null;
  history: HistoryRecord[];
  scriptLogs: string[];
  onUseHistoryDraft: (history: HistoryRecord) => void;
  onRunHistory: (history: HistoryRecord) => void;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ResponseViewer({
  response,
  history,
  scriptLogs,
  onUseHistoryDraft,
  onRunHistory,
}: ResponseViewerProps) {
  const [tab, setTab] = useState<"pretty" | "raw" | "headers" | "history" | "logs">(
    "pretty",
  );

  const prettyPayload = useMemo(() => {
    if (!response) {
      return null;
    }

    if (response.bodyJson !== null) {
      return response.bodyJson;
    }

    try {
      return JSON.parse(response.bodyRaw);
    } catch {
      return null;
    }
  }, [response]);

  const rawPayload = response?.bodyJson
    ? safeStringify(response.bodyJson)
    : response?.bodyRaw ?? "";

  return (
    <section className="response-panel">
      <div className="response-header">
        <h2>Response</h2>
        {response ? (
          <div className="response-metadata">
            <span>Status: {response.status || "ERR"}</span>
            <span>Time: {formatMs(response.durationMs)}</span>
            <span>Size: {formatBytes(response.sizeBytes)}</span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigator.clipboard.writeText(rawPayload)}
            >
              Copy
            </button>
          </div>
        ) : (
          <p className="empty-hint">Run a request to inspect response data.</p>
        )}
      </div>

      <div className="tabs-row compact">
        <button
          type="button"
          className={`tab-button ${tab === "pretty" ? "active" : ""}`}
          onClick={() => setTab("pretty")}
        >
          Pretty
        </button>
        <button
          type="button"
          className={`tab-button ${tab === "raw" ? "active" : ""}`}
          onClick={() => setTab("raw")}
        >
          Raw
        </button>
        <button
          type="button"
          className={`tab-button ${tab === "headers" ? "active" : ""}`}
          onClick={() => setTab("headers")}
        >
          Headers
        </button>
        <button
          type="button"
          className={`tab-button ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
        <button
          type="button"
          className={`tab-button ${tab === "logs" ? "active" : ""}`}
          onClick={() => setTab("logs")}
        >
          Script Logs
        </button>
      </div>

      <div className="response-content">
        {tab === "pretty" ? (
          prettyPayload ? (
            <JsonTree value={prettyPayload} />
          ) : (
            <pre className="raw-response">{rawPayload || "No response body"}</pre>
          )
        ) : null}

        {tab === "raw" ? <pre className="raw-response">{rawPayload || "No response body"}</pre> : null}

        {tab === "headers" ? (
          <div className="headers-grid">
            {(response?.headers ?? []).map(([key, value]) => (
              <div key={`${key}-${value}`} className="header-row">
                <span>{key}</span>
                <span>{value}</span>
              </div>
            ))}
            {!response || response.headers.length === 0 ? (
              <p className="empty-hint">No headers available yet.</p>
            ) : null}
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="history-list">
            {history.length === 0 ? (
              <p className="empty-hint">No history yet.</p>
            ) : (
              history.map((entry) => (
                <div key={entry.id} className="history-item">
                  <div>
                    <strong>{entry.responseSnapshot.status || "ERR"}</strong>
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onUseHistoryDraft(entry)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onRunHistory(entry)}
                    >
                      Run
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "logs" ? (
          <div className="logs-view">
            {scriptLogs.length === 0 ? (
              <p className="empty-hint">No script logs for the latest execution.</p>
            ) : (
              <pre className="raw-response">{scriptLogs.join("\n")}</pre>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
