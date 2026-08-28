CREATE TABLE IF NOT EXISTS alice_state_idempotency (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
  created_at INTEGER NOT NULL CHECK(created_at > 0)
);

CREATE TABLE IF NOT EXISTS alice_state_records (
  kind TEXT NOT NULL CHECK(kind IN ('message','room','world','entity','relationship','memory','task','trajectory','connectorCursor','configVersion','approvalReceipt')),
  record_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  session_id TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  revision INTEGER NOT NULL CHECK(revision > 0),
  updated_at INTEGER NOT NULL CHECK(updated_at > 0),
  PRIMARY KEY (owner_id, kind, record_id)
);

CREATE INDEX IF NOT EXISTS alice_state_owner_session_idx
  ON alice_state_records(owner_id, session_id, updated_at, kind, record_id);

CREATE TABLE IF NOT EXISTS alice_vector_references (
  owner_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  vector_id TEXT NOT NULL UNIQUE,
  index_name TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK(dimensions > 0 AND dimensions <= 1536),
  namespace TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, record_kind, record_id),
  FOREIGN KEY (owner_id, record_kind, record_id)
    REFERENCES alice_state_records(owner_id, kind, record_id)
);

CREATE TABLE IF NOT EXISTS alice_object_references (
  object_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(object_sha256) = 64),
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  created_at INTEGER NOT NULL CHECK(created_at > 0)
);
