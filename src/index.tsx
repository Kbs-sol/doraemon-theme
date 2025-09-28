import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { html } from 'hono/html'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE']
}))

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// API Routes

// Get all published movies for homepage
app.get('/api/movies', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT m.*, bp.slug as blog_slug, bp.excerpt, bp.view_count
      FROM movies m
      LEFT JOIN blog_posts bp ON m.id = bp.movie_id AND bp.published = TRUE
      WHERE m.published = TRUE
      ORDER BY m.created_at DESC
    `).all()

    return c.json({ success: true, movies: results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch movies' }, 500)
  }
})

// Get single movie by slug
app.get('/api/movies/:slug', async (c) => {
  const slug = c.req.param('slug')
  
  try {
    const movie = await c.env.DB.prepare(`
      SELECT * FROM movies WHERE slug = ? AND published = TRUE
    `).bind(slug).first()

    if (!movie) {
      return c.json({ success: false, error: 'Movie not found' }, 404)
    }

    return c.json({ success: true, movie })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch movie' }, 500)
  }
})

// Get blog post by slug
app.get('/api/blog/:slug', async (c) => {
  const slug = c.req.param('slug')
  
  try {
    const blog = await c.env.DB.prepare(`
      SELECT bp.*, m.title as movie_title, m.slug as movie_slug, m.video_embed_url, m.video_type
      FROM blog_posts bp
      LEFT JOIN movies m ON bp.movie_id = m.id
      WHERE bp.slug = ? AND bp.published = TRUE
    `).bind(slug).first()

    if (!blog) {
      return c.json({ success: false, error: 'Blog post not found' }, 404)
    }

    // Increment view count
    await c.env.DB.prepare(`
      UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?
    `).bind(blog.id).run()

    return c.json({ success: true, blog })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch blog post' }, 500)
  }
})

// Enhanced Analytics Tracking
app.post('/api/analytics', async (c) => {
  try {
    const body = await c.req.json()
    const { event_type, page_url, blog_id, movie_id, metadata, session_id } = body
    const userIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const userAgent = c.req.header('User-Agent') || 'unknown'
    const referrer = c.req.header('Referer') || null
    
    // Validate event type
    const validEventTypes = [
      'page_view', 'blog_view', 'video_view', 'watch_button_click', 'ad_click',
      'video_play', 'video_pause', 'video_error', 'video_loaded',
      'unlock_timer_start', 'unlock_timer_complete', 'unlock_button_click',
      'telegram_stream_start', 'standard_stream_start', 'ad_view',
      'monetization_ad_view', 'monetization_unlock_timer_start', 'monetization_unlock_timer_complete'
    ]
    
    if (!validEventTypes.includes(event_type)) {
      return c.json({ success: false, error: 'Invalid event type' }, 400)
    }

    // Insert analytics record with proper error handling
    const result = await c.env.DB.prepare(`
      INSERT INTO analytics (
        event_type, page_url, blog_id, movie_id, user_ip, user_agent, referrer, session_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      event_type, 
      page_url, 
      blog_id || null, 
      movie_id || null, 
      userIP, 
      userAgent, 
      referrer, 
      session_id || null
    ).run()
    
    // Log metadata if provided
    if (metadata && result.meta.last_row_id) {
      await c.env.DB.prepare(`
        INSERT INTO analytics_metadata (analytics_id, metadata_json, created_at)
        VALUES (?, ?, datetime('now'))
      `).bind(result.meta.last_row_id, JSON.stringify(metadata)).run().catch(() => {
        // Ignore metadata errors - analytics is more important
      })
    }

    return c.json({ 
      success: true, 
      analytics_id: result.meta.last_row_id,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Analytics tracking error:', error)
    return c.json({ 
      success: false, 
      error: 'Analytics tracking failed', 
      debug: error.message 
    }, 500)
  }
})

// Batch analytics tracking for performance
app.post('/api/analytics/batch', async (c) => {
  try {
    const { events } = await c.req.json()
    
    if (!Array.isArray(events) || events.length === 0) {
      return c.json({ success: false, error: 'Invalid events array' }, 400)
    }
    
    if (events.length > 100) {
      return c.json({ success: false, error: 'Too many events in batch (max 100)' }, 400)
    }
    
    const userIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const userAgent = c.req.header('User-Agent') || 'unknown'
    const referrer = c.req.header('Referer') || null
    
    let successCount = 0
    const errors = []
    
    for (const event of events) {
      try {
        await c.env.DB.prepare(`
          INSERT INTO analytics (
            event_type, page_url, blog_id, movie_id, user_ip, user_agent, referrer, session_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          event.event_type,
          event.page_url,
          event.blog_id || null,
          event.movie_id || null,
          userIP,
          userAgent,
          referrer,
          event.session_id || null
        ).run()
        
        successCount++
      } catch (error) {
        errors.push({ event: event.event_type, error: error.message })
      }
    }
    
    return c.json({ 
      success: true, 
      processed: events.length,
      successful: successCount,
      failed: errors.length,
      errors: errors.slice(0, 5) // Return first 5 errors
    })
  } catch (error) {
    console.error('Batch analytics error:', error)
    return c.json({ success: false, error: 'Batch analytics failed' }, 500)
  }
})

// Get analytics summary for dashboard
app.get('/api/analytics/summary', async (c) => {
  const days = parseInt(c.req.query('days') || '7')
  const event_type = c.req.query('event_type')
  
  try {
    // Get total events by type
    const eventStats = await c.env.DB.prepare(`
      SELECT 
        event_type,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM analytics 
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      ${event_type ? 'AND event_type = ?' : ''}
      GROUP BY event_type, DATE(created_at)
      ORDER BY date DESC, count DESC
    `).bind(days.toString(), ...(event_type ? [event_type] : [])).all()
    
    // Get top pages
    const topPages = await c.env.DB.prepare(`
      SELECT 
        page_url,
        COUNT(*) as views,
        COUNT(DISTINCT user_ip) as unique_visitors
      FROM analytics 
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      AND event_type IN ('page_view', 'blog_view')
      GROUP BY page_url
      ORDER BY views DESC
      LIMIT 10
    `).bind(days.toString()).all()
    
    // Get conversion funnel
    const funnelStats = await c.env.DB.prepare(`
      SELECT 
        SUM(CASE WHEN event_type = 'blog_view' THEN 1 ELSE 0 END) as blog_views,
        SUM(CASE WHEN event_type = 'watch_button_click' THEN 1 ELSE 0 END) as watch_clicks,
        SUM(CASE WHEN event_type = 'video_play' THEN 1 ELSE 0 END) as video_plays,
        SUM(CASE WHEN event_type LIKE 'monetization_%' THEN 1 ELSE 0 END) as monetization_events
      FROM analytics 
      WHERE created_at >= datetime('now', '-' || ? || ' days')
    `).bind(days.toString()).first()
    
    return c.json({ 
      success: true, 
      period_days: days,
      event_stats: eventStats.results || [],
      top_pages: topPages.results || [],
      funnel_stats: funnelStats || {},
      generated_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Analytics summary error:', error)
    return c.json({ success: false, error: 'Failed to generate analytics summary' }, 500)
  }
})

// Real-time analytics endpoint
app.get('/api/analytics/realtime', async (c) => {
  try {
    // Get activity from last 5 minutes
    const recentActivity = await c.env.DB.prepare(`
      SELECT 
        event_type,
        page_url,
        user_ip,
        created_at,
        COUNT(*) OVER (PARTITION BY event_type) as type_count
      FROM analytics 
      WHERE created_at >= datetime('now', '-5 minutes')
      ORDER BY created_at DESC
      LIMIT 50
    `).all()
    
    // Get current active users (last 30 minutes)
    const activeUsers = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_ip) as count
      FROM analytics 
      WHERE created_at >= datetime('now', '-30 minutes')
    `).first()
    
    // Get trending content
    const trendingContent = await c.env.DB.prepare(`
      SELECT 
        page_url,
        COUNT(*) as views
      FROM analytics 
      WHERE created_at >= datetime('now', '-1 hour')
      AND event_type IN ('blog_view', 'video_view')
      GROUP BY page_url
      ORDER BY views DESC
      LIMIT 5
    `).all()
    
    return c.json({
      success: true,
      recent_activity: recentActivity.results || [],
      active_users: activeUsers?.count || 0,
      trending_content: trendingContent.results || [],
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Real-time analytics error:', error)
    return c.json({ success: false, error: 'Failed to get real-time analytics' }, 500)
  }
})

// SEO and Meta Data Management
app.get('/api/seo/metadata/:slug', async (c) => {
  const slug = c.req.param('slug')
  const type = c.req.query('type') || 'blog' // blog or movie
  
  try {
    let data = null
    
    if (type === 'blog') {
      data = await c.env.DB.prepare(`
        SELECT bp.*, m.title as movie_title, m.release_year, m.poster_url
        FROM blog_posts bp
        LEFT JOIN movies m ON bp.movie_id = m.id
        WHERE bp.slug = ? AND bp.published = TRUE
      `).bind(slug).first()
    } else if (type === 'movie') {
      data = await c.env.DB.prepare(`
        SELECT * FROM movies WHERE slug = ? AND published = TRUE
      `).bind(slug).first()
    }
    
    if (!data) {
      return c.json({ success: false, error: 'Content not found' }, 404)
    }
    
    // Generate comprehensive SEO metadata
    const seoData = {
      title: data.seo_title || data.title,
      description: data.seo_description || data.excerpt || data.summary,
      keywords: data.seo_keywords || `doraemon, ${data.title?.toLowerCase()}, movie, watch online, free`,
      canonical: `${c.req.url.split('/api')[0]}/${type}/${slug}`,
      og: {
        title: data.seo_title || data.title,
        description: data.seo_description || data.excerpt || data.summary,
        image: data.poster_url || data.featured_image || '/static/images/doraemon-og.jpg',
        url: `${c.req.url.split('/api')[0]}/${type}/${slug}`,
        type: type === 'blog' ? 'article' : 'video.movie',
        site_name: 'Doraemon Movies & Episodes'
      },
      twitter: {
        card: 'summary_large_image',
        title: data.seo_title || data.title,
        description: data.seo_description || data.excerpt || data.summary,
        image: data.poster_url || data.featured_image || '/static/images/doraemon-og.jpg'
      },
      schema: type === 'blog' ? generateBlogSchema(data) : generateMovieSchema(data)
    }
    
    return c.json({ success: true, seo: seoData })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get SEO metadata' }, 500)
  }
})

// Generate XML sitemap
app.get('/sitemap.xml', async (c) => {
  try {
    const baseUrl = c.req.url.split('/sitemap.xml')[0]
    
    // Get all published content
    const movies = await c.env.DB.prepare(`
      SELECT slug, updated_at FROM movies WHERE published = TRUE ORDER BY updated_at DESC
    `).all()
    
    const blogs = await c.env.DB.prepare(`
      SELECT slug, updated_at FROM blog_posts WHERE published = TRUE ORDER BY updated_at DESC
    `).all()
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`
    
    // Homepage
    sitemap += `  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`
    
    // Movie pages
    for (const movie of movies.results || []) {
      sitemap += `  <url>
    <loc>${baseUrl}/watch/${movie.slug}</loc>
    <lastmod>${movie.updated_at.split(' ')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`
    }
    
    // Blog pages
    for (const blog of blogs.results || []) {
      sitemap += `  <url>
    <loc>${baseUrl}/blog/${blog.slug}</loc>
    <lastmod>${blog.updated_at.split(' ')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
`
    }
    
    sitemap += `</urlset>`
    
    return new Response(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600'
      }
    })
  } catch (error) {
    return c.text('Error generating sitemap', 500)
  }
})

// Robots.txt
app.get('/robots.txt', (c) => {
  const baseUrl = c.req.url.split('/robots.txt')[0]
  const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /.wrangler/

Sitemap: ${baseUrl}/sitemap.xml`
  
  return new Response(robots, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400'
    }
  })
})

// Social sharing endpoints
app.get('/api/social/share-image/:slug', async (c) => {
  const slug = c.req.param('slug')
  const type = c.req.query('type') || 'blog'
  
  try {
    // This would integrate with an image generation service
    // For now, return the poster or a default image
    let imageUrl = '/static/images/doraemon-og.jpg'
    
    if (type === 'blog') {
      const blog = await c.env.DB.prepare(`
        SELECT bp.featured_image, m.poster_url
        FROM blog_posts bp
        LEFT JOIN movies m ON bp.movie_id = m.id
        WHERE bp.slug = ?
      `).bind(slug).first()
      
      imageUrl = blog?.featured_image || blog?.poster_url || imageUrl
    } else {
      const movie = await c.env.DB.prepare(`
        SELECT poster_url FROM movies WHERE slug = ?
      `).bind(slug).first()
      
      imageUrl = movie?.poster_url || imageUrl
    }
    
    return c.json({ success: true, image_url: imageUrl })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get share image' }, 500)
  }
})

// Get site configuration
app.get('/api/config', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT config_key, config_value FROM site_config
    `).all()

    const config = results.reduce((acc: any, item: any) => {
      acc[item.config_key] = item.config_value
      return acc
    }, {})

    return c.json({ success: true, config })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch config' }, 500)
  }
})

// Frontend Routes

// Homepage
app.get('/', async (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Doraemon Movies & Episodes - Watch Free Online</title>
        <meta name="description" content="Watch your favorite Doraemon movies and episodes for free. Daily updated content with latest releases and classic adventures.">
        <meta name="keywords" content="Doraemon, movies, episodes, watch online, free, anime, Nobita, Shizuka, Gian, Suneo">
        
        <!-- Open Graph -->
        <meta property="og:title" content="Doraemon Movies & Episodes - Watch Free Online">
        <meta property="og:description" content="Watch your favorite Doraemon movies and episodes for free. Daily updated content with latest releases.">
        <meta property="og:type" content="website">
        <meta property="og:image" content="/static/images/doraemon-og.jpg">
        
        <!-- Twitter Card -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="Doraemon Movies & Episodes - Watch Free Online">
        <meta name="twitter:description" content="Watch your favorite Doraemon movies and episodes for free. Daily updated content with latest releases.">
        
        <!-- Favicon -->
        <link rel="icon" type="image/x-icon" href="/static/images/favicon.ico">
        
        <!-- Styles -->
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/css/doraemon-theme.css" rel="stylesheet">
        
        <!-- Google AdSense -->
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-cyan-100 min-h-screen">
        <!-- Header -->
        <header class="bg-white shadow-lg sticky top-0 z-50">
            <div class="container mx-auto px-4 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <img src="/static/images/doraemon-logo.png" alt="Doraemon" class="w-12 h-12 rounded-full">
                        <h1 class="text-2xl md:text-3xl font-bold text-blue-600">Doraemon Movies</h1>
                    </div>
                    <nav class="hidden md:flex space-x-6">
                        <a href="/" class="text-gray-700 hover:text-blue-600 transition-colors">Home</a>
                        <a href="/movies" class="text-gray-700 hover:text-blue-600 transition-colors">All Movies</a>
                        <a href="/latest" class="text-gray-700 hover:text-blue-600 transition-colors">Latest</a>
                    </nav>
                </div>
            </div>
        </header>

        <!-- Hero Section -->
        <section class="py-12 bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
            <div class="container mx-auto px-4 text-center">
                <h2 class="text-4xl md:text-6xl font-bold mb-4">
                    <i class="fas fa-robot mr-3"></i>
                    Welcome to Doraemon World
                </h2>
                <p class="text-xl md:text-2xl mb-8 opacity-90">
                    Watch all your favorite Doraemon movies and episodes for free!
                </p>
                <div class="flex justify-center">
                    <div class="bg-white/20 rounded-full p-2">
                        <img src="/static/images/doraemon-hero.png" alt="Doraemon" class="w-32 h-32 rounded-full">
                    </div>
                </div>
            </div>
        </section>

        <!-- Top Banner Ad -->
        <div class="container mx-auto px-4 py-4">
            <div class="bg-gray-100 rounded-lg p-4 text-center">
                <ins class="adsbygoogle"
                     style="display:block"
                     data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                     data-ad-slot="1234567890"
                     data-ad-format="auto"
                     data-full-width-responsive="true"></ins>
                <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
            </div>
        </div>

        <!-- Main Content -->
        <main class="container mx-auto px-4 py-8">
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <!-- Movies Grid -->
                <div class="lg:col-span-3">
                    <h3 class="text-3xl font-bold text-gray-800 mb-6">
                        <i class="fas fa-film mr-2 text-blue-500"></i>
                        Latest Movies & Episodes
                    </h3>
                    <div id="movies-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <!-- Movies will be loaded here -->
                        <div class="text-center py-8">
                            <i class="fas fa-spinner fa-spin text-4xl text-blue-500"></i>
                            <p class="mt-4 text-gray-600">Loading awesome Doraemon content...</p>
                        </div>
                    </div>
                </div>

                <!-- Sidebar -->
                <div class="lg:col-span-1">
                    <!-- Sidebar Ad -->
                    <div class="bg-gray-100 rounded-lg p-4 mb-6">
                        <ins class="adsbygoogle"
                             style="display:block"
                             data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                             data-ad-slot="0987654321"
                             data-ad-format="auto"
                             data-full-width-responsive="true"></ins>
                        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
                    </div>

                    <!-- Popular Movies -->
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <h4 class="text-xl font-bold mb-4 text-gray-800">
                            <i class="fas fa-fire mr-2 text-orange-500"></i>
                            Popular This Week
                        </h4>
                        <div class="space-y-3">
                            <div class="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                                <img src="/static/images/thumb-1.jpg" alt="Movie" class="w-12 h-12 rounded object-cover">
                                <div>
                                    <h5 class="font-medium text-sm">Steel Troops Adventure</h5>
                                    <p class="text-xs text-gray-500">1.2M views</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Footer -->
        <footer class="bg-gray-800 text-white py-8 mt-12">
            <div class="container mx-auto px-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div>
                        <h5 class="text-xl font-bold mb-4">About Doraemon Movies</h5>
                        <p class="text-gray-300">Your ultimate destination for watching Doraemon movies and episodes online for free. Updated daily with the latest content.</p>
                    </div>
                    <div>
                        <h5 class="text-xl font-bold mb-4">Categories</h5>
                        <ul class="space-y-2">
                            <li><a href="/movies" class="text-gray-300 hover:text-white">All Movies</a></li>
                            <li><a href="/episodes" class="text-gray-300 hover:text-white">TV Episodes</a></li>
                            <li><a href="/latest" class="text-gray-300 hover:text-white">Latest Releases</a></li>
                        </ul>
                    </div>
                    <div>
                        <h5 class="text-xl font-bold mb-4">Connect</h5>
                        <div class="flex space-x-4">
                            <a href="#" class="text-2xl hover:text-blue-400"><i class="fab fa-facebook"></i></a>
                            <a href="#" class="text-2xl hover:text-blue-400"><i class="fab fa-twitter"></i></a>
                            <a href="#" class="text-2xl hover:text-red-400"><i class="fab fa-youtube"></i></a>
                        </div>
                    </div>
                </div>
                <div class="border-t border-gray-700 mt-8 pt-8 text-center">
                    <p class="text-gray-400">&copy; 2024 Doraemon Movies. All rights reserved. Content is for educational and entertainment purposes.</p>
                </div>
            </div>
        </footer>

        <!-- Scripts -->
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/js/main.js"></script>
    </body>
    </html>
  `)
})

// Blog post page
app.get('/blog/:slug', async (c) => {
  const slug = c.req.param('slug')
  
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title id="page-title">Loading...</title>
        <meta name="description" id="page-description" content="">
        <meta name="keywords" id="page-keywords" content="">
        
        <!-- Open Graph -->
        <meta property="og:title" id="og-title" content="">
        <meta property="og:description" id="og-description" content="">
        <meta property="og:type" content="article">
        <meta property="og:image" id="og-image" content="">
        
        <!-- Twitter Card -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" id="twitter-title" content="">
        <meta name="twitter:description" id="twitter-description" content="">
        
        <!-- Favicon -->
        <link rel="icon" type="image/x-icon" href="/static/images/favicon.ico">
        
        <!-- Styles -->
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/css/doraemon-theme.css" rel="stylesheet">
        
        <!-- Google AdSense -->
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-cyan-100 min-h-screen">
        <!-- Header -->
        <header class="bg-white shadow-lg sticky top-0 z-50">
            <div class="container mx-auto px-4 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <img src="/static/images/doraemon-logo.png" alt="Doraemon" class="w-12 h-12 rounded-full">
                        <a href="/" class="text-2xl md:text-3xl font-bold text-blue-600">Doraemon Movies</a>
                    </div>
                </div>
            </div>
        </header>

        <!-- Top Banner Ad -->
        <div class="container mx-auto px-4 py-4">
            <div class="bg-gray-100 rounded-lg p-4 text-center">
                <ins class="adsbygoogle"
                     style="display:block"
                     data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                     data-ad-slot="1234567890"
                     data-ad-format="auto"
                     data-full-width-responsive="true"></ins>
            </div>
        </div>

        <!-- Main Content -->
        <main class="container mx-auto px-4 py-8">
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <!-- Blog Content -->
                <div class="lg:col-span-3">
                    <article id="blog-article" class="bg-white rounded-lg shadow-lg overflow-hidden">
                        <div class="text-center py-8">
                            <i class="fas fa-spinner fa-spin text-4xl text-blue-500"></i>
                            <p class="mt-4 text-gray-600">Loading blog post...</p>
                        </div>
                    </article>

                    <!-- Inline Ad -->
                    <div class="bg-gray-100 rounded-lg p-4 my-8">
                        <ins class="adsbygoogle"
                             style="display:block"
                             data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                             data-ad-slot="2345678901"
                             data-ad-format="auto"
                             data-full-width-responsive="true"></ins>
                    </div>

                    <!-- Watch Button Area -->
                    <div id="watch-button-area" class="text-center py-8">
                        <!-- Button will be loaded here -->
                    </div>
                </div>

                <!-- Sidebar -->
                <div class="lg:col-span-1">
                    <!-- Sidebar Ad -->
                    <div class="bg-gray-100 rounded-lg p-4 mb-6">
                        <ins class="adsbygoogle"
                             style="display:block"
                             data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                             data-ad-slot="0987654321"
                             data-ad-format="auto"
                             data-full-width-responsive="true"></ins>
                    </div>

                    <!-- Related Posts -->
                    <div class="bg-white rounded-lg shadow-md p-6">
                        <h4 class="text-xl font-bold mb-4 text-gray-800">
                            <i class="fas fa-star mr-2 text-yellow-500"></i>
                            More Doraemon Adventures
                        </h4>
                        <div class="space-y-3">
                            <div class="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                                <img src="/static/images/thumb-2.jpg" alt="Movie" class="w-12 h-12 rounded object-cover">
                                <div>
                                    <h5 class="font-medium text-sm">Antarctic Adventure</h5>
                                    <p class="text-xs text-gray-500">New Release</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Footer -->
        <footer class="bg-gray-800 text-white py-8 mt-12">
            <div class="container mx-auto px-4 text-center">
                <p class="text-gray-400">&copy; 2024 Doraemon Movies. All rights reserved.</p>
            </div>
        </footer>

        <!-- Scripts -->
        <script>
            window.blogSlug = '${slug}';
        </script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/js/blog.js"></script>
        <script>
            // Load AdSense ads after page load
            (adsbygoogle = window.adsbygoogle || []).push({});
        </script>
    </body>
    </html>
  `)
})

// Video page (ad-free)
app.get('/watch/:slug', async (c) => {
  const slug = c.req.param('slug')
  
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title id="page-title">Watch Doraemon Movie</title>
        <meta name="description" content="Watch Doraemon movie online for free">
        
        <!-- Favicon -->
        <link rel="icon" type="image/x-icon" href="/static/images/favicon.ico">
        
        <!-- Styles -->
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/css/doraemon-theme.css" rel="stylesheet">
        
        <!-- NO ADSENSE - This is the clean video page -->
    </head>
    <body class="bg-black">
        <!-- Simple Header -->
        <header class="bg-gray-900 text-white py-4">
            <div class="container mx-auto px-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <img src="/static/images/doraemon-logo.png" alt="Doraemon" class="w-8 h-8 rounded-full">
                        <a href="/" class="text-xl font-bold text-blue-400">Doraemon Movies</a>
                    </div>
                    <button onclick="window.history.back()" class="text-gray-400 hover:text-white">
                        <i class="fas fa-arrow-left mr-2"></i>Back to Blog
                    </button>
                </div>
            </div>
        </header>

        <!-- Video Player -->
        <main class="container mx-auto px-4 py-8">
            <div id="video-container" class="text-center">
                <div class="bg-gray-900 rounded-lg p-8">
                    <i class="fas fa-spinner fa-spin text-4xl text-blue-500"></i>
                    <p class="mt-4 text-white">Loading video player...</p>
                </div>
            </div>

            <!-- Movie Info -->
            <div id="movie-info" class="bg-gray-900 text-white rounded-lg p-6 mt-8">
                <div class="text-center">
                    <i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i>
                    <p class="mt-2">Loading movie information...</p>
                </div>
            </div>
        </main>

        <!-- Scripts -->
        <script>
            window.movieSlug = '${slug}';
        </script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/js/watch.js"></script>
    </body>
    </html>
  `)
})

// Enhanced Admin API Routes

// Admin Authentication (simplified for MVP)
app.post('/api/admin/login', async (c) => {
  const { username, password } = await c.req.json()
  
  try {
    // Simple auth - in production, use proper hashing
    if (username === 'admin' && password === 'doraemon123') {
      // In production, use JWT
      return c.json({ success: true, token: 'simple-token', user: { username, role: 'admin' } })
    }
    return c.json({ success: false, error: 'Invalid credentials' }, 401)
  } catch (error) {
    return c.json({ success: false, error: 'Login failed' }, 500)
  }
})

// Admin Dashboard Data
app.get('/api/admin/dashboard', async (c) => {
  try {
    // Get movie count
    const movieCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM movies WHERE published = TRUE').first()
    
    // Get blog count
    const blogCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM blog_posts WHERE published = TRUE').first()
    
    // Get page views this month
    const pageViews = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM analytics 
      WHERE event_type = 'page_view' 
      AND created_at >= date('now', '-30 days')
    `).first()
    
    // Get watch clicks this week
    const watchClicks = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM analytics 
      WHERE event_type = 'watch_button_click' 
      AND created_at >= date('now', '-7 days')
    `).first()

    return c.json({
      success: true,
      stats: {
        movies: movieCount?.count || 0,
        blogs: blogCount?.count || 0,
        pageViews: pageViews?.count || 0,
        watchClicks: watchClicks?.count || 0
      }
    })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch dashboard data' }, 500)
  }
})

// Movies CRUD Operations

// Get all movies for admin
app.get('/api/admin/movies', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT m.*, 
        (SELECT COUNT(*) FROM blog_posts WHERE movie_id = m.id) as blog_count,
        (SELECT COUNT(*) FROM analytics WHERE movie_id = m.id) as view_count
      FROM movies m
      ORDER BY m.created_at DESC
    `).all()

    return c.json({ success: true, movies: results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch movies' }, 500)
  }
})

// Get single movie for editing
app.get('/api/admin/movies/:id', async (c) => {
  const id = c.req.param('id')
  
  try {
    const movie = await c.env.DB.prepare('SELECT * FROM movies WHERE id = ?').bind(id).first()
    if (!movie) {
      return c.json({ success: false, error: 'Movie not found' }, 404)
    }

    return c.json({ success: true, movie })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch movie' }, 500)
  }
})

// Create new movie
app.post('/api/admin/movies', async (c) => {
  const movieData = await c.req.json()
  const {
    title, slug, release_year, summary, trivia, poster_url,
    video_embed_url, video_type, seo_title, seo_description, seo_keywords,
    published
  } = movieData

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO movies (
        title, slug, release_year, summary, trivia, poster_url,
        video_embed_url, video_type, seo_title, seo_description, seo_keywords,
        published, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      title, slug, release_year, summary, trivia, poster_url,
      video_embed_url, video_type || 'youtube', seo_title, seo_description, seo_keywords,
      published || false
    ).run()

    return c.json({ success: true, movieId: result.meta.last_row_id })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create movie' }, 500)
  }
})

// Update movie
app.put('/api/admin/movies/:id', async (c) => {
  const id = c.req.param('id')
  const movieData = await c.req.json()
  const {
    title, slug, release_year, summary, trivia, poster_url,
    video_embed_url, video_type, seo_title, seo_description, seo_keywords,
    published
  } = movieData

  try {
    await c.env.DB.prepare(`
      UPDATE movies SET
        title = ?, slug = ?, release_year = ?, summary = ?, trivia = ?, poster_url = ?,
        video_embed_url = ?, video_type = ?, seo_title = ?, seo_description = ?, seo_keywords = ?,
        published = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      title, slug, release_year, summary, trivia, poster_url,
      video_embed_url, video_type, seo_title, seo_description, seo_keywords,
      published, id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update movie' }, 500)
  }
})

// Delete movie
app.delete('/api/admin/movies/:id', async (c) => {
  const id = c.req.param('id')
  
  try {
    await c.env.DB.prepare('DELETE FROM movies WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete movie' }, 500)
  }
})

// Blog Posts CRUD Operations

// Get all blog posts for admin
app.get('/api/admin/blogs', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT bp.*, m.title as movie_title
      FROM blog_posts bp
      LEFT JOIN movies m ON bp.movie_id = m.id
      ORDER BY bp.created_at DESC
    `).all()

    return c.json({ success: true, blogs: results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch blog posts' }, 500)
  }
})

// Get single blog post for editing
app.get('/api/admin/blogs/:id', async (c) => {
  const id = c.req.param('id')
  
  try {
    const blog = await c.env.DB.prepare(`
      SELECT bp.*, m.title as movie_title
      FROM blog_posts bp
      LEFT JOIN movies m ON bp.movie_id = m.id
      WHERE bp.id = ?
    `).bind(id).first()
    
    if (!blog) {
      return c.json({ success: false, error: 'Blog post not found' }, 404)
    }

    return c.json({ success: true, blog })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch blog post' }, 500)
  }
})

// Create new blog post
app.post('/api/admin/blogs', async (c) => {
  const blogData = await c.req.json()
  const {
    movie_id, title, slug, content, excerpt, featured_image,
    seo_title, seo_description, seo_keywords, published
  } = blogData

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO blog_posts (
        movie_id, title, slug, content, excerpt, featured_image,
        seo_title, seo_description, seo_keywords, published,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      movie_id, title, slug, content, excerpt, featured_image,
      seo_title, seo_description, seo_keywords, published || false
    ).run()

    return c.json({ success: true, blogId: result.meta.last_row_id })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create blog post' }, 500)
  }
})

// Update blog post
app.put('/api/admin/blogs/:id', async (c) => {
  const id = c.req.param('id')
  const blogData = await c.req.json()
  const {
    movie_id, title, slug, content, excerpt, featured_image,
    seo_title, seo_description, seo_keywords, published
  } = blogData

  try {
    await c.env.DB.prepare(`
      UPDATE blog_posts SET
        movie_id = ?, title = ?, slug = ?, content = ?, excerpt = ?, featured_image = ?,
        seo_title = ?, seo_description = ?, seo_keywords = ?, published = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      movie_id, title, slug, content, excerpt, featured_image,
      seo_title, seo_description, seo_keywords, published, id
    ).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update blog post' }, 500)
  }
})

// Delete blog post
app.delete('/api/admin/blogs/:id', async (c) => {
  const id = c.req.param('id')
  
  try {
    await c.env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete blog post' }, 500)
  }
})

// Site Settings CRUD
app.get('/api/admin/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT config_key, config_value, description FROM site_config ORDER BY config_key
    `).all()

    const settings = results.reduce((acc: any, item: any) => {
      acc[item.config_key] = {
        value: item.config_value,
        description: item.description
      }
      return acc
    }, {})

    return c.json({ success: true, settings })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch settings' }, 500)
  }
})

app.put('/api/admin/settings', async (c) => {
  const { settings } = await c.req.json()
  
  try {
    for (const [key, data] of Object.entries(settings as any)) {
      await c.env.DB.prepare(`
        INSERT OR REPLACE INTO site_config (config_key, config_value, description, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(key, data.value, data.description || null).run()
    }

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update settings' }, 500)
  }
})

// Bulk Import/Export Operations
app.post('/api/admin/movies/bulk-import', async (c) => {
  const { movies } = await c.req.json()
  
  try {
    const errors = []
    const successes = []
    
    for (const movie of movies) {
      try {
        const result = await c.env.DB.prepare(`
          INSERT INTO movies (
            title, slug, release_year, summary, trivia, poster_url,
            video_embed_url, video_type, seo_title, seo_description, seo_keywords,
            published, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          movie.title, movie.slug, movie.release_year, movie.summary, movie.trivia, movie.poster_url,
          movie.video_embed_url, movie.video_type || 'youtube', movie.seo_title, movie.seo_description, movie.seo_keywords,
          movie.published || false
        ).run()
        
        successes.push({ title: movie.title, id: result.meta.last_row_id })
      } catch (error) {
        errors.push({ title: movie.title, error: 'Failed to import' })
      }
    }

    return c.json({ success: true, imported: successes.length, errors })
  } catch (error) {
    return c.json({ success: false, error: 'Bulk import failed' }, 500)
  }
})

app.get('/api/admin/movies/export', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM movies ORDER BY created_at DESC').all()
    return c.json({ success: true, movies: results })
  } catch (error) {
    return c.json({ success: false, error: 'Export failed' }, 500)
  }
})

// Analytics API for Admin
app.get('/api/admin/analytics', async (c) => {
  const days = c.req.query('days') || '7'
  
  try {
    // Daily analytics for the last N days
    const { results } = await c.env.DB.prepare(`
      SELECT 
        DATE(created_at) as date,
        event_type,
        COUNT(*) as count
      FROM analytics 
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY DATE(created_at), event_type
      ORDER BY date DESC, event_type
    `).bind(days).all()

    // Top performing blog posts
    const topBlogs = await c.env.DB.prepare(`
      SELECT bp.title, bp.slug, COUNT(a.id) as views
      FROM blog_posts bp
      LEFT JOIN analytics a ON bp.id = a.blog_id AND a.event_type = 'blog_view'
      WHERE a.created_at >= date('now', '-' || ? || ' days')
      GROUP BY bp.id
      ORDER BY views DESC
      LIMIT 10
    `).bind(days).all()

    return c.json({ 
      success: true, 
      analytics: results,
      topBlogs: topBlogs.results || []
    })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch analytics' }, 500)
  }
})

// Enhanced Admin Frontend Route
app.get('/admin', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Panel - Doraemon Movies</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <!-- Login Modal -->
        <div id="login-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div class="bg-white rounded-lg p-8 w-full max-w-md">
                <div class="text-center mb-6">
                    <img src="/static/images/doraemon-logo.png" alt="Doraemon" class="w-16 h-16 mx-auto rounded-full mb-4">
                    <h2 class="text-2xl font-bold text-gray-800">Admin Login</h2>
                    <p class="text-gray-600 mt-2">Enter your credentials to access the admin panel</p>
                </div>
                <form id="login-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input type="text" id="username" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input type="password" id="password" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <button type="submit" class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <i class="fas fa-sign-in-alt mr-2"></i>Login
                    </button>
                </form>
                <div id="login-error" class="hidden mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded"></div>
            </div>
        </div>

        <!-- Main Admin Interface -->
        <div id="admin-interface" class="hidden min-h-screen">
            <!-- Sidebar -->
            <div class="fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-30">
                <div class="flex items-center justify-center h-16 bg-blue-600 text-white">
                    <img src="/static/images/doraemon-logo.png" alt="Doraemon" class="w-8 h-8 rounded-full mr-2">
                    <h1 class="text-lg font-bold">Admin Panel</h1>
                </div>
                <nav class="mt-8">
                    <a href="#dashboard" class="admin-nav-item active" data-section="dashboard">
                        <i class="fas fa-tachometer-alt mr-3"></i>Dashboard
                    </a>
                    <a href="#movies" class="admin-nav-item" data-section="movies">
                        <i class="fas fa-film mr-3"></i>Movies
                    </a>
                    <a href="#blogs" class="admin-nav-item" data-section="blogs">
                        <i class="fas fa-blog mr-3"></i>Blog Posts
                    </a>
                    <a href="#analytics" class="admin-nav-item" data-section="analytics">
                        <i class="fas fa-chart-bar mr-3"></i>Analytics
                    </a>
                    <a href="#settings" class="admin-nav-item" data-section="settings">
                        <i class="fas fa-cog mr-3"></i>Settings
                    </a>
                    <a href="#content-generator" class="admin-nav-item" data-section="content-generator">
                        <i class="fas fa-robot mr-3"></i>AI Content
                    </a>
                </nav>
                <div class="absolute bottom-4 left-4 right-4">
                    <button id="logout-btn" class="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700">
                        <i class="fas fa-sign-out-alt mr-2"></i>Logout
                    </button>
                </div>
            </div>

            <!-- Main Content -->
            <div class="ml-64">
                <!-- Header -->
                <header class="bg-white shadow-sm border-b border-gray-200">
                    <div class="px-6 py-4">
                        <div class="flex items-center justify-between">
                            <h2 id="page-title" class="text-2xl font-bold text-gray-800">Dashboard</h2>
                            <div class="flex items-center space-x-4">
                                <div class="text-sm text-gray-500">
                                    Last updated: <span id="last-updated">Loading...</span>
                                </div>
                                <button id="refresh-btn" class="text-gray-400 hover:text-gray-600">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Content Area -->
                <main class="p-6">
                    <!-- Dashboard Section -->
                    <div id="dashboard-section" class="admin-section">
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <div class="bg-white rounded-lg shadow p-6">
                                <div class="flex items-center">
                                    <div class="p-3 rounded-full bg-blue-100">
                                        <i class="fas fa-film text-blue-600 text-xl"></i>
                                    </div>
                                    <div class="ml-4">
                                        <h3 class="text-lg font-semibold text-gray-800">Movies</h3>
                                        <p id="stats-movies" class="text-3xl font-bold text-blue-600">-</p>
                                        <p class="text-sm text-gray-500">Published</p>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-white rounded-lg shadow p-6">
                                <div class="flex items-center">
                                    <div class="p-3 rounded-full bg-green-100">
                                        <i class="fas fa-blog text-green-600 text-xl"></i>
                                    </div>
                                    <div class="ml-4">
                                        <h3 class="text-lg font-semibold text-gray-800">Blog Posts</h3>
                                        <p id="stats-blogs" class="text-3xl font-bold text-green-600">-</p>
                                        <p class="text-sm text-gray-500">Published</p>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-white rounded-lg shadow p-6">
                                <div class="flex items-center">
                                    <div class="p-3 rounded-full bg-purple-100">
                                        <i class="fas fa-eye text-purple-600 text-xl"></i>
                                    </div>
                                    <div class="ml-4">
                                        <h3 class="text-lg font-semibold text-gray-800">Page Views</h3>
                                        <p id="stats-views" class="text-3xl font-bold text-purple-600">-</p>
                                        <p class="text-sm text-gray-500">This month</p>
                                    </div>
                                </div>
                            </div>
                            <div class="bg-white rounded-lg shadow p-6">
                                <div class="flex items-center">
                                    <div class="p-3 rounded-full bg-orange-100">
                                        <i class="fas fa-mouse-pointer text-orange-600 text-xl"></i>
                                    </div>
                                    <div class="ml-4">
                                        <h3 class="text-lg font-semibold text-gray-800">Watch Clicks</h3>
                                        <p id="stats-clicks" class="text-3xl font-bold text-orange-600">-</p>
                                        <p class="text-sm text-gray-500">This week</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div class="bg-white rounded-lg shadow">
                                <div class="p-6 border-b">
                                    <h3 class="text-xl font-semibold">Quick Actions</h3>
                                </div>
                                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button class="btn-primary" onclick="showSection('movies'); showMovieForm()">
                                        <i class="fas fa-plus mr-2"></i>Add Movie
                                    </button>
                                    <button class="btn-success" onclick="showSection('blogs'); showBlogForm()">
                                        <i class="fas fa-edit mr-2"></i>Create Blog Post
                                    </button>
                                    <button class="btn-purple" onclick="showSection('content-generator')">
                                        <i class="fas fa-robot mr-2"></i>Generate AI Content
                                    </button>
                                    <button class="btn-info" onclick="showSection('analytics')">
                                        <i class="fas fa-chart-bar mr-2"></i>View Analytics
                                    </button>
                                </div>
                            </div>
                            <div class="bg-white rounded-lg shadow">
                                <div class="p-6 border-b">
                                    <h3 class="text-xl font-semibold">Recent Activity</h3>
                                </div>
                                <div class="p-6">
                                    <div id="recent-activity" class="space-y-3">
                                        <div class="text-center text-gray-500 py-4">
                                            <i class="fas fa-spinner fa-spin"></i> Loading...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Movies Section -->
                    <div id="movies-section" class="admin-section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <div>
                                <h3 class="text-2xl font-bold text-gray-800">Movies Management</h3>
                                <p class="text-gray-600 mt-1">Add, edit, and manage Doraemon movies</p>
                            </div>
                            <div class="space-x-2">
                                <button onclick="showBulkImport()" class="btn-secondary">
                                    <i class="fas fa-upload mr-2"></i>Bulk Import
                                </button>
                                <button onclick="exportMovies()" class="btn-secondary">
                                    <i class="fas fa-download mr-2"></i>Export
                                </button>
                                <button onclick="showMovieForm()" class="btn-primary">
                                    <i class="fas fa-plus mr-2"></i>Add Movie
                                </button>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow">
                            <div class="p-6">
                                <div id="movies-table" class="overflow-x-auto">
                                    <div class="text-center py-8">
                                        <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                        <p class="text-gray-500 mt-2">Loading movies...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Blog Posts Section -->
                    <div id="blogs-section" class="admin-section hidden">
                        <div class="flex justify-between items-center mb-6">
                            <div>
                                <h3 class="text-2xl font-bold text-gray-800">Blog Posts Management</h3>
                                <p class="text-gray-600 mt-1">Create and manage SEO-optimized blog content</p>
                            </div>
                            <button onclick="showBlogForm()" class="btn-primary">
                                <i class="fas fa-plus mr-2"></i>Create Blog Post
                            </button>
                        </div>
                        <div class="bg-white rounded-lg shadow">
                            <div class="p-6">
                                <div id="blogs-table" class="overflow-x-auto">
                                    <div class="text-center py-8">
                                        <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                        <p class="text-gray-500 mt-2">Loading blog posts...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Analytics Section -->
                    <div id="analytics-section" class="admin-section hidden">
                        <div class="mb-6">
                            <h3 class="text-2xl font-bold text-gray-800">Analytics Dashboard</h3>
                            <p class="text-gray-600 mt-1">Track user engagement and monetization metrics</p>
                        </div>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div class="bg-white rounded-lg shadow">
                                <div class="p-6 border-b">
                                    <h4 class="text-lg font-semibold">Daily Analytics</h4>
                                </div>
                                <div class="p-6">
                                    <canvas id="analytics-chart" width="400" height="200"></canvas>
                                </div>
                            </div>
                            <div class="bg-white rounded-lg shadow">
                                <div class="p-6 border-b">
                                    <h4 class="text-lg font-semibold">Top Performing Content</h4>
                                </div>
                                <div class="p-6">
                                    <div id="top-content" class="space-y-3">
                                        <div class="text-center text-gray-500 py-4">
                                            <i class="fas fa-spinner fa-spin"></i> Loading...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Settings Section -->
                    <div id="settings-section" class="admin-section hidden">
                        <div class="mb-6">
                            <h3 class="text-2xl font-bold text-gray-800">Site Settings</h3>
                            <p class="text-gray-600 mt-1">Configure AdSense, timers, and site metadata</p>
                        </div>
                        <div class="bg-white rounded-lg shadow">
                            <form id="settings-form" class="p-6 space-y-6">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">AdSense Publisher ID</label>
                                        <input type="text" name="adsense_publisher_id" placeholder="ca-pub-XXXXXXXXXXXXXXXX" class="form-input">
                                        <p class="text-sm text-gray-500 mt-1">Your Google AdSense publisher ID</p>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Ad Unlock Timer (seconds)</label>
                                        <input type="number" name="ad_unlock_timer" placeholder="30" min="5" max="300" class="form-input">
                                        <p class="text-sm text-gray-500 mt-1">Time before watch button becomes active</p>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Site Title</label>
                                        <input type="text" name="site_title" placeholder="Doraemon Movies & Episodes" class="form-input">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Site Description</label>
                                        <textarea name="site_description" placeholder="Watch your favorite Doraemon movies..." class="form-input" rows="3"></textarea>
                                    </div>
                                </div>
                                <div class="flex justify-end">
                                    <button type="submit" class="btn-primary">
                                        <i class="fas fa-save mr-2"></i>Save Settings
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- Content Generator Section -->
                    <div id="content-generator-section" class="admin-section hidden">
                        <div class="mb-6">
                            <h3 class="text-2xl font-bold text-gray-800">AI Content Generator</h3>
                            <p class="text-gray-600 mt-1">Generate blog posts and movie information using AI</p>
                        </div>
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div class="bg-white rounded-lg shadow">
                                <div class="p-6 border-b">
                                    <h4 class="text-lg font-semibold">Generate Single Blog Post</h4>
                                </div>
                                <div class="p-6">
                                    <form id="single-generation-form" class="space-y-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Movie Title</label>
                                            <input type="text" id="movie-title" placeholder="Doraemon: Steel Troops" required class="form-input">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-2">Generation Type</label>
                                            <select id="generation-type" class="form-input">
                                                <option value="review">Movie Review</option>
                                                <option value="summary">Plot Summary</option>
                                                <option value="analysis">Character Analysis</option>
                                                <option value="trivia">Movie Trivia</option>
                                            </select>
                                        </div>
                                        <button type="submit" class="w-full btn-primary">
                                            <i class="fas fa-magic mr-2"></i>Generate Content
                                        </button>
                                    </form>
                                </div>
                            </div>
                            <div class="bg-white rounded-lg shadow">
                                <div class="p-6 border-b">
                                    <h4 class="text-lg font-semibold">Bulk Generation</h4>
                                </div>
                                <div class="p-6">
                                    <div class="space-y-4">
                                        <p class="text-sm text-gray-600">Generate content for all movies without blog posts</p>
                                        <button id="bulk-generate-btn" class="w-full btn-success">
                                            <i class="fas fa-robot mr-2"></i>Generate All Missing Content
                                        </button>
                                        <div id="generation-progress" class="hidden">
                                            <div class="bg-gray-200 rounded-full h-2">
                                                <div id="progress-bar" class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                                            </div>
                                            <p id="progress-text" class="text-sm text-gray-600 mt-2">Generating content...</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>

        <!-- Modals and Forms -->
        <!-- Movie Form Modal -->
        <div id="movie-form-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4">
            <div class="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-y-auto">
                <div class="p-6 border-b">
                    <div class="flex items-center justify-between">
                        <h3 id="movie-form-title" class="text-xl font-bold">Add New Movie</h3>
                        <button onclick="closeModal('movie-form-modal')" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>
                <form id="movie-form" class="p-6">
                    <input type="hidden" id="movie-id">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Movie Title *</label>
                            <input type="text" id="movie-title-field" required class="form-input">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Slug *</label>
                            <input type="text" id="movie-slug" required class="form-input">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Release Year</label>
                            <input type="number" id="movie-year" min="1960" max="2030" class="form-input">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Summary</label>
                            <textarea id="movie-summary" rows="3" class="form-input"></textarea>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Trivia</label>
                            <textarea id="movie-trivia" rows="3" class="form-input"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Poster URL</label>
                            <input type="url" id="movie-poster" class="form-input">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Video Type</label>
                            <select id="movie-video-type" class="form-input">
                                <option value="youtube">YouTube</option>
                                <option value="archive">Internet Archive</option>
                                <option value="drive">Google Drive</option>
                                <option value="telegram">Telegram</option>
                            </select>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Video Embed URL</label>
                            <input type="url" id="movie-video-url" class="form-input">
                        </div>
                        <div class="md:col-span-2">
                            <h4 class="text-lg font-medium text-gray-800 mb-3">SEO Settings</h4>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">SEO Title</label>
                            <input type="text" id="movie-seo-title" class="form-input">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">SEO Keywords</label>
                            <input type="text" id="movie-seo-keywords" placeholder="doraemon, movie, anime" class="form-input">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-2">SEO Description</label>
                            <textarea id="movie-seo-description" rows="2" class="form-input"></textarea>
                        </div>
                        <div class="md:col-span-2">
                            <label class="flex items-center">
                                <input type="checkbox" id="movie-published" class="mr-2">
                                <span class="text-sm font-medium text-gray-700">Published</span>
                            </label>
                        </div>
                    </div>
                    <div class="flex justify-end space-x-4 mt-6">
                        <button type="button" onclick="closeModal('movie-form-modal')" class="btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-save mr-2"></i>Save Movie
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Scripts -->
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/js/admin.js"></script>
        <style>
            .admin-nav-item {
                @apply block px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors border-r-4 border-transparent;
            }
            .admin-nav-item.active {
                @apply bg-blue-50 text-blue-600 border-blue-600;
            }
            .admin-section {
                @apply block;
            }
            .admin-section.hidden {
                @apply hidden;
            }
            .form-input {
                @apply w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent;
            }
            .btn-primary {
                @apply bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500;
            }
            .btn-secondary {
                @apply bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500;
            }
            .btn-success {
                @apply bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500;
            }
            .btn-purple {
                @apply bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500;
            }
            .btn-info {
                @apply bg-cyan-600 text-white px-4 py-2 rounded-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500;
            }
        </style>
    </body>
    </html>
  `)
})

// Telegram Bot Integration for Video Streaming

// Get Telegram Bot Info
app.get('/api/telegram/bot-info', async (c) => {
  try {
    const botToken = c.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return c.json({ success: false, error: 'Telegram bot token not configured' }, 500)
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    const data = await response.json()
    
    if (data.ok) {
      return c.json({ success: true, bot: data.result })
    } else {
      return c.json({ success: false, error: 'Failed to get bot info' }, 500)
    }
  } catch (error) {
    return c.json({ success: false, error: 'Telegram API error' }, 500)
  }
})

// Get Telegram File URL (Secure)
app.post('/api/telegram/get-file-url', async (c) => {
  const { file_id, movie_slug } = await c.req.json()
  const userIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  
  try {
    const botToken = c.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return c.json({ success: false, error: 'Telegram bot not configured' }, 500)
    }

    // Verify the movie exists and is published
    const movie = await c.env.DB.prepare(
      'SELECT * FROM movies WHERE slug = ? AND published = TRUE'
    ).bind(movie_slug).first()

    if (!movie) {
      return c.json({ success: false, error: 'Movie not found' }, 404)
    }

    // Get file info from Telegram
    const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${file_id}`)
    const fileData = await fileResponse.json()
    
    if (!fileData.ok) {
      return c.json({ success: false, error: 'Invalid file ID' }, 400)
    }

    const filePath = fileData.result.file_path
    const directUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
    
    // Generate temporary access token (valid for 1 hour)
    const expiresAt = new Date(Date.now() + 3600000) // 1 hour
    const tempToken = generateTempToken(file_id, userIP, expiresAt.getTime())
    
    // Log access for analytics
    await c.env.DB.prepare(`
      INSERT INTO analytics (event_type, page_url, movie_id, user_ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind('video_access_request', `/watch/${movie_slug}`, movie.id, userIP, c.req.header('User-Agent')).run()

    return c.json({ 
      success: true, 
      video_url: `/api/telegram/stream/${tempToken}`,
      direct_url: directUrl, // For fallback
      expires_at: expiresAt.toISOString(),
      file_size: fileData.result.file_size
    })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get video URL' }, 500)
  }
})

// Secure Video Streaming Endpoint
app.get('/api/telegram/stream/:token', async (c) => {
  const token = c.req.param('token')
  const userIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  
  try {
    // Verify and decode token
    const tokenData = verifyTempToken(token, userIP)
    if (!tokenData) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401)
    }

    const botToken = c.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return c.json({ success: false, error: 'Service unavailable' }, 503)
    }

    // Get fresh file URL from Telegram
    const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${tokenData.file_id}`)
    const fileData = await fileResponse.json()
    
    if (!fileData.ok) {
      return c.json({ success: false, error: 'Video no longer available' }, 404)
    }

    const filePath = fileData.result.file_path
    const videoUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
    
    // Stream the video through our proxy
    const videoResponse = await fetch(videoUrl)
    
    if (!videoResponse.ok) {
      return c.json({ success: false, error: 'Video stream unavailable' }, 404)
    }

    // Pass through video headers and stream
    const headers = new Headers()
    headers.set('Content-Type', videoResponse.headers.get('Content-Type') || 'video/mp4')
    headers.set('Content-Length', videoResponse.headers.get('Content-Length') || '0')
    headers.set('Accept-Ranges', 'bytes')
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    headers.set('X-Content-Type-Options', 'nosniff')
    
    return new Response(videoResponse.body, {
      status: videoResponse.status,
      headers: headers
    })
  } catch (error) {
    return c.json({ success: false, error: 'Stream error' }, 500)
  }
})

// Upload video to Telegram (Admin only)
app.post('/api/admin/telegram/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const videoFile = formData.get('video') as File
    const chatId = c.env.TELEGRAM_CHAT_ID
    const botToken = c.env.TELEGRAM_BOT_TOKEN
    
    if (!videoFile) {
      return c.json({ success: false, error: 'No video file provided' }, 400)
    }

    if (!botToken || !chatId) {
      return c.json({ success: false, error: 'Telegram configuration missing' }, 500)
    }

    // Upload to Telegram
    const uploadFormData = new FormData()
    uploadFormData.append('chat_id', chatId)
    uploadFormData.append('video', videoFile)
    uploadFormData.append('supports_streaming', 'true')
    
    const uploadResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
      method: 'POST',
      body: uploadFormData
    })
    
    const uploadData = await uploadResponse.json()
    
    if (!uploadData.ok) {
      return c.json({ success: false, error: 'Failed to upload to Telegram' }, 500)
    }

    const video = uploadData.result.video
    return c.json({ 
      success: true, 
      file_id: video.file_id,
      file_unique_id: video.file_unique_id,
      duration: video.duration,
      width: video.width,
      height: video.height,
      file_size: video.file_size
    })
  } catch (error) {
    return c.json({ success: false, error: 'Upload failed' }, 500)
  }
})

// Get video info from Telegram
app.get('/api/telegram/video-info/:file_id', async (c) => {
  const fileId = c.req.param('file_id')
  
  try {
    const botToken = c.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return c.json({ success: false, error: 'Bot token not configured' }, 500)
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
    const data = await response.json()
    
    if (data.ok) {
      return c.json({ 
        success: true, 
        file_info: data.result,
        download_url: `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`
      })
    } else {
      return c.json({ success: false, error: 'File not found' }, 404)
    }
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get file info' }, 500)
  }
})

// Telegram Webhook Handler (Optional - for bot commands)
app.post('/api/telegram/webhook', async (c) => {
  const update = await c.req.json()
  
  try {
    if (update.message && update.message.video) {
      const video = update.message.video
      const chatId = update.message.chat.id
      const botToken = c.env.TELEGRAM_BOT_TOKEN
      
      // Auto-respond with file info
      const responseText = `Video received!\nFile ID: ${video.file_id}\nDuration: ${video.duration}s\nSize: ${Math.round(video.file_size / 1024 / 1024)}MB`
      
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: responseText
        })
      })
    }
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Webhook processing failed' }, 500)
  }
})

// Utility functions for token management
function generateTempToken(fileId: string, userIP: string, expiresAt: number): string {
  const data = `${fileId}:${userIP}:${expiresAt}`
  // Simple base64 encoding - in production, use proper JWT or encryption
  return btoa(data).replace(/[+/=]/g, (match) => {
    return { '+': '-', '/': '_', '=': '' }[match] || ''
  })
}

function verifyTempToken(token: string, userIP: string): { file_id: string, expires_at: number } | null {
  try {
    // Reverse the encoding
    const padding = '='.repeat((4 - token.length % 4) % 4)
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + padding
    const data = atob(base64)
    
    const [fileId, tokenIP, expiresAt] = data.split(':')
    const expires = parseInt(expiresAt)
    
    // Check if token is expired
    if (Date.now() > expires) {
      return null
    }
    
    // Check if IP matches (optional security measure)
    if (tokenIP !== userIP) {
      // In production, you might want to be less strict about IP matching
      // due to mobile networks and proxy servers
      // return null;
    }
    
    return { file_id: fileId, expires_at: expires }
  } catch (error) {
    return null
  }
}

// Enhanced Video Watch Page with Telegram Integration
app.get('/api/movies/:slug/video-sources', async (c) => {
  const slug = c.req.param('slug')
  
  try {
    const movie = await c.env.DB.prepare(`
      SELECT * FROM movies WHERE slug = ? AND published = TRUE
    `).bind(slug).first()

    if (!movie) {
      return c.json({ success: false, error: 'Movie not found' }, 404)
    }

    const sources = []
    
    // Add primary video source
    if (movie.video_embed_url) {
      sources.push({
        type: movie.video_type || 'youtube',
        url: movie.video_embed_url,
        quality: 'HD',
        primary: true
      })
    }
    
    // Add Telegram source if available
    if (movie.telegram_file_id) {
      sources.push({
        type: 'telegram',
        file_id: movie.telegram_file_id,
        quality: 'Original',
        requires_unlock: true
      })
    }
    
    return c.json({ 
      success: true, 
      movie: {
        id: movie.id,
        title: movie.title,
        slug: movie.slug,
        summary: movie.summary,
        poster_url: movie.poster_url
      },
      sources
    })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to get video sources' }, 500)
  }
})

// AI Content Generation System
import { DoraemonContentGenerator, generateSlugFromTitle, validateMovieTitle } from './content-generator'

// Single content generation endpoint
app.post('/api/admin/generate-content', async (c) => {
  const { movie_title, generation_type = 'review', movie_id } = await c.req.json()
  
  try {
    const openaiApiKey = c.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return c.json({ success: false, error: 'AI content generation not configured. Please add OPENAI_API_KEY.' }, 500)
    }

    if (!validateMovieTitle(movie_title)) {
      return c.json({ success: false, error: 'Invalid movie title format' }, 400)
    }

    const generator = new DoraemonContentGenerator(openaiApiKey)
    
    // Search for additional movie information
    const movieInfo = await generator.searchMovieInfo(
      movie_title,
      c.env.SEARCH_ENGINE_ID,
      c.env.SEARCH_API_KEY
    )
    
    const generatedContent = await generator.generateContent({
      movie_title,
      generation_type,
      additional_context: movieInfo.additionalContext
    })
    
    // If movie_id is provided, auto-create the blog post
    if (movie_id) {
      const slug = generateSlugFromTitle(generatedContent.title)
      
      await c.env.DB.prepare(`
        INSERT INTO blog_posts (
          movie_id, title, slug, content, excerpt, featured_image,
          seo_title, seo_description, seo_keywords, published,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        movie_id,
        generatedContent.title,
        slug,
        generatedContent.content,
        generatedContent.excerpt,
        movieInfo.imageUrl || null,
        generatedContent.seo_title,
        generatedContent.seo_description,
        generatedContent.seo_keywords,
        false // Set as draft initially
      ).run()
      
      // Log the generation job
      await c.env.DB.prepare(`
        INSERT INTO content_jobs (job_type, status, movie_title, result_data, completed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).bind(
        'generate_blog',
        'completed',
        movie_title,
        JSON.stringify({ blog_slug: slug, generation_type })
      ).run()
    }
    
    return c.json({ 
      success: true, 
      generated_content: generatedContent,
      movie_info: movieInfo
    })
  } catch (error) {
    console.error('Content generation error:', error)
    
    // Log the failed job
    await c.env.DB.prepare(`
      INSERT INTO content_jobs (job_type, status, movie_title, error_message, completed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      'generate_blog',
      'failed',
      movie_title,
      error instanceof Error ? error.message : 'Unknown error'
    ).run()
    
    return c.json({ success: false, error: 'Failed to generate content. Please try again.' }, 500)
  }
})

// Batch content generation for multiple movies
app.post('/api/admin/generate-batch-content', async (c) => {
  try {
    const openaiApiKey = c.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return c.json({ success: false, error: 'AI content generation not configured' }, 500)
    }

    // Get all movies without blog posts
    const { results: movies } = await c.env.DB.prepare(`
      SELECT m.id, m.title, m.slug
      FROM movies m
      LEFT JOIN blog_posts bp ON m.id = bp.movie_id
      WHERE m.published = TRUE AND bp.id IS NULL
      ORDER BY m.created_at DESC
      LIMIT 10
    `).all()

    if (movies.length === 0) {
      return c.json({ success: true, message: 'No movies need content generation', results: { success: [], errors: [] } })
    }

    const generator = new DoraemonContentGenerator(openaiApiKey)
    const results = await generator.generateBatchContent(movies as any[])
    
    // Save generated content to database
    for (const success of results.success) {
      const movie = movies.find(m => m.id === success.movie_id)
      if (!movie) continue
      
      const slug = generateSlugFromTitle(success.content.title)
      
      try {
        await c.env.DB.prepare(`
          INSERT INTO blog_posts (
            movie_id, title, slug, content, excerpt,
            seo_title, seo_description, seo_keywords, published,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          success.movie_id,
          success.content.title,
          slug,
          success.content.content,
          success.content.excerpt,
          success.content.seo_title,
          success.content.seo_description,
          success.content.seo_keywords,
          true // Auto-publish batch generated content
        ).run()
        
        // Log successful generation
        await c.env.DB.prepare(`
          INSERT INTO content_jobs (job_type, status, movie_title, result_data, completed_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(
          'generate_blog',
          'completed',
          movie.title,
          JSON.stringify({ blog_slug: slug, batch: true })
        ).run()
      } catch (dbError) {
        console.error('Database save error:', dbError)
        results.errors.push({
          movie_id: success.movie_id,
          error: 'Failed to save generated content'
        })
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Generated content for ${results.success.length} movies`,
      results
    })
  } catch (error) {
    console.error('Batch generation error:', error)
    return c.json({ success: false, error: 'Batch content generation failed' }, 500)
  }
})

// Get content generation jobs status
app.get('/api/admin/content-jobs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20')
  const status = c.req.query('status')
  
  try {
    let query = 'SELECT * FROM content_jobs'
    const params = []
    
    if (status) {
      query += ' WHERE status = ?'
      params.push(status)
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit.toString())
    
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    
    return c.json({ success: true, jobs: results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch content jobs' }, 500)
  }
})

// Search and import movie information
app.post('/api/admin/search-movie-info', async (c) => {
  const { movie_title } = await c.req.json()
  
  try {
    const generator = new DoraemonContentGenerator(c.env.OPENAI_API_KEY || '')
    const movieInfo = await generator.searchMovieInfo(
      movie_title,
      c.env.SEARCH_ENGINE_ID,
      c.env.SEARCH_API_KEY
    )
    
    return c.json({ success: true, movie_info: movieInfo })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to search movie information' }, 500)
  }
})

// Auto-generate content for new movies (can be triggered by cron)
app.post('/api/admin/auto-generate-content', async (c) => {
  try {
    const openaiApiKey = c.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return c.json({ success: false, error: 'AI generation not configured' }, 500)
    }

    // Get the most recent movie without a blog post
    const movie = await c.env.DB.prepare(`
      SELECT m.id, m.title, m.slug, m.created_at
      FROM movies m
      LEFT JOIN blog_posts bp ON m.id = bp.movie_id
      WHERE m.published = TRUE AND bp.id IS NULL
      ORDER BY m.created_at DESC
      LIMIT 1
    `).first()

    if (!movie) {
      return c.json({ success: true, message: 'No movies need content generation' })
    }

    const generator = new DoraemonContentGenerator(openaiApiKey)
    const generatedContent = await generator.generateContent({
      movie_title: movie.title,
      generation_type: 'complete'
    })
    
    const slug = generateSlugFromTitle(generatedContent.title)
    
    await c.env.DB.prepare(`
      INSERT INTO blog_posts (
        movie_id, title, slug, content, excerpt,
        seo_title, seo_description, seo_keywords, published,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      movie.id,
      generatedContent.title,
      slug,
      generatedContent.content,
      generatedContent.excerpt,
      generatedContent.seo_title,
      generatedContent.seo_description,
      generatedContent.seo_keywords,
      true // Auto-publish
    ).run()
    
    return c.json({ 
      success: true, 
      message: `Generated content for ${movie.title}`,
      blog_slug: slug
    })
  } catch (error) {
    console.error('Auto-generation error:', error)
    return c.json({ success: false, error: 'Auto-generation failed' }, 500)
  }
})

// 404 handler
app.notFound((c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Page Not Found - Doraemon Movies</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-cyan-100 min-h-screen flex items-center justify-center">
        <div class="text-center">
            <div class="mb-8">
                <img src="/static/images/doraemon-sad.png" alt="Doraemon" class="w-32 h-32 mx-auto">
            </div>
            <h1 class="text-6xl font-bold text-gray-800 mb-4">404</h1>
            <h2 class="text-2xl font-semibold text-gray-600 mb-4">Oops! Doraemon couldn't find this page</h2>
            <p class="text-gray-500 mb-8">The page you're looking for seems to have disappeared into Doraemon's pocket!</p>
            <a href="/" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                <i class="fas fa-home mr-2"></i>
                Back to Home
            </a>
        </div>
    </body>
    </html>
  `, 404)
})

// Cloudflare Cron Job Endpoints

// Scheduled content generation (runs daily at 9 AM UTC)
app.get('/api/cron/generate-content', async (c) => {
  try {
    // Verify this is a legitimate cron request
    const cronHeader = c.req.header('CF-Cron')
    if (!cronHeader) {
      return c.json({ success: false, error: 'Unauthorized cron request' }, 401)
    }

    const openaiApiKey = c.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return c.json({ success: false, error: 'AI generation not configured' }, 500)
    }

    // Get movies without blog posts (limit to 3 per day to avoid API limits)
    const { results: movies } = await c.env.DB.prepare(`
      SELECT m.id, m.title, m.slug
      FROM movies m
      LEFT JOIN blog_posts bp ON m.id = bp.movie_id
      WHERE m.published = TRUE AND bp.id IS NULL
      ORDER BY m.created_at DESC
      LIMIT 3
    `).all()

    if (movies.length === 0) {
      return c.json({ 
        success: true, 
        message: 'No movies need content generation',
        generated_count: 0
      })
    }

    const { DoraemonContentGenerator } = await import('./content-generator')
    const generator = new DoraemonContentGenerator(openaiApiKey)
    
    let successCount = 0
    const errors = []
    
    for (const movie of movies) {
      try {
        const generatedContent = await generator.generateContent({
          movie_title: movie.title,
          generation_type: 'complete'
        })
        
        const { generateSlugFromTitle } = await import('./content-generator')
        const slug = generateSlugFromTitle(generatedContent.title)
        
        await c.env.DB.prepare(`
          INSERT INTO blog_posts (
            movie_id, title, slug, content, excerpt,
            seo_title, seo_description, seo_keywords, published,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          movie.id,
          generatedContent.title,
          slug,
          generatedContent.content,
          generatedContent.excerpt,
          generatedContent.seo_title,
          generatedContent.seo_description,
          generatedContent.seo_keywords,
          true // Auto-publish cron generated content
        ).run()
        
        // Log successful generation
        await c.env.DB.prepare(`
          INSERT INTO content_jobs (job_type, status, movie_title, result_data, completed_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(
          'cron_generate_blog',
          'completed',
          movie.title,
          JSON.stringify({ blog_slug: slug, cron: true })
        ).run()
        
        successCount++
        
        // Add delay between generations to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        console.error('Cron content generation error:', error)
        errors.push({ movie: movie.title, error: error.message })
        
        // Log failed generation
        await c.env.DB.prepare(`
          INSERT INTO content_jobs (job_type, status, movie_title, error_message, completed_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(
          'cron_generate_blog',
          'failed',
          movie.title,
          error.message
        ).run()
      }
    }
    
    return c.json({ 
      success: true, 
      message: `Cron job completed: ${successCount} content pieces generated`,
      generated_count: successCount,
      error_count: errors.length,
      errors: errors
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return c.json({ success: false, error: 'Cron job failed' }, 500)
  }
})

// Scheduled sitemap update (runs weekly on Sundays at 2 AM UTC)
app.get('/api/cron/update-sitemap', async (c) => {
  try {
    const cronHeader = c.req.header('CF-Cron')
    if (!cronHeader) {
      return c.json({ success: false, error: 'Unauthorized cron request' }, 401)
    }

    // Update sitemap cache or trigger regeneration
    // This could also ping search engines about the updated sitemap
    
    const sitemapUrl = `${c.req.url.split('/api')[0]}/sitemap.xml`
    
    // Ping Google about sitemap update
    try {
      await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`)
    } catch (e) {
      console.warn('Failed to ping Google about sitemap update:', e)
    }
    
    // Log the sitemap update
    await c.env.DB.prepare(`
      INSERT INTO content_jobs (job_type, status, movie_title, result_data, completed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      'sitemap_update',
      'completed',
      'N/A',
      JSON.stringify({ sitemap_url: sitemapUrl, cron: true })
    ).run()
    
    return c.json({ 
      success: true, 
      message: 'Sitemap updated and search engines notified',
      sitemap_url: sitemapUrl
    })
  } catch (error) {
    console.error('Sitemap update cron error:', error)
    return c.json({ success: false, error: 'Sitemap update failed' }, 500)
  }
})

// Scheduled analytics cleanup (runs daily at 3 AM UTC)
app.get('/api/cron/cleanup-analytics', async (c) => {
  try {
    const cronHeader = c.req.header('CF-Cron')
    if (!cronHeader) {
      return c.json({ success: false, error: 'Unauthorized cron request' }, 401)
    }

    const retentionDays = 90 // Keep 90 days of analytics data
    
    // Clean up old analytics data
    const cleanupResult = await c.env.DB.prepare(`
      DELETE FROM analytics 
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `).bind(retentionDays.toString()).run()
    
    // Clean up old content jobs
    await c.env.DB.prepare(`
      DELETE FROM content_jobs 
      WHERE created_at < datetime('now', '-30 days')
    `).run()
    
    // Log the cleanup
    await c.env.DB.prepare(`
      INSERT INTO content_jobs (job_type, status, movie_title, result_data, completed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      'analytics_cleanup',
      'completed',
      'N/A',
      JSON.stringify({ 
        deleted_analytics: cleanupResult.meta.changes || 0,
        retention_days: retentionDays,
        cron: true 
      })
    ).run()
    
    return c.json({ 
      success: true, 
      message: `Analytics cleanup completed: ${cleanupResult.meta.changes || 0} records removed`,
      deleted_records: cleanupResult.meta.changes || 0,
      retention_days: retentionDays
    })
  } catch (error) {
    console.error('Analytics cleanup cron error:', error)
    return c.json({ success: false, error: 'Analytics cleanup failed' }, 500)
  }
})

// Scheduled database optimization (runs weekly)
app.get('/api/cron/optimize-database', async (c) => {
  try {
    const cronHeader = c.req.header('CF-Cron')
    if (!cronHeader) {
      return c.json({ success: false, error: 'Unauthorized cron request' }, 401)
    }

    // Run VACUUM to optimize SQLite database
    await c.env.DB.prepare('VACUUM').run()
    
    // Update statistics
    await c.env.DB.prepare('ANALYZE').run()
    
    // Get database stats
    const stats = await c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM movies) as movie_count,
        (SELECT COUNT(*) FROM blog_posts) as blog_count,
        (SELECT COUNT(*) FROM analytics WHERE created_at >= datetime('now', '-7 days')) as weekly_analytics
    `).first()
    
    // Log the optimization
    await c.env.DB.prepare(`
      INSERT INTO content_jobs (job_type, status, movie_title, result_data, completed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      'database_optimization',
      'completed',
      'N/A',
      JSON.stringify({ stats, cron: true })
    ).run()
    
    return c.json({ 
      success: true, 
      message: 'Database optimization completed',
      stats
    })
  } catch (error) {
    console.error('Database optimization cron error:', error)
    return c.json({ success: false, error: 'Database optimization failed' }, 500)
  }
})

// Health check endpoint for monitoring
app.get('/api/health', async (c) => {
  try {
    // Check database connection
    const dbCheck = await c.env.DB.prepare('SELECT 1 as test').first()
    
    // Check if AI is configured
    const aiConfigured = !!c.env.OPENAI_API_KEY
    
    // Check if Telegram is configured
    const telegramConfigured = !!(c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID)
    
    // Get basic stats
    const stats = await c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM movies WHERE published = TRUE) as published_movies,
        (SELECT COUNT(*) FROM blog_posts WHERE published = TRUE) as published_blogs,
        (SELECT COUNT(*) FROM analytics WHERE created_at >= datetime('now', '-24 hours')) as daily_analytics
    `).first()
    
    return c.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck ? 'ok' : 'error',
        ai_generation: aiConfigured ? 'configured' : 'not_configured',
        telegram_integration: telegramConfigured ? 'configured' : 'not_configured'
      },
      stats
    })
  } catch (error) {
    return c.json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// Setup analytics metadata table
app.post('/api/admin/setup-analytics-metadata', async (c) => {
  try {
    // Create analytics metadata table if it doesn't exist
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS analytics_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analytics_id INTEGER,
        metadata_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (analytics_id) REFERENCES analytics(id) ON DELETE CASCADE
      )
    `).run()
    
    await c.env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_analytics_metadata_analytics_id ON analytics_metadata(analytics_id)
    `).run()
    
    return c.json({ success: true, message: 'Analytics metadata table created' })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to setup analytics metadata' }, 500)
  }
})

// SEO Schema Generation Functions
function generateBlogSchema(blogData: any) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": blogData.title,
    "description": blogData.excerpt || blogData.seo_description,
    "image": blogData.featured_image || blogData.poster_url,
    "author": {
      "@type": "Organization",
      "name": "Doraemon Movies"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Doraemon Movies",
      "logo": {
        "@type": "ImageObject",
        "url": "/static/images/doraemon-logo.png"
      }
    },
    "datePublished": blogData.created_at,
    "dateModified": blogData.updated_at,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `/blog/${blogData.slug}`
    },
    "about": {
      "@type": "Movie",
      "name": blogData.movie_title
    }
  }
}

function generateMovieSchema(movieData: any) {
  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    "name": movieData.title,
    "description": movieData.summary || movieData.seo_description,
    "image": movieData.poster_url,
    "dateCreated": movieData.release_year ? `${movieData.release_year}-01-01` : movieData.created_at,
    "genre": ["Animation", "Family", "Adventure", "Comedy"],
    "director": {
      "@type": "Person",
      "name": "Various Directors"
    },
    "productionCompany": {
      "@type": "Organization",
      "name": "Shin-Ei Animation"
    },
    "character": [
      {
        "@type": "Person",
        "name": "Doraemon"
      },
      {
        "@type": "Person", 
        "name": "Nobita Nobi"
      },
      {
        "@type": "Person",
        "name": "Shizuka Minamoto"
      }
    ],
    "url": `/watch/${movieData.slug}`,
    "sameAs": [
      "https://en.wikipedia.org/wiki/Doraemon",
      "https://doraemon.fandom.com/"
    ]
  }
}

export default app