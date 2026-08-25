import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Records an admin action. Deliberately non-throwing: an audit failure must never
 * roll back or mask the operation the admin actually performed.
 */
export async function writeAudit({ userId, action, entity, entityId, metadata }: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: { userId: userId ?? null, action, entity, entityId: entityId ?? null, metadata },
    });
  } catch (err) {
    console.error("[audit] failed to record", { action, entity, entityId }, err);
  }
}
