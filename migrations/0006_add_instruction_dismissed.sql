-- Add instructionDismissed to ip_profiles
ALTER TABLE ip_profiles ADD COLUMN instructionDismissed INTEGER DEFAULT 0;
