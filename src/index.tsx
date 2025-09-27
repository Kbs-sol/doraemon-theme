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

// Track analytics
app.post('/api/analytics', async (c) => {
  const body = await c.req.json()
  const { event_type, page_url, blog_id, movie_id } = body
  const userIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const userAgent = c.req.header('User-Agent') || 'unknown'
  const referrer = c.req.header('Referer') || null

  try {
    await c.env.DB.prepare(`
      INSERT INTO analytics (event_type, page_url, blog_id, movie_id, user_ip, user_agent, referrer)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(event_type, page_url, blog_id, movie_id, userIP, userAgent, referrer).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to track analytics' }, 500)
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

// Admin routes (basic structure)
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
    </head>
    <body class="bg-gray-100">
        <div class="min-h-screen">
            <header class="bg-white shadow">
                <div class="container mx-auto px-4 py-4">
                    <h1 class="text-2xl font-bold text-gray-800">
                        <i class="fas fa-cog mr-2 text-blue-600"></i>
                        Admin Panel
                    </h1>
                </div>
            </header>
            
            <main class="container mx-auto px-4 py-8">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold mb-2">Movies</h3>
                        <p class="text-3xl font-bold text-blue-600">12</p>
                        <p class="text-sm text-gray-500">Total movies</p>
                    </div>
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold mb-2">Blog Posts</h3>
                        <p class="text-3xl font-bold text-green-600">25</p>
                        <p class="text-sm text-gray-500">Published posts</p>
                    </div>
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold mb-2">Page Views</h3>
                        <p class="text-3xl font-bold text-purple-600">1,234</p>
                        <p class="text-sm text-gray-500">This month</p>
                    </div>
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-semibold mb-2">Ad Clicks</h3>
                        <p class="text-3xl font-bold text-orange-600">89</p>
                        <p class="text-sm text-gray-500">This week</p>
                    </div>
                </div>
                
                <div class="mt-8">
                    <div class="bg-white rounded-lg shadow">
                        <div class="p-6 border-b">
                            <h3 class="text-xl font-semibold">Quick Actions</h3>
                        </div>
                        <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <button class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                                <i class="fas fa-plus mr-2"></i>Add Movie
                            </button>
                            <button class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                                <i class="fas fa-edit mr-2"></i>Create Blog Post
                            </button>
                            <button class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
                                <i class="fas fa-robot mr-2"></i>Generate Content
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </body>
    </html>
  `)
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

export default app