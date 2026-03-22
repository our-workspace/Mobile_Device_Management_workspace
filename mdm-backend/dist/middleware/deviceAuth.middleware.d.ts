import { FastifyRequest, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        deviceUid?: string;
    }
}
export declare function requireDevice(request: FastifyRequest, reply: FastifyReply): Promise<void>;
