-- Channels table
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    key_rotation INTEGER NOT NULL DEFAULT 0,
    rate_limit TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Channel API keys table
CREATE TABLE IF NOT EXISTS channel_api_keys (
    id TEXT PRIMARY KEY NOT NULL,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    key_value TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_used TEXT
);

-- Model mappings table
CREATE TABLE IF NOT EXISTS model_mappings (
    id TEXT PRIMARY KEY NOT NULL,
    public_name TEXT NOT NULL,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    actual_name TEXT NOT NULL,
    modality TEXT NOT NULL DEFAULT 'chat'
);

-- Tokens table (external API keys)
CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    key_value TEXT NOT NULL UNIQUE,
    quota_limit INTEGER,
    quota_used INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    allowed_models TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Request logs table
CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY NOT NULL,
    token_id TEXT,
    channel_id TEXT,
    model TEXT,
    modality TEXT,
    input_format TEXT,
    output_format TEXT,
    status INTEGER,
    latency_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    request_body TEXT,
    response_body TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);
CREATE INDEX IF NOT EXISTS idx_request_logs_channel_id ON request_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_model_mappings_public_name ON model_mappings(public_name);
CREATE INDEX IF NOT EXISTS idx_tokens_key_value ON tokens(key_value);
