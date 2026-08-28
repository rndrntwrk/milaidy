PRAGMA foreign_keys = OFF;

DROP INDEX alice_state_owner_session_idx;
ALTER TABLE alice_vector_references RENAME TO alice_vector_references_v1;
ALTER TABLE alice_state_records RENAME TO alice_state_records_v1;

CREATE TABLE alice_state_records (
  kind TEXT NOT NULL CHECK(kind IN ('message','room','world','entity','relationship','memory','task','trajectory','connectorCursor','configVersion','approvalReceipt','plan','approval','work','attempt','recovery')),
  record_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  session_id TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  revision INTEGER NOT NULL CHECK(revision > 0),
  updated_at INTEGER NOT NULL CHECK(updated_at > 0),
  PRIMARY KEY (owner_id, kind, record_id)
);

INSERT INTO alice_state_records
SELECT * FROM alice_state_records_v1;

CREATE INDEX alice_state_owner_session_idx
  ON alice_state_records(owner_id, session_id, updated_at, kind, record_id);

CREATE TABLE alice_vector_references (
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

INSERT INTO alice_vector_references
SELECT * FROM alice_vector_references_v1;

DROP TABLE alice_vector_references_v1;
DROP TABLE alice_state_records_v1;

PRAGMA foreign_keys = ON;
