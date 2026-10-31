-- Payment records for deep scans. Safe to run more than once.
CREATE TABLE IF NOT EXISTS pulse_payments (
  tx_hash text PRIMARY KEY,
  wallet_address text NOT NULL,
  privy_user_id text NOT NULL,
  scan_type text NOT NULL,
  target_address text NOT NULL,
  chain_id integer NOT NULL,
  amount_units text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Keeps the delivered scan so a payer can re-download it if the response was lost.
ALTER TABLE pulse_payments ADD COLUMN IF NOT EXISTS result jsonb;
