-- Anonymous scan counters. Stores no address, wallet, user id or IP. Safe to run more than once.
CREATE TABLE IF NOT EXISTS pulse_scan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL,
  deep boolean NOT NULL DEFAULT false,
  outcome text NOT NULL,
  signed_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pulse_scan_events_created_idx ON pulse_scan_events (created_at);
