import { prisma } from "@/lib/prisma";
import { deleteWorkspaceGraph } from "@/lib/server/collection-utils";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import { normalizeVariables } from "@/lib/server/normalizers";
import { toInputJson } from "@/lib/server/prisma-json";
import { getWorkspaceDetails } from "@/lib/server/workspace-service";

interface WorkspaceRouteContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

export async function GET(_request: Request, context: WorkspaceRouteContext) {
  try {
    const { workspaceId } = await context.params;
    const workspace = await getWorkspaceDetails(workspaceId);
    return Response.json({ workspace });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: WorkspaceRouteContext) {
  try {
    const { workspaceId } = await context.params;
    const body = (await readJsonBody(request)) as {
      name?: unknown;
      variables?: unknown;
    };

    const existing = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    ensure(existing, 404, "Workspace not found.");

    const name = typeof body.name === "string" ? body.name.trim() : existing.name;
    ensure(name.length > 0, 400, "Workspace name is required.");

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name,
        variables:
          body.variables === undefined
            ? toInputJson(normalizeVariables(existing.variables))
            : toInputJson(normalizeVariables(body.variables)),
      },
    });

    const workspace = await getWorkspaceDetails(workspaceId);
    return Response.json({ workspace });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: WorkspaceRouteContext) {
  try {
    const { workspaceId } = await context.params;
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    ensure(workspace, 404, "Workspace not found.");

    await deleteWorkspaceGraph(workspaceId);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
