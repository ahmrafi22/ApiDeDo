import { prisma } from "@/lib/prisma";
import { ensure, toErrorResponse } from "@/lib/server/http";
import { serializeHistory } from "@/lib/server/serializers";

interface RequestHistoryContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function GET(request: Request, context: RequestHistoryContext) {
  try {
    const { requestId } = await context.params;
    const existing = await prisma.apiRequest.findUnique({
      where: { id: requestId },
      select: { id: true },
    });
    ensure(existing, 404, "Request not found.");

    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(limit, 100))
      : 25;

    const history = await prisma.history.findMany({
      where: {
        requestId,
      },
      orderBy: {
        timestamp: "desc",
      },
      take: safeLimit,
    });

    return Response.json({ history: history.map((entry) => serializeHistory(entry)) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
