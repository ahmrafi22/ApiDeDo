import { prisma } from "@/lib/prisma";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import { serializeCollection } from "@/lib/server/serializers";

interface WorkspaceCollectionsContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

export async function POST(request: Request, context: WorkspaceCollectionsContext) {
  try {
    const { workspaceId } = await context.params;
    const body = (await readJsonBody(request)) as {
      name?: unknown;
      parentId?: unknown;
      sortOrder?: unknown;
    };

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    ensure(workspace, 404, "Workspace not found.");

    const name = typeof body.name === "string" ? body.name.trim() : "";
    ensure(name.length > 0, 400, "Collection name is required.");

    const parentId = typeof body.parentId === "string" ? body.parentId : null;
    if (parentId) {
      const parent = await prisma.collection.findFirst({
        where: {
          id: parentId,
          workspaceId,
        },
      });
      ensure(parent, 400, "Parent collection not found in this workspace.");
    }

    const nextSortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? body.sortOrder
        : await prisma.collection.count({
            where: {
              workspaceId,
              parentId,
            },
          });

    const collection = await prisma.collection.create({
      data: {
        name,
        workspaceId,
        parentId,
        sortOrder: nextSortOrder,
      },
    });

    return Response.json({ collection: serializeCollection(collection) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
