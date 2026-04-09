import { prisma } from "@/lib/prisma";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import { normalizeRequestDraft } from "@/lib/server/normalizers";
import { toInputJson, toNullableInputJson } from "@/lib/server/prisma-json";
import { serializeApiRequest } from "@/lib/server/serializers";

interface RequestRouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function GET(_request: Request, context: RequestRouteContext) {
  try {
    const { requestId } = await context.params;
    const requestRecord = await prisma.apiRequest.findUnique({
      where: { id: requestId },
    });
    ensure(requestRecord, 404, "Request not found.");

    return Response.json({ request: serializeApiRequest(requestRecord) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RequestRouteContext) {
  try {
    const { requestId } = await context.params;
    const existing = await prisma.apiRequest.findUnique({
      where: { id: requestId },
    });
    ensure(existing, 404, "Request not found.");

    const body = (await readJsonBody(request)) as {
      name?: unknown;
      draft?: unknown;
      collectionId?: unknown;
      sortOrder?: unknown;
    };

    const draft = body.draft === undefined ? null : normalizeRequestDraft(body.draft);
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : existing.name;

    let collectionId = existing.collectionId;
    if (typeof body.collectionId === "string" && body.collectionId !== existing.collectionId) {
      const destinationCollection = await prisma.collection.findUnique({
        where: { id: body.collectionId },
      });
      ensure(destinationCollection, 400, "Target collection not found.");
      ensure(
        destinationCollection.workspaceId === existing.workspaceId,
        400,
        "Target collection must belong to the same workspace.",
      );

      collectionId = destinationCollection.id;
    }

    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? body.sortOrder
        : existing.sortOrder;

    const updated = await prisma.apiRequest.update({
      where: { id: requestId },
      data: {
        name,
        collectionId,
        sortOrder,
        method: draft?.method ?? existing.method,
        baseUrl: draft ? draft.baseUrl || null : existing.baseUrl,
        path: draft?.path ?? existing.path,
        pathVars: toInputJson(draft?.pathVars ?? existing.pathVars ?? []),
        queryParams: toInputJson(draft?.queryParams ?? existing.queryParams ?? []),
        headers: toInputJson(draft?.headers ?? existing.headers ?? []),
        body: toNullableInputJson(draft?.body ?? existing.body ?? null),
        scripts: toNullableInputJson(draft?.scripts ?? existing.scripts ?? null),
        timeoutMs: draft?.timeoutMs ?? existing.timeoutMs,
        lastDraft: toNullableInputJson(draft ?? existing.lastDraft ?? null),
      },
    });

    return Response.json({ request: serializeApiRequest(updated) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RequestRouteContext) {
  try {
    const { requestId } = await context.params;
    const existing = await prisma.apiRequest.findUnique({
      where: { id: requestId },
    });
    ensure(existing, 404, "Request not found.");

    await prisma.history.deleteMany({
      where: {
        requestId,
      },
    });

    await prisma.apiRequest.delete({
      where: {
        id: requestId,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
