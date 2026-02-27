-- Drop old tables
DROP TABLE IF EXISTS model_mappings;
DROP TABLE IF EXISTS channel_api_keys;
DROP TABLE IF EXISTS channels;

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path_prefix TEXT NOT NULL UNIQUE,
    input_format TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Route targets table
CREATE TABLE IF NOT EXISTS route_targets (
    id TEXT PRIMARY KEY NOT NULL,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    upstream_format TEXT NOT NULL,
    base_url TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    key_rotation INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Route target keys table
CREATE TABLE IF NOT EXISTS route_target_keys (
    id TEXT PRIMARY KEY NOT NULL,
    target_id TEXT NOT NULL REFERENCES route_targets(id) ON DELETE CASCADE,
    key_value TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
);

-- Add target_id and route_id to request_logs (channel_id kept as nullable legacy)
ALTER TABLE request_logs ADD COLUMN route_id TEXT;
ALTER TABLE request_logs ADD COLUMN target_id TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_routes_path_prefix ON routes(path_prefix);
CREATE INDEX IF NOT EXISTS idx_route_targets_route_id ON route_targets(route_id);
CREATE INDEX IF NOT EXISTS idx_route_target_keys_target_id ON route_target_keys(target_id);
