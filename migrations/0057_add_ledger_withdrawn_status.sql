-- Migration 0057: Add 'withdrawn' status to commerce_ledger_entries for reader wallet demo
-- This status indicates that reader earnings have been withdrawn (demo mode).
-- Идемпотентная миграция для добавления статуса 'withdrawn' в commerce_ledger_entries.

DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'commerce_ledger_entries_status_check'
  ) THEN
    ALTER TABLE commerce_ledger_entries DROP CONSTRAINT commerce_ledger_entries_status_check;
  END IF;

  -- Add the new constraint with 'withdrawn' status
  ALTER TABLE commerce_ledger_entries 
  ADD CONSTRAINT commerce_ledger_entries_status_check 
  CHECK (status::text = ANY (ARRAY[
    'pending'::character varying, 
    'available'::character varying, 
    'paid'::character varying, 
    'withdrawn'::character varying,
    'void'::character varying
  ]::text[]));
END$$;

-- Комментарий для документирования статуса
COMMENT ON COLUMN commerce_ledger_entries.status IS 'Status of ledger entry: pending, available (can be withdrawn), paid (real withdrawal processed), withdrawn (demo withdrawal), void (cancelled)';
