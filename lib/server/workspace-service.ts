import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/server/http";
import { serializeWorkspaceDetails } from "@/lib/server/serializers";

export async function getWorkspaceDetails(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    throw new HttpError(404, "Workspace not found.");
  }

  const [collections, requests] = await Promise.all([
    prisma.collection.findMany({
      where: { workspaceId },
    }),
    prisma.apiRequest.findMany({
      where: { workspaceId },
    }),
  ]);

  return serializeWorkspaceDetails({
    workspace,
    collections,
    requests,
  });
}
