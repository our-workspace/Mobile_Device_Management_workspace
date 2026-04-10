-- Fix schema - add missing columns
-- Run with: sudo -u postgres psql -d mdm_db -f src/db/fix-schema.sql

-- Check if last_login_at exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admins' AND column_name = 'last_login_at') THEN
        ALTER TABLE admins ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_login_at column to admins';
    END IF;
END $$;

-- Check other potential missing columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admins' AND column_name = 'is_active') THEN
        ALTER TABLE admins ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
        RAISE NOTICE 'Added is_active column to admins';
    END IF;
END $$;

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'admins';
