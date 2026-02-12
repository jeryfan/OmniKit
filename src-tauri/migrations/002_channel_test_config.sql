-- Add optional test configuration to channels for custom auth / URL templates.
-- test_url:     custom test URL (NULL = use base_url/v1/models)
-- test_headers: JSON object with header templates, supports {{api_key}} variable
ALTER TABLE channels ADD COLUMN test_url TEXT;
ALTER TABLE channels ADD COLUMN test_headers TEXT;
