-- Fix bonus column type to support decimal values
-- Run this in Supabase Dashboard → SQL Editor

ALTER TABLE students ALTER COLUMN bonus TYPE NUMERIC(10,2);
ALTER TABLE students ALTER COLUMN bonus SET DEFAULT 1;

-- Verify change
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'students' AND column_name = 'bonus';
