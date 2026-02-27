-- Add request and response headers to request_logs
ALTER TABLE request_logs ADD COLUMN request_headers TEXT;
ALTER TABLE request_logs ADD COLUMN response_headers TEXT;
