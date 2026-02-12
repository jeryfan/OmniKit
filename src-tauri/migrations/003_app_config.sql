CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_config (key, value) VALUES ('server_port', '9000');
INSERT OR IGNORE INTO app_config (key, value) VALUES ('log_retention_days', '30');
