import type { KeyValueEntry, VariableMap } from "@/lib/types/apidedo";

const TEMPLATE_PATTERN = /{{\s*([\w.-]+)\s*}}/g;
const PATH_PATTERN = /:([A-Za-z0-9_]+)/g;

export function interpolateTemplate(input: string, variables: VariableMap): string {
  if (!input) {
    return "";
  }

  return input.replace(TEMPLATE_PATTERN, (_match, name: string) => {
    if (name in variables) {
      return variables[name] ?? "";
    }

    return `{{${name}}}`;
  });
}

export function resolveEntryValue(entry: KeyValueEntry, variables: VariableMap): string {
  if (entry.source === "variable") {
    return variables[entry.value] ?? "";
  }

  return interpolateTemplate(entry.value, variables);
}

export function buildPathVariableMap(
  pathVars: KeyValueEntry[],
  workspaceVariables: VariableMap,
): VariableMap {
  const output: VariableMap = {};

  for (const item of pathVars) {
    if (!item.enabled || !item.key.trim()) {
      continue;
    }

    output[item.key.trim()] = resolveEntryValue(item, workspaceVariables);
  }

  return output;
}

export function applyPathVariables(path: string, pathVariables: VariableMap): string {
  const withTemplate = interpolateTemplate(path, pathVariables);
  return withTemplate.replace(PATH_PATTERN, (_match, key: string) => {
    if (key in pathVariables) {
      return encodeURIComponent(pathVariables[key] ?? "");
    }

    return `:${key}`;
  });
}

export function resolveQueryParams(
  queryParams: KeyValueEntry[],
  variables: VariableMap,
): URLSearchParams {
  const output = new URLSearchParams();

  for (const item of queryParams) {
    const key = item.key.trim();
    if (!item.enabled || !key) {
      continue;
    }

    output.append(key, resolveEntryValue(item, variables));
  }

  return output;
}

export function resolveHeaders(
  headers: KeyValueEntry[],
  variables: VariableMap,
): Headers {
  const output = new Headers();

  for (const item of headers) {
    const key = item.key.trim();
    if (!item.enabled || !key) {
      continue;
    }

    output.set(key, resolveEntryValue(item, variables));
  }

  return output;
}
