-- Add Telegram integration fields to movies table
ALTER TABLE movies ADD COLUMN telegram_file_id TEXT;
ALTER TABLE movies ADD COLUMN telegram_file_unique_id TEXT;
ALTER TABLE movies ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE movies ADD COLUMN video_duration INTEGER; -- in seconds
ALTER TABLE movies ADD COLUMN video_file_size INTEGER; -- in bytes
ALTER TABLE movies ADD COLUMN video_width INTEGER;
ALTER TABLE movies ADD COLUMN video_height INTEGER;

-- Create table for temporary video access tokens
CREATE TABLE IF NOT EXISTS video_access_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  file_id TEXT NOT NULL,
  movie_id INTEGER,
  user_ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used_count INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT 5,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

-- Create table for video streaming analytics
CREATE TABLE IF NOT EXISTS video_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER,
  file_id TEXT,
  user_ip TEXT,
  user_agent TEXT,
  stream_duration INTEGER, -- seconds watched
  quality_requested TEXT,
  stream_source TEXT CHECK(stream_source IN ('youtube', 'telegram', 'archive', 'drive')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_movies_telegram_file_id ON movies(telegram_file_id);
CREATE INDEX IF NOT EXISTS idx_video_access_tokens_expires_at ON video_access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_video_access_tokens_token_hash ON video_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_video_streams_movie_id ON video_streams(movie_id);
CREATE INDEX IF NOT EXISTS idx_video_streams_created_at ON video_streams(created_at);

-- Add site configuration for Telegram settings
INSERT OR REPLACE INTO site_config (config_key, config_value, description) VALUES 
('telegram_bot_token', '', 'Telegram Bot API Token for video storage'),
('telegram_chat_id', '', 'Telegram Chat ID for storing videos'),
('telegram_enabled', 'false', 'Enable Telegram video integration'),
('video_stream_security', 'true', 'Enable secure video streaming with tokens'),
('max_video_file_size', '2147483648', 'Maximum video file size in bytes (2GB)'),
('video_token_expiry', '3600', 'Video access token expiry time in seconds');