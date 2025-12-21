-- Migration: Add classTime column to existing database
-- Run this in Cloudflare D1 Console or via wrangler

-- Step 1: Check if column exists
-- PRAGMA table_info(performance_assessments);

-- Step 2: Add classTime column if it doesn't exist
ALTER TABLE performance_assessments ADD COLUMN classTime INTEGER;
