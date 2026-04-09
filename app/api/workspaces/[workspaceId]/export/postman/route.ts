import { prisma } from "@/lib/prisma";
import { ensure, toErrorResponse } from "@/lib/server/http";
import { normalizeVariables } from "@/lib/server/normalizers";
import { buildPostmanCollectionExport } from "@/lib/server/postman";
import { serializeApiRequest, serializeCollection } from "@/lib/server/serializers";

interface WorkspaceExportContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

function fileNameFromWorkspaceName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || "workspace"}-postman-v2.1.json`;
}

export async function GET(_request: Request, context: WorkspaceExportContext) {
  try {
    const { workspaceId } = await context.params;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    ensure(workspace, 404, "Workspace not found.");

    const [collections, requests] = await Promise.all([
      prisma.collection.findMany({ where: { workspaceId } }),
      prisma.apiRequest.findMany({ where: { workspaceId } }),
    ]);

    const payload = buildPostmanCollectionExport({
      workspaceName: workspace.name,
      variables: normalizeVariables(workspace.variables),
      collections: collections.map((collection) => serializeCollection(collection)),
      requests: requests.map((request) => serializeApiRequest(request)),
    });

    const fileName = fileNameFromWorkspaceName(workspace.name);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
