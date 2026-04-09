import { prisma } from "@/lib/prisma";

export async function getCollectionTreeIds(params: {
  workspaceId: string;
  rootCollectionId: string;
}): Promise<string[]> {
  const collections = await prisma.collection.findMany({
    where: { workspaceId: params.workspaceId },
    select: {
      id: true,
      parentId: true,
    },
  });

  const childrenMap = new Map<string, string[]>();
  for (const collection of collections) {
    if (!collection.parentId) {
      continue;
    }

    const children = childrenMap.get(collection.parentId) ?? [];
    children.push(collection.id);
    childrenMap.set(collection.parentId, children);
  }

  const collectedIds: string[] = [];
  const stack = [params.rootCollectionId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || collectedIds.includes(current)) {
      continue;
    }

    collectedIds.push(current);
    const children = childrenMap.get(current) ?? [];
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return collectedIds;
}

export async function deleteCollectionTree(params: {
  workspaceId: string;
  rootCollectionId: string;
}): Promise<void> {
  const collectionIds = await getCollectionTreeIds({
    workspaceId: params.workspaceId,
    rootCollectionId: params.rootCollectionId,
  });

  if (collectionIds.length === 0) {
    return;
  }

  const requests = await prisma.apiRequest.findMany({
    where: {
      workspaceId: params.workspaceId,
      collectionId: {
        in: collectionIds,
      },
    },
    select: {
      id: true,
    },
  });

  const requestIds = requests.map((request) => request.id);

  if (requestIds.length > 0) {
    await prisma.history.deleteMany({
      where: {
        requestId: {
          in: requestIds,
        },
      },
    });

    await prisma.apiRequest.deleteMany({
      where: {
        id: {
          in: requestIds,
        },
      },
    });
  }

  await prisma.collection.deleteMany({
    where: {
      id: {
        in: collectionIds,
      },
    },
  });
}

export async function deleteWorkspaceGraph(workspaceId: string): Promise<void> {
  const requests = await prisma.apiRequest.findMany({
    where: {
      workspaceId,
    },
    select: {
      id: true,
    },
  });

  if (requests.length > 0) {
    await prisma.history.deleteMany({
      where: {
        requestId: {
          in: requests.map((request) => request.id),
        },
      },
    });
  }

  await prisma.history.deleteMany({
    where: {
      workspaceId,
    },
  });
  await prisma.apiRequest.deleteMany({ where: { workspaceId } });
  await prisma.collection.deleteMany({ where: { workspaceId } });
  await prisma.workspace.delete({ where: { id: workspaceId } });
}
