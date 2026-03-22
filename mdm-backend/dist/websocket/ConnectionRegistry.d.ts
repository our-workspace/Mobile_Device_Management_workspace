import WebSocket from 'ws';
interface AgentConnection {
    ws: WebSocket;
    deviceUid: string;
    connectedAt: Date;
    socketId: string;
}
export declare const ConnectionRegistry: {
    registerAgent(deviceUid: string, ws: WebSocket, socketId: string): Promise<void>;
    unregisterAgent(socketId: string): Promise<string | null>;
    getAgentSocket(deviceUid: string): WebSocket | null;
    isAgentOnline(deviceUid: string): boolean;
    getOnlineDeviceUids(): string[];
    getConnectionInfo(deviceUid: string): Omit<AgentConnection, "ws"> | null;
    refreshHeartbeatTtl(deviceUid: string): Promise<void>;
    sendToAgent(deviceUid: string, message: object): boolean;
    registerDashboard(ws: WebSocket): void;
    unregisterDashboard(ws: WebSocket): void;
    broadcastToDashboards(event: object): void;
    getStats(): {
        agentsOnline: number;
        dashboardsConnected: number;
    };
};
export {};
