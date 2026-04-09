import { prisma } from "@/lib/prisma";
import { deleteCollectionTree } from "@/lib/server/collection-utils";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import { serializeCollection } from "@/lib/server/serializers";

interface CollectionRouteContext {
  params: Promise<{
    collectionId: string;
  }>;
}

export async function PATCH(request: Request, context: CollectionRouteContext) {
  try {
    const { collectionId } = await context.params;
    const existing = await prisma.collection.findUnique({
      where: { id: collectionId },
    });
    ensure(existing, 404, "Collection not found.");

    const body = (await readJsonBody(request)) as {
      name?: unknown;
      parentId?: unknown;
      sortOrder?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : existing.name;
    ensure(name.length > 0, 400, "Collection name is required.");

    let parentId = existing.parentId;
    if (body.parentId !== undefined) {
      parentId = typeof body.parentId === "string" ? body.parentId : null;
      if (parentId) {
        ensure(parentId !== collectionId, 400, "A collection cannot be its own parent.");

        const parent = await prisma.collection.findFirst({
          where: {
            id: parentId,
            workspaceId: existing.workspaceId,
          },
        });

        ensure(parent, 400, "Parent collection does not belong to this workspace.");
      }
    }

    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? body.sortOrder
        : existing.sortOrder;

    const updated = await prisma.collection.update({
      where: { id: collectionId },
      data: {
        name,
        parentId,
        sortOrder,
      },
    });

    return Response.json({ collection: serializeCollection(updated) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: CollectionRouteContext) {
  try {
    const { collectionId } = await context.params;
    const existing = await prisma.collection.findUnique({
      where: { id: collectionId },
    });
    ensure(existing, 404, "Collection not found.");

    await deleteCollectionTree({
      workspaceId: existing.workspaceId,
      rootCollectionId: collectionId,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
