CREATE TABLE IF NOT EXISTS conversion_rules (
    id                   TEXT PRIMARY KEY,
    slug                 TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    description          TEXT,
    author               TEXT,
    version              TEXT NOT NULL DEFAULT '1.0.0',
    tags                 TEXT,
    rule_type            TEXT NOT NULL DEFAULT 'user',
    modality             TEXT NOT NULL DEFAULT 'chat',
    decode_request       TEXT NOT NULL,
    encode_request       TEXT NOT NULL,
    decode_response      TEXT NOT NULL,
    encode_response      TEXT NOT NULL,
    decode_stream_chunk  TEXT,
    encode_stream_chunk  TEXT,
    http_config          TEXT,
    enabled              INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_rules_slug ON conversion_rules(slug);
