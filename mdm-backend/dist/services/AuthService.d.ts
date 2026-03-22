export interface AdminLoginResult {
    admin: {
        id: string;
        username: string;
        email: string;
        role: string;
    };
}
export declare const AuthService: {
    login(username: string, password: string): Promise<AdminLoginResult>;
    generateDeviceUid(): string;
    generateCommandId(): string;
    hashToken(token: string): Promise<string>;
    verifyTokenHash(token: string, hash: string): Promise<boolean>;
    validateEnrollmentToken(token: string): boolean;
    seedDefaultAdmin(): Promise<void>;
};
