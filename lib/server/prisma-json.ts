import { Prisma } from "@/generated/prisma/client";

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function toNullableInputJson(
  value: unknown,
): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toInputJson(value);
}
