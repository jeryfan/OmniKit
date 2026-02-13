-- Proxy forwarding rules
CREATE TABLE IF NOT EXISTS proxy_rules (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path_prefix TEXT NOT NULL UNIQUE,
    target_base_url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Proxy request/response logs
CREATE TABLE IF NOT EXISTS proxy_logs (
    id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL REFERENCES proxy_rules(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    request_headers TEXT,
    request_body TEXT,
    status INTEGER,
    response_headers TEXT,
    response_body TEXT,
    latency_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proxy_logs_rule_id ON proxy_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_proxy_logs_created_at ON proxy_logs(created_at);
