import { prisma } from "@/lib/prisma";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import { normalizeRequestDraft } from "@/lib/server/normalizers";
import { toInputJson } from "@/lib/server/prisma-json";
import { serializeApiRequest } from "@/lib/server/serializers";

interface RequestDraftRouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function PATCH(request: Request, context: RequestDraftRouteContext) {
  try {
    const { requestId } = await context.params;
    const existing = await prisma.apiRequest.findUnique({
      where: { id: requestId },
    });
    ensure(existing, 404, "Request not found.");

    const body = (await readJsonBody(request)) as {
      draft?: unknown;
    };

    const draft = normalizeRequestDraft(body.draft);
    const updated = await prisma.apiRequest.update({
      where: { id: requestId },
      data: {
        lastDraft: toInputJson(draft),
      },
    });

    return Response.json({ request: serializeApiRequest(updated) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
