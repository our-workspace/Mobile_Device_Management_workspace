-- Database initialization script (replaces Prisma migrations)
-- Run with: psql -d mdm_db -f src/db/init.sql

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (clean slate)
DROP TABLE IF EXISTS notification_logs CASCADE;
DROP TABLE IF EXISTS backup_files CASCADE;
DROP TABLE IF EXISTS heartbeats CASCADE;
DROP TABLE IF EXISTS commands CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- Create tables
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_uid VARCHAR(255) UNIQUE NOT NULL,
    android_id VARCHAR(255) UNIQUE NOT NULL,
    serial_number VARCHAR(255),
    model VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(255) NOT NULL,
    android_version VARCHAR(50) NOT NULL,
    sdk_version INTEGER NOT NULL,
    agent_version VARCHAR(50) NOT NULL,
    auth_token_hash TEXT NOT NULL,
    enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'UNKNOWN'
);

CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    command_id VARCHAR(255) UNIQUE NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    command_type VARCHAR(100) NOT NULL,
    params JSONB,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    timeout_seconds INTEGER NOT NULL DEFAULT 120,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    result JSONB,
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE heartbeats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    battery_level INTEGER NOT NULL,
    is_charging BOOLEAN NOT NULL,
    charging_type VARCHAR(50),
    network_type VARCHAR(50) NOT NULL,
    is_connected BOOLEAN NOT NULL,
    wifi_signal_level INTEGER,
    mobile_net_type VARCHAR(50),
    storage_free_bytes BIGINT NOT NULL,
    storage_total_bytes BIGINT NOT NULL,
    used_percent DECIMAL(5,2) NOT NULL,
    device_uptime_ms BIGINT,
    agent_uptime_ms BIGINT,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command_id VARCHAR(255),
    file_type VARCHAR(50) NOT NULL,
    file_key TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    record_count INTEGER,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    mime_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    package_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    title TEXT,
    text TEXT,
    category VARCHAR(100),
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_id, package_name, title, text, posted_at)
);

-- Create indexes for better performance
CREATE INDEX idx_devices_device_uid ON devices(device_uid);
CREATE INDEX idx_devices_android_id ON devices(android_id);
CREATE INDEX idx_commands_device_id ON commands(device_id);
CREATE INDEX idx_commands_status ON commands(status);
CREATE INDEX idx_commands_command_id ON commands(command_id);
CREATE INDEX idx_heartbeats_device_id ON heartbeats(device_id);
CREATE INDEX idx_heartbeats_recorded_at ON heartbeats(recorded_at);
CREATE INDEX idx_backup_files_device_id ON backup_files(device_id);
CREATE INDEX idx_notification_logs_device_id ON notification_logs(device_id);
CREATE INDEX idx_notification_logs_package_name ON notification_logs(package_name);
CREATE INDEX idx_notification_logs_posted_at ON notification_logs(posted_at);

-- Insert default admin (password: admin123)
INSERT INTO admins (username, email, password_hash, role, is_active)
VALUES (
    'admin',
    'admin@company.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash of 'admin123'
    'SUPER_ADMIN',
    true
)
ON CONFLICT (username) DO NOTHING;
