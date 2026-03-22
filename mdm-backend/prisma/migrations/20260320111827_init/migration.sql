-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER');

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "deviceUid" TEXT NOT NULL,
    "androidId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "model" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "androidVersion" TEXT NOT NULL,
    "sdkVersion" INTEGER NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "authTokenHash" TEXT NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commands" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "adminId" TEXT,
    "commandType" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heartbeats" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batteryLevel" INTEGER NOT NULL,
    "isCharging" BOOLEAN NOT NULL,
    "chargingType" TEXT,
    "networkType" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL,
    "wifiSignalLevel" INTEGER,
    "mobileNetType" TEXT,
    "storageFreeBytes" BIGINT NOT NULL,
    "storageTotalBytes" BIGINT NOT NULL,
    "usedPercent" INTEGER NOT NULL,
    "deviceUptimeMs" BIGINT,
    "agentUptimeMs" BIGINT,

    CONSTRAINT "heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_files" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "commandId" TEXT,
    "fileType" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "recordCount" INTEGER,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "mimeType" TEXT NOT NULL DEFAULT 'application/json',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "backup_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "category" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceUid_key" ON "devices"("deviceUid");

-- CreateIndex
CREATE UNIQUE INDEX "devices_androidId_key" ON "devices"("androidId");

-- CreateIndex
CREATE INDEX "devices_deviceUid_idx" ON "devices"("deviceUid");

-- CreateIndex
CREATE INDEX "devices_androidId_idx" ON "devices"("androidId");

-- CreateIndex
CREATE UNIQUE INDEX "commands_commandId_key" ON "commands"("commandId");

-- CreateIndex
CREATE INDEX "commands_deviceId_status_idx" ON "commands"("deviceId", "status");

-- CreateIndex
CREATE INDEX "commands_commandId_idx" ON "commands"("commandId");

-- CreateIndex
CREATE INDEX "heartbeats_deviceId_receivedAt_idx" ON "heartbeats"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "backup_files_deviceId_fileType_idx" ON "backup_files"("deviceId", "fileType");

-- CreateIndex
CREATE INDEX "notification_logs_deviceId_postedAt_idx" ON "notification_logs"("deviceId", "postedAt");

-- CreateIndex
CREATE INDEX "notification_logs_packageName_idx" ON "notification_logs"("packageName");

-- CreateIndex
CREATE UNIQUE INDEX "admins_username_key" ON "admins"("username");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_username_idx" ON "admins"("username");

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heartbeats" ADD CONSTRAINT "heartbeats_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_files" ADD CONSTRAINT "backup_files_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
