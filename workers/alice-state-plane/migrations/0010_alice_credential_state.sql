CREATE TABLE IF NOT EXISTS alice_credential_state (
  provider_id TEXT PRIMARY KEY NOT NULL CHECK(provider_id = 'openai-codex'),
  schema_version TEXT NOT NULL CHECK(schema_version = 'alice.credential-snapshot.v1'),
  generation INTEGER NOT NULL CHECK(generation >= 0),
  snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256) = 71),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms)
);

CREATE TABLE IF NOT EXISTS alice_credential_events (
  provider_id TEXT NOT NULL CHECK(provider_id = 'openai-codex'),
  generation INTEGER NOT NULL CHECK(generation >= 0),
  operation TEXT NOT NULL CHECK(operation IN ('put','delete')),
  snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256) = 71),
  recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
  PRIMARY KEY (provider_id, generation, operation)
);

CREATE INDEX IF NOT EXISTS alice_credential_events_recorded_idx
  ON alice_credential_events(recorded_at_ms, provider_id, generation);
