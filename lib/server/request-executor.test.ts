import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeApiRequest } from "@/lib/server/request-executor";
import { makeDefaultRequestDraft, makeEntry } from "@/lib/types/apidedo";

const JSON_PLACEHOLDER_BASE_URL = "https://jsonplaceholder.typicode.com";
const runLiveApiTests =
  process.env.RUN_JSONPLACEHOLDER_TESTS === "1" ||
  process.env.RUN_JSONPLACEHOLDER_TESTS === "true";
const describeIfLiveApi = runLiveApiTests ? describe : describe.skip;

function makeJsonPlaceholderDraft(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string) {
  const draft = makeDefaultRequestDraft();
  draft.method = method;
  draft.baseUrl = JSON_PLACEHOLDER_BASE_URL;
  draft.path = path;
  draft.pathVars = [makeEntry()];
  draft.queryParams = [makeEntry()];
  draft.headers = [makeEntry()];
  draft.timeoutMs = 20000;

  return draft;
}

function withJsonBody(draft: ReturnType<typeof makeJsonPlaceholderDraft>, payload: unknown): void {
  draft.body.mode = "json";
  draft.body.json = JSON.stringify(payload);
  draft.headers = [
    makeEntry({
      key: "Content-type",
      value: "application/json; charset=UTF-8",
      source: "literal",
    }),
  ];
}

describe("request execution engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("executes request, resolves variables, and runs scripts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-test": "abc",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const draft = makeDefaultRequestDraft();
    draft.method = "GET";
    draft.baseUrl = "https://api.example.com";
    draft.path = "/users/:id";
    draft.pathVars = [
      makeEntry({ key: "id", value: "userId", source: "variable" }),
    ];
    draft.queryParams = [
      makeEntry({ key: "expand", value: "full", source: "literal" }),
    ];
    draft.headers = [
      makeEntry({ key: "Authorization", value: "token", source: "variable" }),
    ];
    draft.scripts.preRequest = "pm.variables.set('trace', 'enabled'); pm.variables.set('userId', '101')";
    draft.scripts.postResponse = "pm.variables.set('lastStatus', String(pm.response?.status))";

    const result = await executeApiRequest({
      draft,
      workspaceVariables: {
        userId: "99",
        token: "Bearer demo",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstCallUrl = fetchMock.mock.calls[0]?.[0];
    expect(String(firstCallUrl)).toBe("https://api.example.com/users/101?expand=full");

    expect(result.responseSnapshot.status).toBe(200);
    expect(result.responseSnapshot.bodyJson).toEqual({ ok: true });
    expect(result.updatedVariables.trace).toBe("enabled");
    expect(result.updatedVariables.lastStatus).toBe("200");
    expect(result.requestSnapshot.draft.path).toBe("/users/:id");
  });

  describeIfLiveApi("live JSONPlaceholder API coverage", () => {
    it("gets a single resource", async () => {
      const draft = makeJsonPlaceholderDraft("GET", "/posts/1");

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect(result.responseSnapshot.status).toBe(200);
      expect(result.responseSnapshot.bodyJson).toMatchObject({
        id: 1,
        userId: 1,
      });
    }, 20000);

    it("lists all resources", async () => {
      const draft = makeJsonPlaceholderDraft("GET", "/posts");

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect(result.responseSnapshot.status).toBe(200);
      expect(Array.isArray(result.responseSnapshot.bodyJson)).toBe(true);

      const posts = result.responseSnapshot.bodyJson as Array<{ id: number }>;
      expect(posts.length).toBeGreaterThan(0);
      expect(posts[0]?.id).toBeTypeOf("number");
    }, 20000);

    it("creates a resource", async () => {
      const draft = makeJsonPlaceholderDraft("POST", "/posts");
      withJsonBody(draft, {
        title: "foo",
        body: "bar",
        userId: 1,
      });

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect(result.responseSnapshot.status).toBe(201);
      expect(result.responseSnapshot.bodyJson).toMatchObject({
        title: "foo",
        body: "bar",
        userId: 1,
      });

      const created = result.responseSnapshot.bodyJson as { id?: unknown };
      expect(typeof created.id === "number" || typeof created.id === "string").toBe(true);
    }, 20000);

    it("updates a resource", async () => {
      const draft = makeJsonPlaceholderDraft("PUT", "/posts/1");
      withJsonBody(draft, {
        id: 1,
        title: "foo",
        body: "bar",
        userId: 1,
      });

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect(result.responseSnapshot.status).toBe(200);
      expect(result.responseSnapshot.bodyJson).toMatchObject({
        id: 1,
        title: "foo",
        body: "bar",
        userId: 1,
      });
    }, 20000);

    it("patches a resource", async () => {
      const draft = makeJsonPlaceholderDraft("PATCH", "/posts/1");
      withJsonBody(draft, {
        title: "foo",
      });

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect(result.responseSnapshot.status).toBe(200);
      expect(result.responseSnapshot.bodyJson).toMatchObject({
        id: 1,
        title: "foo",
      });
    }, 20000);

    it("deletes a resource", async () => {
      const draft = makeJsonPlaceholderDraft("DELETE", "/posts/1");

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect([200, 204]).toContain(result.responseSnapshot.status);
      expect(result.responseSnapshot.error).toBeNull();
    }, 20000);

    it("filters resources with query parameters", async () => {
      const draft = makeJsonPlaceholderDraft("GET", "/posts");
      draft.queryParams = [
        makeEntry({
          key: "userId",
          value: "1",
          source: "literal",
        }),
      ];

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect(result.responseSnapshot.status).toBe(200);
      expect(Array.isArray(result.responseSnapshot.bodyJson)).toBe(true);

      const posts = result.responseSnapshot.bodyJson as Array<{ userId?: number }>;
      expect(posts.length).toBeGreaterThan(0);
      expect(posts.every((post) => post.userId === 1)).toBe(true);
    }, 20000);

    it.each([
      { path: "/posts/1/comments", parentKey: "postId", parentValue: 1 },
      { path: "/albums/1/photos", parentKey: "albumId", parentValue: 1 },
      { path: "/users/1/albums", parentKey: "userId", parentValue: 1 },
      { path: "/users/1/todos", parentKey: "userId", parentValue: 1 },
      { path: "/users/1/posts", parentKey: "userId", parentValue: 1 },
    ])("lists nested resources for $path", async ({ path, parentKey, parentValue }) => {
      const draft = makeJsonPlaceholderDraft("GET", path);

      const result = await executeApiRequest({
        draft,
        workspaceVariables: {},
      });

      expect(result.responseSnapshot.status).toBe(200);
      expect(Array.isArray(result.responseSnapshot.bodyJson)).toBe(true);

      const items = result.responseSnapshot.bodyJson as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item[parentKey] === parentValue)).toBe(true);
    }, 20000);
  });
});
