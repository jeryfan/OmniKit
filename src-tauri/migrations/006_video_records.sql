-- Video parse records
CREATE TABLE IF NOT EXISTS video_records (
    id TEXT PRIMARY KEY NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    cover_url TEXT,
    duration INTEGER,
    platform TEXT NOT NULL,
    formats TEXT NOT NULL,
    download_status TEXT NOT NULL DEFAULT 'pending',
    save_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_video_records_created_at ON video_records(created_at);
