export interface BaseMessage {
    type: MessageType;
    msgId: string;
    timestamp: string;
}
export type MessageType = 'agent_hello' | 'agent_hello_ack' | 'heartbeat' | 'heartbeat_ack' | 'command' | 'command_ack' | 'command_result' | 'command_result_ack' | 'notification_event' | 'error';
export interface AgentHelloMessage extends BaseMessage {
    type: 'agent_hello';
    payload: {
        deviceUid: string;
        authToken: string;
        agentVersion: string;
        lastKnownCommandId?: string;
    };
}
export interface HeartbeatMessage extends BaseMessage {
    type: 'heartbeat';
    payload: {
        deviceUid: string;
        battery: {
            level: number;
            isCharging: boolean;
            chargingType: 'USB' | 'AC' | 'WIRELESS' | null;
        };
        network: {
            type: 'WIFI' | 'MOBILE' | 'NONE';
            isConnected: boolean;
            wifiSignalLevel: number | null;
            mobileNetworkType: string | null;
        };
        storage: {
            totalBytes: number;
            freeBytes: number;
            usedPercent: number;
        };
        uptime: {
            deviceUptimeMs: number;
            agentUptimeMs: number;
        };
    };
}
export interface CommandAckMessage extends BaseMessage {
    type: 'command_ack';
    payload: {
        commandId: string;
        status: 'received' | 'rejected';
        reason?: string;
    };
}
export interface CommandResultMessage extends BaseMessage {
    type: 'command_result';
    payload: {
        commandId: string;
        commandType: string;
        status: 'success' | 'failure' | 'partial';
        executionTimeMs: number;
        result?: Record<string, unknown>;
        error?: {
            code: string;
            message: string;
        };
    };
}
export interface NotificationEventMessage extends BaseMessage {
    type: 'notification_event';
    payload: {
        deviceUid: string;
        notifications: Array<{
            notifId: string;
            packageName: string;
            appName: string;
            title: string | null;
            text: string | null;
            category: string | null;
            postedAt: string;
            isOngoing: boolean;
        }>;
    };
}
export interface AgentHelloAckMessage extends BaseMessage {
    type: 'agent_hello_ack';
    payload: {
        pendingCommands: PendingCommand[];
        heartbeatIntervalSeconds: number;
    };
}
export interface HeartbeatAckMessage extends BaseMessage {
    type: 'heartbeat_ack';
    payload: {
        serverTime: string;
    };
}
export interface CommandMessage extends BaseMessage {
    type: 'command';
    payload: {
        commandId: string;
        commandType: CommandType;
        priority: 'low' | 'normal' | 'high';
        timeoutSeconds: number;
        params: Record<string, unknown>;
    };
}
export interface CommandResultAckMessage extends BaseMessage {
    type: 'command_result_ack';
    payload: {
        commandId: string;
        received: boolean;
    };
}
export interface ErrorMessage extends BaseMessage {
    type: 'error';
    payload: {
        code: string;
        message: string;
        relatedMsgId?: string;
    };
}
export type CommandType = 'get_device_info' | 'backup_sms' | 'backup_whatsapp' | 'send_agent_logs' | 'update_config' | 'list_directory' | 'pull_file';
export interface PendingCommand {
    commandId: string;
    commandType: CommandType;
    priority: string;
    timeoutSeconds: number;
    params: Record<string, unknown>;
}
export interface RegisterDeviceRequest {
    androidId: string;
    serialNumber?: string;
    model: string;
    manufacturer: string;
    androidVersion: string;
    sdkVersion: number;
    agentVersion: string;
    enrollmentToken: string;
}
export interface RegisterDeviceResponse {
    deviceUid: string;
    authToken: string;
    wsUrl: string;
    heartbeatIntervalSeconds: number;
}
export type AgentMessage = AgentHelloMessage | HeartbeatMessage | CommandAckMessage | CommandResultMessage | NotificationEventMessage;
export type ServerMessage = AgentHelloAckMessage | HeartbeatAckMessage | CommandMessage | CommandResultAckMessage | ErrorMessage;
