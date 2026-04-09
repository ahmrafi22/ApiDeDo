import { describe, expect, it } from "vitest";

import {
  applyPathVariables,
  buildPathVariableMap,
  interpolateTemplate,
  resolveEntryValue,
  resolveQueryParams,
} from "@/lib/server/variables";
import { makeEntry } from "@/lib/types/apidedo";

describe("variables utilities", () => {
  it("interpolates template placeholders", () => {
    const result = interpolateTemplate("{{base_url}}/users/{{userId}}", {
      base_url: "https://api.example.com",
      userId: "77",
    });

    expect(result).toBe("https://api.example.com/users/77");
  });

  it("builds path map using literal and variable sources", () => {
    const pathMap = buildPathVariableMap(
      [
        makeEntry({ key: "id", value: "userId", source: "variable" }),
        makeEntry({ key: "tenant", value: "acme", source: "literal" }),
      ],
      { userId: "42" },
    );

    expect(pathMap).toEqual({
      id: "42",
      tenant: "acme",
    });

    const path = applyPathVariables("/users/:id/org/:tenant", pathMap);
    expect(path).toBe("/users/42/org/acme");
  });

  it("resolves query params with mixed sources", () => {
    const params = resolveQueryParams(
      [
        makeEntry({ key: "search", value: "books", source: "literal" }),
        makeEntry({ key: "token", value: "authToken", source: "variable" }),
      ],
      { authToken: "abc123" },
    );

    expect(params.toString()).toBe("search=books&token=abc123");
  });

  it("resolves entry value from variable source", () => {
    const value = resolveEntryValue(
      makeEntry({ key: "Authorization", value: "token", source: "variable" }),
      { token: "Bearer hello" },
    );

    expect(value).toBe("Bearer hello");
  });
});
