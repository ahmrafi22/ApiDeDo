import { prisma } from "@/lib/prisma";
import { ensure, readJsonBody, toErrorResponse } from "@/lib/server/http";
import {
  parsePostmanCollection,
  type ParsedPostmanFolder,
} from "@/lib/server/postman";
import { normalizeVariables } from "@/lib/server/normalizers";
import { toInputJson } from "@/lib/server/prisma-json";
import { getWorkspaceDetails } from "@/lib/server/workspace-service";

interface WorkspaceImportContext {
  params: Promise<{
    workspaceId: string;
  }>;
}

interface ImportCounter {
  collectionsCreated: number;
  requestsCreated: number;
}

async function createFolderGraph(params: {
  workspaceId: string;
  parentId: string | null;
  folder: ParsedPostmanFolder;
  counter: ImportCounter;
}): Promise<void> {
  const collection = await prisma.collection.create({
    data: {
      name: params.folder.name,
      workspaceId: params.workspaceId,
      parentId: params.parentId,
      sortOrder: params.counter.collectionsCreated,
    },
  });
  params.counter.collectionsCreated += 1;

  let requestIndex = 0;
  for (const request of params.folder.requests) {
    await prisma.apiRequest.create({
      data: {
        name: request.name,
        method: request.draft.method,
        baseUrl: request.draft.baseUrl || null,
        path: request.draft.path,
        pathVars: toInputJson(request.draft.pathVars),
        queryParams: toInputJson(request.draft.queryParams),
        headers: toInputJson(request.draft.headers),
        body: toInputJson(request.draft.body),
        scripts: toInputJson(request.draft.scripts),
        collectionId: collection.id,
        workspaceId: params.workspaceId,
        sortOrder: requestIndex,
        timeoutMs: request.draft.timeoutMs,
        lastDraft: toInputJson(request.draft),
      },
    });

    requestIndex += 1;
    params.counter.requestsCreated += 1;
  }

  let folderIndex = 0;
  for (const childFolder of params.folder.folders) {
    await createFolderGraph({
      workspaceId: params.workspaceId,
      parentId: collection.id,
      folder: {
        ...childFolder,
        name: childFolder.name || `Folder ${folderIndex + 1}`,
      },
      counter: params.counter,
    });
    folderIndex += 1;
  }
}

export async function POST(request: Request, context: WorkspaceImportContext) {
  try {
    const { workspaceId } = await context.params;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    ensure(workspace, 404, "Workspace not found.");

    const body = (await readJsonBody(request)) as {
      payload?: unknown;
    };

    const parsed = parsePostmanCollection(body.payload);

    const counter: ImportCounter = {
      collectionsCreated: 0,
      requestsCreated: 0,
    };

    await createFolderGraph({
      workspaceId,
      parentId: null,
      folder: {
        name: parsed.name,
        folders: parsed.root.folders,
        requests: parsed.root.requests,
      },
      counter,
    });

    const mergedVariables = {
      ...normalizeVariables(workspace.variables),
      ...parsed.variables,
    };

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        variables: toInputJson(mergedVariables),
      },
    });

    const updatedWorkspace = await getWorkspaceDetails(workspaceId);

    return Response.json(
      {
        summary: counter,
        workspace: updatedWorkspace,
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
