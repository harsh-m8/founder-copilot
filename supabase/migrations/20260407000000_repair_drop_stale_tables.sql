-- Repair: drop tables that were created manually with an incorrect schema
-- so the subsequent migrations can recreate them with the correct structure.
-- This is safe because no production data exists in these tables yet.

DROP TABLE IF EXISTS financial_snapshots  CASCADE;
DROP TABLE IF EXISTS accounting_connections CASCADE;
DROP TABLE IF EXISTS oauth_states          CASCADE;
