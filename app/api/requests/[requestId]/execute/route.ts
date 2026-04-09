import { prisma } from "@/lib/prisma";
import { executeApiRequest } from "@/lib/server/request-executor";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import {
  normalizeRequestDraft,
  normalizeVariables,
  parseDraftFromDb,
} from "@/lib/server/normalizers";
import { toInputJson } from "@/lib/server/prisma-json";
import { serializeHistory } from "@/lib/server/serializers";
import type { HistoryRecord } from "@/lib/types/apidedo";

export const runtime = "nodejs";
export const maxDuration = 45;

function makeLocalHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID()}`;
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ExecuteRouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function POST(request: Request, context: ExecuteRouteContext) {
  try {
    const { requestId } = await context.params;
    const requestRecord = await prisma.apiRequest.findUnique({
      where: {
        id: requestId,
      },
    });
    ensure(requestRecord, 404, "Request not found.");

    const workspace = await prisma.workspace.findUnique({
      where: {
        id: requestRecord.workspaceId,
      },
    });
    ensure(workspace, 404, "Workspace not found.");

    const body = (await readJsonBody(request)) as {
      draft?: unknown;
      persistDraft?: unknown;
      persistHistory?: unknown;
    };

    const draft =
      body.draft === undefined
        ? requestRecord.lastDraft
          ? normalizeRequestDraft(requestRecord.lastDraft)
          : parseDraftFromDb(requestRecord)
        : normalizeRequestDraft(body.draft);

    const workspaceVariables = normalizeVariables(workspace.variables);
    const result = await executeApiRequest({
      draft,
      workspaceVariables,
    });

    if (body.persistDraft === true) {
      await prisma.apiRequest.update({
        where: { id: requestId },
        data: {
          lastDraft: toInputJson(draft),
        },
      });
    }

    if (JSON.stringify(workspaceVariables) !== JSON.stringify(result.updatedVariables)) {
      await prisma.workspace.update({
        where: {
          id: workspace.id,
        },
        data: {
          variables: toInputJson(result.updatedVariables),
        },
      });
    }

    const history: HistoryRecord =
      body.persistHistory === true
        ? serializeHistory(
            await prisma.history.create({
              data: {
                requestId,
                workspaceId: workspace.id,
                requestSnapshot: toInputJson(result.requestSnapshot),
                responseSnapshot: toInputJson(result.responseSnapshot),
              },
            }),
          )
        : {
            id: makeLocalHistoryId(),
            requestId,
            workspaceId: workspace.id,
            requestSnapshot: result.requestSnapshot,
            responseSnapshot: result.responseSnapshot,
            timestamp: new Date().toISOString(),
          };

    return Response.json({
      requestSnapshot: result.requestSnapshot,
      responseSnapshot: result.responseSnapshot,
      updatedVariables: result.updatedVariables,
      scriptLogs: result.scriptLogs,
      history,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
