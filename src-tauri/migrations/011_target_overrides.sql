CREATE TABLE IF NOT EXISTS route_target_overrides (
    id        TEXT PRIMARY KEY NOT NULL,
    target_id TEXT NOT NULL REFERENCES route_targets(id) ON DELETE CASCADE,
    scope     TEXT NOT NULL CHECK(scope IN ('body', 'header', 'query')),
    key       TEXT NOT NULL,
    value     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rto_target_id
    ON route_target_overrides(target_id);
