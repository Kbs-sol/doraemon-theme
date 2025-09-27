-- Insert initial site configuration
INSERT OR IGNORE INTO site_config (config_key, config_value, description) VALUES 
  ('site_title', 'Doraemon Movies & Episodes', 'Main site title'),
  ('site_description', 'Watch your favorite Doraemon movies and episodes for free. Daily updated content with latest releases.', 'Site meta description'),
  ('adsense_pub_id', 'ca-pub-XXXXXXXXXXXXXXXX', 'Google AdSense Publisher ID'),
  ('watch_button_delay', '5', 'Delay in seconds before watch button becomes active'),
  ('auto_generate_content', 'true', 'Enable automatic content generation'),
  ('cron_schedule', '0 2 * * *', 'Cron schedule for content generation (2 AM daily)'),
  ('api_key_search', '', 'Programmable Search Engine API Key'),
  ('search_engine_id', '', 'Custom Search Engine ID'),
  ('ai_api_key', '', 'AI API Key for content generation');

-- Insert sample Doraemon movies for testing
INSERT OR IGNORE INTO movies (title, slug, release_year, summary, trivia, poster_url, video_embed_url, video_type, seo_title, seo_description, seo_keywords, published) VALUES 
  (
    'Doraemon: Nobita and the New Steel Troops',
    'nobita-new-steel-troops-2011',
    2011,
    'When Nobita finds a stray robot and rebuilds it, he discovers it''s actually a powerful war machine. Together with Doraemon and friends, they must prevent an alien invasion.',
    'This is a remake of the 1986 film "Doraemon: Nobita and the Steel Troops". The film features updated animation and a more detailed storyline.',
    '/static/images/steel-troops-2011.jpg',
    'https://www.youtube.com/embed/SAMPLE_VIDEO_ID',
    'youtube',
    'Watch Doraemon: Nobita and the New Steel Troops (2011) - Free Online',
    'Stream Doraemon: Nobita and the New Steel Troops online for free. Join Nobita and Doraemon in their epic battle against alien robots in this thrilling 2011 adventure.',
    'Doraemon, Nobita, Steel Troops, 2011, anime movie, watch online, free',
    TRUE
  ),
  (
    'Doraemon: Nobita''s Great Adventure in the Antarctic Kachi Kochi',
    'nobita-antarctic-adventure-2017',
    2017,
    'Nobita and his friends travel to Antarctica where they discover an ancient city buried under ice and must save it from destruction.',
    'The film was the highest-grossing Doraemon film at the time of its release. It features stunning visuals of Antarctic landscapes.',
    '/static/images/antarctic-adventure-2017.jpg',
    'https://archive.org/embed/SAMPLE_ARCHIVE_ID',
    'archive',
    'Doraemon: Antarctic Adventure (2017) - Watch Free Online',
    'Experience the thrilling Antarctic adventure with Doraemon and Nobita. Watch this 2017 blockbuster anime movie online for free.',
    'Doraemon, Antarctic, Kachi Kochi, 2017, adventure, anime, watch free',
    TRUE
  ),
  (
    'Doraemon: Nobita and the Birth of Japan',
    'nobita-birth-of-japan-2016',
    2016,
    'When Nobita and friends run away from home, they travel back to prehistoric Japan where they encounter primitive humans and help them against evil spirits.',
    'This is a remake of the 1989 film. The movie explores themes of friendship, courage, and helping others in need.',
    '/static/images/birth-japan-2016.jpg',
    'https://drive.google.com/file/d/SAMPLE_DRIVE_ID/preview',
    'drive',
    'Doraemon: Birth of Japan (2016) Remake - Free Streaming',
    'Watch the 2016 remake of Doraemon: Nobita and the Birth of Japan. Join the prehistoric adventure with updated animation and storyline.',
    'Doraemon, Birth of Japan, 2016, prehistoric, remake, anime movie',
    TRUE
  );

-- Insert corresponding blog posts
INSERT OR IGNORE INTO blog_posts (movie_id, title, slug, content, excerpt, featured_image, seo_title, seo_description, seo_keywords, published) VALUES 
  (
    1,
    'Doraemon: Nobita and the New Steel Troops - A Robotic Adventure Review',
    'doraemon-steel-troops-2011-review',
    '<article class="blog-content">
      <h2>The Ultimate Robot Adventure</h2>
      <p>In 2011, Doraemon fans were treated to a spectacular remake of the beloved 1986 classic. "Nobita and the New Steel Troops" brings cutting-edge animation to this timeless story of friendship, courage, and the power of believing in yourself.</p>
      
      <h3>Plot Summary</h3>
      <p>The story begins when Nobita discovers a damaged robot in a scrapyard. With Doraemon''s help, they rebuild it, only to discover it''s actually Riruru, a scout robot from the Mechatopia planet. What starts as a friendship soon becomes a race against time as an entire robot army prepares to invade Earth.</p>
      
      <h3>Why This Movie Stands Out</h3>
      <ul>
        <li><strong>Updated Animation:</strong> The 2011 version features stunning modern animation while preserving the original''s charm</li>
        <li><strong>Emotional Depth:</strong> The relationship between Nobita and Riruru is beautifully developed</li>
        <li><strong>Action Sequences:</strong> Epic robot battles that will keep you on the edge of your seat</li>
      </ul>
      
      <h3>Fun Trivia</h3>
      <p>Did you know this movie took over 3 years to produce? The animators wanted to perfect every detail, from the robot designs to the emotional expressions of the characters.</p>
      
      <p>Ready to watch this amazing adventure? Click the button below to start streaming!</p>
    </article>',
    'Experience the ultimate robot adventure as Nobita befriends a mysterious robot and must save Earth from invasion. A perfect blend of action, emotion, and friendship.',
    '/static/images/steel-troops-blog.jpg',
    'Doraemon Steel Troops 2011 Review - Watch Online Free',
    'Read our complete review of Doraemon: Nobita and the New Steel Troops (2011). Learn about the plot, characters, and why this remake is a must-watch for anime fans.',
    'Doraemon review, Steel Troops 2011, Nobita robot adventure, anime movie review',
    TRUE
  );

-- Insert initial analytics data (sample)
INSERT OR IGNORE INTO analytics (event_type, page_url, blog_id, movie_id, user_ip, user_agent, created_at) VALUES 
  ('page_view', '/', NULL, NULL, '127.0.0.1', 'Mozilla/5.0 Test Browser', datetime('now', '-2 days')),
  ('blog_view', '/blog/doraemon-steel-troops-2011-review', 1, 1, '127.0.0.1', 'Mozilla/5.0 Test Browser', datetime('now', '-1 day')),
  ('watch_button_click', '/blog/doraemon-steel-troops-2011-review', 1, 1, '127.0.0.1', 'Mozilla/5.0 Test Browser', datetime('now', '-1 day')),
  ('video_view', '/watch/nobita-new-steel-troops-2011', NULL, 1, '127.0.0.1', 'Mozilla/5.0 Test Browser', datetime('now', '-1 day'));

-- Insert default admin user (password: admin123 - should be changed in production)
INSERT OR IGNORE INTO admin_users (username, email, password_hash) VALUES 
  ('admin', 'admin@doraemonmovies.com', '$2b$10$rQZ8kqGkwwwHFJbrJZoVzuhCkQJjYTYHhzYKJ1IKhxE1pGX6rF7eW');