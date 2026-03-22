import { FastifyRequest, FastifyReply } from 'fastify';
interface AdminJwtPayload {
    adminId: string;
    username: string;
    role: string;
}
declare module 'fastify' {
    interface FastifyRequest {
        admin?: AdminJwtPayload;
    }
}
export declare function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function generateAdminToken(adminId: string, username: string, role: string): string;
export {};
