import vm from "node:vm";

import type { ResponseSnapshot, VariableMap } from "@/lib/types/apidedo";

interface ScriptRequestContext {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  bodyPreview: string;
}

interface ScriptExecutionInput {
  script: string;
  variables: VariableMap;
  request: ScriptRequestContext;
  response?: ResponseSnapshot;
}

interface ScriptExecutionResult {
  variables: VariableMap;
  logs: string[];
}

const SCRIPT_TIMEOUT_MS = 80;

function stringifyLogArg(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function runRequestScript(input: ScriptExecutionInput): ScriptExecutionResult {
  const script = input.script.trim();
  if (!script) {
    return {
      variables: input.variables,
      logs: [],
    };
  }

  const nextVariables: VariableMap = { ...input.variables };
  const logs: string[] = [];

  const pm = {
    variables: {
      get: (name: string) => nextVariables[name],
      set: (name: string, value: unknown) => {
        const key = String(name).trim();
        if (!key) {
          return;
        }

        nextVariables[key] = String(value ?? "");
      },
      unset: (name: string) => {
        const key = String(name).trim();
        if (!key) {
          return;
        }

        delete nextVariables[key];
      },
      all: () => ({ ...nextVariables }),
    },
    request: input.request,
    response: input.response ?? null,
  };

  const sandbox = {
    pm,
    console: {
      log: (...args: unknown[]) => {
        logs.push(args.map((arg) => stringifyLogArg(arg)).join(" "));
      },
    },
  };

  const context = vm.createContext(sandbox);
  const wrappedScript = `'use strict';\n${script}`;
  const executable = new vm.Script(wrappedScript, { filename: "apidedoo-script.js" });

  executable.runInContext(context, {
    timeout: SCRIPT_TIMEOUT_MS,
  });

  return {
    variables: nextVariables,
    logs,
  };
}
