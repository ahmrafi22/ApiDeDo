"use client";

import { Fragment } from "react";

interface JsonTreeProps {
  value: unknown;
  level?: number;
}

function isPrimitive(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (value === null) {
    return "null";
  }

  return String(value);
}

function JsonNode({ label, value, level }: { label: string; value: unknown; level: number }) {
  if (isPrimitive(value)) {
    return (
      <div className="json-row" style={{ marginLeft: `${level * 12}px` }}>
        <span className="json-key">{label}</span>
        <span className="json-separator">: </span>
        <span className="json-value json-primitive">{formatPrimitive(value)}</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <details className="json-details" open>
        <summary className="json-summary" style={{ marginLeft: `${level * 12}px` }}>
          <span className="json-key">{label}</span>
          <span className="json-separator">: </span>
          <span className="json-value">[{value.length}]</span>
        </summary>
        <div>
          {value.map((item, index) => (
            <JsonNode key={`${label}-${index}`} label={String(index)} value={item} level={level + 1} />
          ))}
        </div>
      </details>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <details className="json-details" open>
      <summary className="json-summary" style={{ marginLeft: `${level * 12}px` }}>
        <span className="json-key">{label}</span>
        <span className="json-separator">: </span>
        <span className="json-value">{`{${entries.length}}`}</span>
      </summary>
      <div>
        {entries.map(([entryKey, entryValue]) => (
          <JsonNode key={`${label}-${entryKey}`} label={entryKey} value={entryValue} level={level + 1} />
        ))}
      </div>
    </details>
  );
}

export function JsonTree({ value, level = 0 }: JsonTreeProps) {
  if (isPrimitive(value)) {
    return <span className="json-value json-primitive">{formatPrimitive(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="json-container">
        {value.map((item, index) => (
          <Fragment key={`root-${index}`}>
            <JsonNode label={String(index)} value={item} level={level} />
          </Fragment>
        ))}
      </div>
    );
  }

  const objectEntries = Object.entries((value ?? {}) as Record<string, unknown>);
  return (
    <div className="json-container">
      {objectEntries.map(([key, entry]) => (
        <JsonNode key={key} label={key} value={entry} level={level} />
      ))}
    </div>
  );
}
