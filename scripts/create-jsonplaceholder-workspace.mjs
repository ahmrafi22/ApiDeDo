#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_WORKSPACE_NAME = "JSONPlaceholder API Types";
const COLLECTION_FILE_PATH = path.resolve(
  process.cwd(),
  "docs",
  "jsonplaceholder-workspace.postman_collection.json",
);

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, "");
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();

  let payload = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Expected JSON from ${url}, received: ${text.slice(0, 240)}`);
    }
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : text || response.statusText;

    throw new Error(`Request failed (${response.status}) for ${url}: ${errorMessage}`);
  }

  return payload;
}

async function main() {
  const baseUrl = trimTrailingSlash(process.env.APIDEDOO_BASE_URL ?? DEFAULT_BASE_URL);
  const workspaceName =
    (process.env.APIDEDOO_WORKSPACE_NAME ?? DEFAULT_WORKSPACE_NAME).trim() ||
    DEFAULT_WORKSPACE_NAME;

  const fixtureRaw = await readFile(COLLECTION_FILE_PATH, "utf8");
  const fixturePayload = JSON.parse(fixtureRaw);

  const workspaceResponse = await requestJson(`${baseUrl}/api/workspaces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: workspaceName,
    }),
  });

  const workspace = workspaceResponse?.workspace;
  if (!workspace || typeof workspace.id !== "string") {
    throw new Error("Workspace creation returned an unexpected response payload.");
  }

  const importResponse = await requestJson(
    `${baseUrl}/api/workspaces/${workspace.id}/import/postman`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        payload: fixturePayload,
      }),
    },
  );

  const summary = importResponse?.summary;
  const collectionsCreated =
    summary && typeof summary.collectionsCreated === "number"
      ? summary.collectionsCreated
      : "unknown";
  const requestsCreated =
    summary && typeof summary.requestsCreated === "number" ? summary.requestsCreated : "unknown";

  console.log(`Workspace created: ${workspace.name} (${workspace.id})`);
  console.log(`Collections imported: ${collectionsCreated}`);
  console.log(`Requests imported: ${requestsCreated}`);
  console.log(`Open: ${baseUrl}`);
}

main().catch((error) => {
  console.error(
    `Failed to create JSONPlaceholder workspace: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
