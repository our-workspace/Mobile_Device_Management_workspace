import type { CommandType } from '../types/messages';
import type { CommandStatus } from '@prisma/client';
export interface CreateCommandOptions {
    deviceUid: string;
    commandType: CommandType;
    params?: Record<string, unknown>;
    priority?: 'low' | 'normal' | 'high';
    timeoutSeconds?: number;
    adminId?: string;
}
export declare const CommandService: {
    createAndDispatch(options: CreateCommandOptions): Promise<{
        commandId: string;
        status: CommandStatus;
        dispatched: boolean;
    }>;
    getPendingCommandsForDevice(deviceUid: string): Promise<{
        commandId: string;
        commandType: CommandType;
        priority: "low" | "normal" | "high";
        timeoutSeconds: number;
        params: Record<string, unknown>;
    }[]>;
    markAcknowledged(commandId: string): Promise<void>;
    markCompleted(commandId: string, status: "SUCCESS" | "FAILURE", result?: Record<string, unknown>, errorCode?: string, errorMessage?: string): Promise<void>;
    getCommandHistory(deviceUid: string, limit?: number): Promise<{
        params: import("@prisma/client/runtime/library").JsonValue;
        admin: {
            username: string;
        } | null;
        createdAt: Date;
        result: import("@prisma/client/runtime/library").JsonValue;
        commandId: string;
        commandType: string;
        status: import(".prisma/client").$Enums.CommandStatus;
        priority: string;
        acknowledgedAt: Date | null;
        completedAt: Date | null;
        errorCode: string | null;
        errorMessage: string | null;
    }[]>;
    getRecentCommands(limit?: number): Promise<({
        device: {
            model: string;
            deviceUid: string;
        };
        admin: {
            username: string;
        } | null;
    } & {
        params: import("@prisma/client/runtime/library").JsonValue;
        id: string;
        createdAt: Date;
        result: import("@prisma/client/runtime/library").JsonValue | null;
        commandId: string;
        deviceId: string;
        adminId: string | null;
        commandType: string;
        status: import(".prisma/client").$Enums.CommandStatus;
        priority: string;
        timeoutSeconds: number;
        acknowledgedAt: Date | null;
        completedAt: Date | null;
        errorCode: string | null;
        errorMessage: string | null;
    })[]>;
};
