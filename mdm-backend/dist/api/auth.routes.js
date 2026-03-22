"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = require("zod");
const AuthService_1 = require("../services/AuthService");
const auth_middleware_1 = require("../middleware/auth.middleware");
const auth_middleware_2 = require("../middleware/auth.middleware");
const LoginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
});
async function authRoutes(app) {
    // POST /api/v1/auth/login
    app.post('/login', async (request, reply) => {
        const parseResult = LoginSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseResult.error.errors });
        }
        const { username, password } = parseResult.data;
        try {
            const { admin } = await AuthService_1.AuthService.login(username, password);
            const token = (0, auth_middleware_1.generateAdminToken)(admin.id, admin.username, admin.role);
            return reply.send({
                token,
                admin: {
                    id: admin.id,
                    username: admin.username,
                    email: admin.email,
                    role: admin.role,
                },
            });
        }
        catch (err) {
            const error = err;
            if (error.message === 'INVALID_CREDENTIALS') {
                return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
            }
            throw err;
        }
    });
    // GET /api/v1/auth/me
    app.get('/me', { preHandler: auth_middleware_2.requireAdmin }, async (request, reply) => {
        return reply.send({ admin: request.admin });
    });
}
//# sourceMappingURL=auth.routes.js.map