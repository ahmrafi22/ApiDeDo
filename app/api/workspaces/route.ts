import { prisma } from "@/lib/prisma";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import { normalizeVariables } from "@/lib/server/normalizers";
import { serializeWorkspaceSummary } from "@/lib/server/serializers";
import { getWorkspaceDetails } from "@/lib/server/workspace-service";

export async function GET() {
  try {
    const workspaces = await prisma.workspace.findMany({
      orderBy: {
        updatedAt: "desc",
      },
    });

    return Response.json({
      workspaces: workspaces.map((workspace) => serializeWorkspaceSummary(workspace)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request)) as {
      name?: unknown;
      variables?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    ensure(name.length > 0, 400, "Workspace name is required.");

    const workspace = await prisma.workspace.create({
      data: {
        name,
        variables: normalizeVariables(body.variables),
      },
    });

    await prisma.collection.create({
      data: {
        name: "New Collection",
        workspaceId: workspace.id,
        sortOrder: 0,
      },
    });

    const details = await getWorkspaceDetails(workspace.id);
    return Response.json({ workspace: details }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
