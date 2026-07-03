-- Deadbolt for Teams — Postgres schema (multi-tenant)
--
-- Every tenant-owned row carries org_id and cascades on org delete. This is the
-- production target for the JSON store's blob. Apply with:
--   psql "$DATABASE_URL" -f server/store/schema.sql
-- (PgStore.init() also applies it automatically with IF NOT EXISTS guards.)

CREATE TABLE IF NOT EXISTS orgs (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  seats  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admins (
  id      TEXT PRIMARY KEY,
  org_id  TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email   TEXT NOT NULL,
  name    TEXT NOT NULL,
  salt    TEXT NOT NULL,
  hash    TEXT NOT NULL
);
-- email is unique per tenant; add a global unique index if you want one login namespace
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_lower_idx ON admins (lower(email));
CREATE INDEX IF NOT EXISTS admins_org_idx ON admins (org_id);

CREATE TABLE IF NOT EXISTS groups (
  id      TEXT PRIMARY KEY,
  org_id  TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  policy  JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS groups_org_idx ON groups (org_id);

CREATE TABLE IF NOT EXISTS enrollment_codes (
  code     TEXT PRIMARY KEY,
  org_id   TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS enrollment_codes_org_idx ON enrollment_codes (org_id);

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  enrolled_at BIGINT NOT NULL,
  last_seen   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_org_idx ON devices (org_id);

CREATE TABLE IF NOT EXISTS requests (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_name   TEXT,
  group_id      TEXT,
  domain        TEXT NOT NULL,
  reason        TEXT,
  requested_min INTEGER,
  granted_min   INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | denied
  self_serve    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    BIGINT NOT NULL,
  decided_at    BIGINT,
  expires_at    BIGINT
);
CREATE INDEX IF NOT EXISTS requests_org_idx ON requests (org_id);
CREATE INDEX IF NOT EXISTS requests_device_idx ON requests (device_id);
CREATE INDEX IF NOT EXISTS requests_status_idx ON requests (org_id, status);

CREATE TABLE IF NOT EXISTS events (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  domain    TEXT NOT NULL,
  type      TEXT NOT NULL,  -- blocked | allowed
  ts        BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_org_type_ts_idx ON events (org_id, type, ts);

CREATE TABLE IF NOT EXISTS tokens (
  token      TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,   -- admin | device
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,   -- admin id or device id
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_org_idx ON tokens (org_id);
