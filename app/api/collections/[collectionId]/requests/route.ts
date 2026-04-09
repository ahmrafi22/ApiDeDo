import { prisma } from "@/lib/prisma";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import { normalizeRequestDraft } from "@/lib/server/normalizers";
import { toInputJson } from "@/lib/server/prisma-json";
import { serializeApiRequest } from "@/lib/server/serializers";

interface CollectionRequestsContext {
  params: Promise<{
    collectionId: string;
  }>;
}

export async function POST(request: Request, context: CollectionRequestsContext) {
  try {
    const { collectionId } = await context.params;
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
    });
    ensure(collection, 404, "Collection not found.");

    const body = (await readJsonBody(request)) as {
      name?: unknown;
      draft?: unknown;
      sortOrder?: unknown;
    };

    const draft = normalizeRequestDraft(body.draft);
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : `${draft.method} ${draft.path || "/"}`;

    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? body.sortOrder
        : await prisma.apiRequest.count({
            where: {
              collectionId,
            },
          });

    const created = await prisma.apiRequest.create({
      data: {
        name,
        method: draft.method,
        baseUrl: draft.baseUrl || null,
        path: draft.path,
        pathVars: toInputJson(draft.pathVars),
        queryParams: toInputJson(draft.queryParams),
        headers: toInputJson(draft.headers),
        body: toInputJson(draft.body),
        scripts: toInputJson(draft.scripts),
        timeoutMs: draft.timeoutMs,
        lastDraft: toInputJson(draft),
        sortOrder,
        collectionId,
        workspaceId: collection.workspaceId,
      },
    });

    return Response.json({ request: serializeApiRequest(created) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
