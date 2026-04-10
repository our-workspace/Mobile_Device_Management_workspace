-- Fix all missing columns in all tables
-- Run with: sudo -u postgres psql -d mdm_db -f src/db/fix-all-columns.sql

-- ==========================================
-- ADMINS table
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admins' AND column_name = 'last_login_at') THEN
        ALTER TABLE admins ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_login_at to admins';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admins' AND column_name = 'is_active') THEN
        ALTER TABLE admins ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
        RAISE NOTICE 'Added is_active to admins';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admins' AND column_name = 'role') THEN
        ALTER TABLE admins ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'ADMIN';
        RAISE NOTICE 'Added role to admins';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admins' AND column_name = 'password_hash') THEN
        ALTER TABLE admins ADD COLUMN password_hash TEXT;
        RAISE NOTICE 'Added password_hash to admins';
    END IF;
END $$;

-- ==========================================
-- DEVICES table
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'last_seen_at') THEN
        ALTER TABLE devices ADD COLUMN last_seen_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_seen_at to devices';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'status') THEN
        ALTER TABLE devices ADD COLUMN status VARCHAR(50) DEFAULT 'UNKNOWN';
        RAISE NOTICE 'Added status to devices';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'device_uid') THEN
        ALTER TABLE devices ADD COLUMN device_uid VARCHAR(255) UNIQUE;
        RAISE NOTICE 'Added device_uid to devices';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'android_id') THEN
        ALTER TABLE devices ADD COLUMN android_id VARCHAR(255) UNIQUE;
        RAISE NOTICE 'Added android_id to devices';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'auth_token_hash') THEN
        ALTER TABLE devices ADD COLUMN auth_token_hash TEXT;
        RAISE NOTICE 'Added auth_token_hash to devices';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'devices' AND column_name = 'enrolled_at') THEN
        ALTER TABLE devices ADD COLUMN enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Added enrolled_at to devices';
    END IF;
END $$;

-- ==========================================
-- COMMANDS table
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'command_id') THEN
        ALTER TABLE commands ADD COLUMN command_id VARCHAR(255) UNIQUE;
        RAISE NOTICE 'Added command_id to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'device_id') THEN
        ALTER TABLE commands ADD COLUMN device_id UUID REFERENCES devices(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added device_id to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'admin_id') THEN
        ALTER TABLE commands ADD COLUMN admin_id UUID REFERENCES admins(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added admin_id to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'command_type') THEN
        ALTER TABLE commands ADD COLUMN command_type VARCHAR(100);
        RAISE NOTICE 'Added command_type to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'params') THEN
        ALTER TABLE commands ADD COLUMN params JSONB;
        RAISE NOTICE 'Added params to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'priority') THEN
        ALTER TABLE commands ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'normal';
        RAISE NOTICE 'Added priority to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'timeout_seconds') THEN
        ALTER TABLE commands ADD COLUMN timeout_seconds INTEGER NOT NULL DEFAULT 120;
        RAISE NOTICE 'Added timeout_seconds to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'status') THEN
        ALTER TABLE commands ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'PENDING';
        RAISE NOTICE 'Added status to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'acknowledged_at') THEN
        ALTER TABLE commands ADD COLUMN acknowledged_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added acknowledged_at to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'completed_at') THEN
        ALTER TABLE commands ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added completed_at to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'result') THEN
        ALTER TABLE commands ADD COLUMN result JSONB;
        RAISE NOTICE 'Added result to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'error_code') THEN
        ALTER TABLE commands ADD COLUMN error_code VARCHAR(100);
        RAISE NOTICE 'Added error_code to commands';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'commands' AND column_name = 'error_message') THEN
        ALTER TABLE commands ADD COLUMN error_message TEXT;
        RAISE NOTICE 'Added error_message to commands';
    END IF;
END $$;

-- ==========================================
-- Verify all columns
-- ==========================================
SELECT 'admins columns:' as info;
SELECT column_name FROM information_schema.columns WHERE table_name = 'admins' ORDER BY ordinal_position;

SELECT 'devices columns:' as info;
SELECT column_name FROM information_schema.columns WHERE table_name = 'devices' ORDER BY ordinal_position;

SELECT 'commands columns:' as info;
SELECT column_name FROM information_schema.columns WHERE table_name = 'commands' ORDER BY ordinal_position;
