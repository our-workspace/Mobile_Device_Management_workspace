// src/api/auth.routes.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/AuthService';
import { generateAdminToken } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/auth.middleware';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/login
  app.post('/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseResult.error.errors });
    }

    const { username, password } = parseResult.data;

    try {
      const { admin } = await AuthService.login(username, password);
      const token = generateAdminToken(admin.id, admin.username, admin.role);

      return reply.send({
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      const error = err as Error;
      if (error.message === 'INVALID_CREDENTIALS') {
        return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
      }
      throw err;
    }
  });

  // GET /api/v1/auth/me
  app.get('/me', { preHandler: requireAdmin }, async (request, reply) => {
    return reply.send({ admin: request.admin });
  });
}
