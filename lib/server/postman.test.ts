import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildPostmanCollectionExport,
  parsePostmanCollection,
} from "@/lib/server/postman";
import { makeDefaultRequestDraft } from "@/lib/types/apidedo";

describe("postman conversion", () => {
  it("parses v2.1 collection payload", () => {
    const parsed = parsePostmanCollection({
      info: {
        name: "Sample",
      },
      variable: [{ key: "base_url", value: "https://api.example.com" }],
      item: [
        {
          name: "Users",
          item: [
            {
              name: "Get User",
              request: {
                method: "GET",
                header: [{ key: "Accept", value: "application/json" }],
                url: {
                  raw: "https://api.example.com/users/:id?pretty=true",
                  query: [{ key: "pretty", value: "true" }],
                  variable: [{ key: "id", value: "10" }],
                },
              },
            },
          ],
        },
      ],
    });

    expect(parsed.name).toBe("Sample");
    expect(parsed.variables.base_url).toBe("https://api.example.com");
    expect(parsed.root.folders[0]?.name).toBe("Users");
    expect(parsed.root.folders[0]?.requests[0]?.draft.method).toBe("GET");
    expect(parsed.root.folders[0]?.requests[0]?.draft.path).toContain("/users");
  });

  it("exports workspace data to postman-compatible payload", () => {
    const draft = makeDefaultRequestDraft();
    draft.method = "POST";
    draft.baseUrl = "{{base_url}}";
    draft.path = "/users";
    draft.body.mode = "json";
    draft.body.json = '{"name":"Alice"}';

    const payload = buildPostmanCollectionExport({
      workspaceName: "Team API",
      variables: {
        base_url: "https://api.example.com",
      },
      collections: [
        {
          id: "c1",
          name: "Root",
          workspaceId: "w1",
          parentId: null,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      requests: [
        {
          id: "r1",
          name: "Create User",
          collectionId: "c1",
          workspaceId: "w1",
          sortOrder: 0,
          draft,
          lastDraft: draft,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(payload.info.schema).toContain("v2.1.0");
    expect(payload.item).toHaveLength(1);

    const rootFolder = payload.item[0] as { item: Array<{ request?: { method?: string } }> };
    expect(rootFolder.item[0]?.request?.method).toBe("POST");
  });

  it("parses the JSONPlaceholder workspace fixture", () => {
    const payload = JSON.parse(
      readFileSync("docs/jsonplaceholder-workspace.postman_collection.json", "utf8"),
    ) as unknown;

    const parsed = parsePostmanCollection(payload);

    expect(parsed.name).toBe("JSONPlaceholder API Types");
    expect(parsed.root.folders).toHaveLength(0);
    expect(parsed.root.requests).toHaveLength(12);

    const methods = new Set(parsed.root.requests.map((request) => request.draft.method));
    expect(methods.has("GET")).toBe(true);
    expect(methods.has("POST")).toBe(true);
    expect(methods.has("PUT")).toBe(true);
    expect(methods.has("PATCH")).toBe(true);
    expect(methods.has("DELETE")).toBe(true);
  });
});
