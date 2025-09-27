-- Movies table for storing movie information
CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  release_year INTEGER,
  summary TEXT,
  trivia TEXT,
  poster_url TEXT,
  video_embed_url TEXT,
  video_type TEXT CHECK(video_type IN ('youtube', 'archive', 'drive')) DEFAULT 'youtube',
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published BOOLEAN DEFAULT FALSE
);

-- Blog posts table for storing generated content
CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image TEXT,
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT,
  view_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE SET NULL
);

-- Analytics table for tracking user interactions
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN ('page_view', 'blog_view', 'video_view', 'watch_button_click', 'ad_click')),
  page_url TEXT,
  blog_id INTEGER,
  movie_id INTEGER,
  user_ip TEXT,
  user_agent TEXT,
  referrer TEXT,
  session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (blog_id) REFERENCES blog_posts(id) ON DELETE SET NULL,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE SET NULL
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

-- Content generation jobs table for automation
CREATE TABLE IF NOT EXISTS content_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL CHECK(job_type IN ('generate_blog', 'fetch_movie_info', 'seo_update')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  movie_title TEXT,
  search_query TEXT,
  result_data TEXT, -- JSON string
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Configuration table for site settings
CREATE TABLE IF NOT EXISTS site_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies(slug);
CREATE INDEX IF NOT EXISTS idx_movies_published ON movies(published);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published);
CREATE INDEX IF NOT EXISTS idx_blog_posts_movie_id ON blog_posts(movie_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_blog_id ON analytics(blog_id);
CREATE INDEX IF NOT EXISTS idx_analytics_movie_id ON analytics(movie_id);
CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON content_jobs(status);
CREATE INDEX IF NOT EXISTS idx_site_config_key ON site_config(config_key);