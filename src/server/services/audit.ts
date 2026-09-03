import { connectToDatabase } from "@/lib/mongoose";
import { AuditLogModel } from "@/models";

type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  /** Free-form detail, stored as-is. Was `Prisma.InputJsonValue`; Mongo takes any BSON value. */
  metadata?: unknown;
};

/**
 * Records an admin action. Deliberately non-throwing: an audit failure must never
 * roll back or mask the operation the admin actually performed.
 */
export async function writeAudit({ userId, action, entity, entityId, metadata }: AuditInput) {
  try {
    await connectToDatabase();
    await AuditLogModel.create({
      userId: userId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record", { action, entity, entityId }, err);
  }
}
