CREATE TABLE alice_eliza_heads (
  owner_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0)
);

CREATE TABLE alice_eliza_records (
  owner_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  value_sha256 TEXT NOT NULL CHECK(length(value_sha256) = 64),
  revision INTEGER NOT NULL CHECK(revision > 0),
  PRIMARY KEY (owner_id, collection, record_key),
  FOREIGN KEY (owner_id) REFERENCES alice_eliza_heads(owner_id)
);

CREATE INDEX alice_eliza_records_load_idx
  ON alice_eliza_records(owner_id, collection, record_key);

CREATE TABLE alice_eliza_operations (
  owner_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64),
  expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
  revision INTEGER NOT NULL CHECK(revision = expected_revision + 1),
  observed_revision INTEGER NOT NULL CHECK(observed_revision = revision),
  PRIMARY KEY (owner_id, operation_id),
  UNIQUE (owner_id, revision),
  FOREIGN KEY (owner_id) REFERENCES alice_eliza_heads(owner_id)
);
