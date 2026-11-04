BEGIN;
CREATE TABLE IF NOT EXISTS generation_daily (
  day_utc date PRIMARY KEY,
  requests integer NOT NULL DEFAULT 0 CHECK(requests>=0),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK(reserved_microusd>=0)
);
CREATE TABLE IF NOT EXISTS generation_clients (
  client_hash char(64) PRIMARY KEY,
  window_started timestamptz NOT NULL,
  used integer NOT NULL CHECK(used>=0)
);
CREATE TABLE IF NOT EXISTS generation_leases (
  lease_id uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS generation_attempts (
  attempt_id uuid PRIMARY KEY,
  day_utc date NOT NULL REFERENCES generation_daily(day_utc),
  charged_microusd bigint NOT NULL CHECK(charged_microusd>=0),
  settled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS analytics_daily (
  day_utc date NOT NULL,
  mode text NOT NULL CHECK(mode IN ('me','character')),
  event text NOT NULL CHECK(event IN ('visit','generation_start','generation_complete','generation_error','card_download','share_click','text_copy','name_preference')),
  rank smallint NOT NULL DEFAULT 0 CHECK(rank BETWEEN 0 AND 3),
  count bigint NOT NULL DEFAULT 0 CHECK(count>=0),
  PRIMARY KEY(day_utc,mode,event,rank)
);
CREATE INDEX IF NOT EXISTS generation_clients_window ON generation_clients(window_started);
CREATE INDEX IF NOT EXISTS generation_leases_expiry ON generation_leases(expires_at);
CREATE TABLE IF NOT EXISTS analytics_windows (
  bucket_key text PRIMARY KEY CHECK(length(bucket_key)<=80),
  window_started timestamptz NOT NULL,
  used integer NOT NULL CHECK(used>0)
);
CREATE INDEX IF NOT EXISTS analytics_windows_start ON analytics_windows(window_started);
COMMIT;
