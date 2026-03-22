"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandsRoutes = commandsRoutes;
const zod_1 = require("zod");
const CommandService_1 = require("../services/CommandService");
const auth_middleware_1 = require("../middleware/auth.middleware");
const VALID_COMMAND_TYPES = [
    'get_device_info',
    'backup_sms',
    'backup_whatsapp',
    'send_agent_logs',
    'update_config',
    'list_directory',
    'pull_file',
];
const CreateCommandSchema = zod_1.z.object({
    commandType: zod_1.z.enum([
        'get_device_info',
        'backup_sms',
        'backup_whatsapp',
        'send_agent_logs',
        'update_config',
        'list_directory',
        'pull_file',
    ]),
    params: zod_1.z.record(zod_1.z.unknown()).optional().default({}),
    priority: zod_1.z.enum(['low', 'normal', 'high']).optional().default('normal'),
    timeoutSeconds: zod_1.z.number().int().min(10).max(600).optional().default(120),
});
async function commandsRoutes(app) {
    // -----------------------------------------------------------
    // POST /api/v1/devices/:deviceUid/commands
    // إرسال أمر لجهاز معين
    // -----------------------------------------------------------
    app.post('/devices/:deviceUid/commands', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const parseResult = CreateCommandSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseResult.error.errors });
        }
        const { commandType, params, priority, timeoutSeconds } = parseResult.data;
        try {
            const result = await CommandService_1.CommandService.createAndDispatch({
                deviceUid,
                commandType,
                params,
                priority,
                timeoutSeconds,
                adminId: request.admin?.adminId,
            });
            return reply.status(202).send({
                commandId: result.commandId,
                status: result.status,
                dispatched: result.dispatched,
                message: result.dispatched
                    ? 'Command dispatched to device'
                    : 'Device is offline. Command queued for delivery.',
            });
        }
        catch (err) {
            const error = err;
            if (error.message === 'DEVICE_NOT_FOUND') {
                return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
            }
            throw err;
        }
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/commands
    // سجل الأوامر لجهاز
    // -----------------------------------------------------------
    app.get('/devices/:deviceUid/commands', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const limit = parseInt(request.query.limit || '20', 10);
        const commands = await CommandService_1.CommandService.getCommandHistory(deviceUid, limit);
        return reply.send({ commands, total: commands.length });
    });
    // -----------------------------------------------------------
    // GET /api/v1/commands  (audit log – كل الأجهزة)
    // -----------------------------------------------------------
    app.get('/audit', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const limit = parseInt(request.query.limit || '50', 10);
        const commands = await CommandService_1.CommandService.getRecentCommands(limit);
        return reply.send({ commands });
    });
}
//# sourceMappingURL=commands.routes.js.map