-- Add request and upstream URLs to request_logs
ALTER TABLE request_logs ADD COLUMN request_url TEXT;
ALTER TABLE request_logs ADD COLUMN upstream_url TEXT;
