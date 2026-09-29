import { Request } from 'express';
import { prisma } from '../lib/prisma';

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

const cleanJson = (value: unknown) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

export const getAuditActor = (req?: Request) => {
  const user = (req as any)?.user || {};
  const forwarded = req?.headers?.['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req?.ip || '').split(',')[0].trim();
  return {
    actorId: user.id || user.userId || null,
    actorEmail: user.email || null,
    actorRole: user.role || (user.isAdmin ? 'ADMIN' : null),
    ip: ip || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
};

export const writeAuditLog = async (client: any, req: Request | undefined, input: AuditInput) => {
  const delegate = (client || prisma as any).auditLog;
  if (!delegate?.create) return;
  await delegate.create({
    data: {
      ...getAuditActor(req),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      before: cleanJson(input.before),
      after: cleanJson(input.after),
      metadata: cleanJson(input.metadata),
    },
  });
};

export const listAuditLogs = async (req: Request, res: any) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
    const logs = await (prisma as any).auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return res.json({ success: true, data: logs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
