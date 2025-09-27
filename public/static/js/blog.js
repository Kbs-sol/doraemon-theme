// Blog page functionality with AdSense integration and watch button
class DoraemonBlog {
    constructor() {
        this.blogSlug = window.blogSlug
        this.watchButtonDelay = 5 // seconds
        this.currentBlog = null
        this.init()
    }

    async init() {
        await this.loadBlogPost()
        await this.loadSiteConfig()
        this.setupAnalytics()
        this.initializeAds()
    }

    async loadBlogPost() {
        try {
            const response = await axios.get(`/api/blog/${this.blogSlug}`)
            if (response.data.success) {
                this.currentBlog = response.data.blog
                this.renderBlogPost(this.currentBlog)
                this.updateSEOMeta(this.currentBlog)
                this.setupWatchButton(this.currentBlog)
            } else {
                this.showBlogNotFound()
            }
        } catch (error) {
            console.error('Failed to load blog post:', error)
            this.showBlogError()
        }
    }

    async loadSiteConfig() {
        try {
            const response = await axios.get('/api/config')
            if (response.data.success) {
                this.siteConfig = response.data.config
                this.watchButtonDelay = parseInt(this.siteConfig.watch_button_delay) || 5
            }
        } catch (error) {
            console.error('Failed to load site config:', error)
        }
    }

    renderBlogPost(blog) {
        const article = document.getElementById('blog-article')
        
        const publishDate = new Date(blog.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })

        const readingTime = this.estimateReadingTime(blog.content)

        article.innerHTML = `
            <!-- Featured Image -->
            <div class="relative">
                <img src="${blog.featured_image || '/static/images/default-blog.jpg'}" 
                     alt="${blog.title}" 
                     class="w-full h-64 md:h-96 object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div class="absolute bottom-6 left-6 right-6 text-white">
                    <div class="flex items-center space-x-4 mb-3 text-sm">
                        <span class="bg-blue-600 px-3 py-1 rounded-full flex items-center">
                            <i class="fas fa-calendar-alt mr-1"></i>
                            ${publishDate}
                        </span>
                        <span class="bg-green-600 px-3 py-1 rounded-full flex items-center">
                            <i class="fas fa-clock mr-1"></i>
                            ${readingTime} min read
                        </span>
                        <span class="bg-purple-600 px-3 py-1 rounded-full flex items-center">
                            <i class="fas fa-eye mr-1"></i>
                            ${this.formatNumber(blog.view_count)} views
                        </span>
                    </div>
                </div>
            </div>

            <!-- Article Content -->
            <div class="p-8">
                <header class="mb-8">
                    <h1 class="text-3xl md:text-4xl font-bold text-gray-800 mb-4 leading-tight">
                        ${blog.title}
                    </h1>
                    
                    <div class="flex items-center space-x-6 text-gray-600">
                        <div class="flex items-center space-x-2">
                            <img src="/static/images/doraemon-author.png" alt="Doraemon Bot" class="w-8 h-8 rounded-full">
                            <span class="font-medium">Doraemon Bot</span>
                        </div>
                        <div class="flex items-center space-x-1">
                            <div class="flex text-yellow-400">
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star-half-alt"></i>
                            </div>
                            <span class="text-sm">(4.8/5)</span>
                        </div>
                    </div>
                    
                    ${blog.excerpt ? `
                        <div class="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg">
                            <p class="text-gray-700 italic text-lg">${blog.excerpt}</p>
                        </div>
                    ` : ''}
                </header>

                <!-- Social Share Buttons -->
                <div class="flex items-center space-x-4 mb-8 pb-6 border-b border-gray-200">
                    <span class="text-gray-600 font-medium">Share this:</span>
                    <button onclick="this.shareOnFacebook()" class="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition-colors">
                        <i class="fab fa-facebook-f text-xl"></i>
                    </button>
                    <button onclick="this.shareOnTwitter()" class="text-blue-400 hover:bg-blue-50 p-2 rounded-full transition-colors">
                        <i class="fab fa-twitter text-xl"></i>
                    </button>
                    <button onclick="this.copyToClipboard()" class="text-gray-600 hover:bg-gray-50 p-2 rounded-full transition-colors">
                        <i class="fas fa-link text-xl"></i>
                    </button>
                </div>

                <!-- Main Content -->
                <div class="prose prose-lg max-w-none blog-content">
                    ${blog.content}
                </div>

                <!-- Movie Info Box -->
                ${blog.movie_title ? `
                    <div class="mt-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white">
                        <h3 class="text-2xl font-bold mb-3">
                            <i class="fas fa-film mr-2"></i>
                            About "${blog.movie_title}"
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="text-center">
                                <i class="fas fa-star text-yellow-300 text-2xl mb-2"></i>
                                <p class="font-semibold">Top Rated</p>
                                <p class="text-sm opacity-90">4.8/5 Stars</p>
                            </div>
                            <div class="text-center">
                                <i class="fas fa-users text-green-300 text-2xl mb-2"></i>
                                <p class="font-semibold">Family Friendly</p>
                                <p class="text-sm opacity-90">All Ages</p>
                            </div>
                            <div class="text-center">
                                <i class="fas fa-play-circle text-red-300 text-2xl mb-2"></i>
                                <p class="font-semibold">HD Quality</p>
                                <p class="text-sm opacity-90">Free Streaming</p>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Tags -->
                <div class="mt-8 pt-6 border-t border-gray-200">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-gray-600 font-medium">Tags:</span>
                        ${this.generateTags(blog.seo_keywords).map(tag => 
                            `<span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm hover:bg-gray-200 transition-colors cursor-pointer">${tag}</span>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `
    }

    setupWatchButton(blog) {
        const buttonArea = document.getElementById('watch-button-area')
        
        // Initially show countdown
        let timeLeft = this.watchButtonDelay
        
        const updateCountdown = () => {
            if (timeLeft > 0) {
                buttonArea.innerHTML = `
                    <div class="bg-white rounded-lg shadow-lg p-8 border-l-4 border-blue-500">
                        <div class="text-center">
                            <div class="mb-4">
                                <i class="fas fa-clock text-4xl text-blue-500 animate-pulse"></i>
                            </div>
                            <h3 class="text-2xl font-bold text-gray-800 mb-2">
                                Almost Ready to Watch!
                            </h3>
                            <p class="text-gray-600 mb-4">
                                Your video will be available in <span class="font-bold text-blue-600">${timeLeft}</span> seconds...
                            </p>
                            <div class="w-full bg-gray-200 rounded-full h-3">
                                <div class="bg-blue-600 h-3 rounded-full transition-all duration-1000" 
                                     style="width: ${((this.watchButtonDelay - timeLeft) / this.watchButtonDelay) * 100}%"></div>
                            </div>
                            <p class="text-sm text-gray-500 mt-3">
                                <i class="fas fa-info-circle mr-1"></i>
                                Please wait while we prepare your viewing experience
                            </p>
                        </div>
                    </div>
                `
                timeLeft--
                setTimeout(updateCountdown, 1000)
            } else {
                // Show active watch button
                buttonArea.innerHTML = `
                    <div class="bg-gradient-to-r from-green-500 to-blue-600 rounded-lg shadow-lg p-8 text-white text-center">
                        <div class="mb-4">
                            <i class="fas fa-play-circle text-6xl animate-bounce"></i>
                        </div>
                        <h3 class="text-3xl font-bold mb-3">Ready to Watch!</h3>
                        <p class="text-lg mb-6 opacity-90">
                            Click below to start watching "${blog.movie_title || 'this amazing movie'}" now
                        </p>
                        
                        <button onclick="window.doraemonBlog.goToWatch()" 
                                class="bg-white text-blue-600 px-8 py-4 rounded-full text-xl font-bold hover:bg-gray-100 transform hover:scale-105 transition-all duration-300 shadow-lg">
                            <i class="fas fa-play mr-2"></i>
                            Watch Movie Now
                        </button>
                        
                        <div class="mt-4 flex items-center justify-center space-x-6 text-sm opacity-80">
                            <div class="flex items-center">
                                <i class="fas fa-hd-video mr-1"></i>
                                HD Quality
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-volume-up mr-1"></i>
                                Full Audio
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-mobile-alt mr-1"></i>
                                Mobile Friendly
                            </div>
                        </div>
                    </div>
                `
            }
        }
        
        updateCountdown()
    }

    goToWatch() {
        if (!this.currentBlog || !this.currentBlog.movie_slug) {
            alert('Video not available yet. Please try again later.')
            return
        }

        // Track watch button click
        this.trackEvent('watch_button_click', window.location.pathname, this.currentBlog.id, this.currentBlog.movie_id)
        
        // Add small delay for tracking
        setTimeout(() => {
            window.location.href = `/watch/${this.currentBlog.movie_slug}`
        }, 100)
    }

    updateSEOMeta(blog) {
        // Update page title
        document.title = blog.seo_title || blog.title
        document.getElementById('page-title').textContent = blog.seo_title || blog.title
        
        // Update meta descriptions
        const description = blog.seo_description || blog.excerpt
        document.getElementById('page-description').setAttribute('content', description)
        
        // Update meta keywords
        if (blog.seo_keywords) {
            document.getElementById('page-keywords').setAttribute('content', blog.seo_keywords)
        }
        
        // Update Open Graph tags
        document.getElementById('og-title').setAttribute('content', blog.title)
        document.getElementById('og-description').setAttribute('content', description)
        document.getElementById('og-image').setAttribute('content', blog.featured_image || '/static/images/doraemon-og.jpg')
        
        // Update Twitter Card tags
        document.getElementById('twitter-title').setAttribute('content', blog.title)
        document.getElementById('twitter-description').setAttribute('content', description)
    }

    initializeAds() {
        // Initialize AdSense ads after a short delay
        setTimeout(() => {
            try {
                (adsbygoogle = window.adsbygoogle || []).push({})
            } catch (error) {
                console.error('AdSense initialization failed:', error)
            }
        }, 1000)
    }

    setupAnalytics() {
        // Track blog view
        this.trackEvent('blog_view', window.location.pathname, this.currentBlog?.id, this.currentBlog?.movie_id)
        
        // Track reading progress
        this.setupReadingProgress()
        
        // Track social shares
        this.setupSocialTracking()
    }

    setupReadingProgress() {
        const content = document.querySelector('.blog-content')
        if (!content) return

        let readingMilestones = [25, 50, 75, 100]
        let trackedMilestones = []

        const trackReadingProgress = () => {
            const contentTop = content.offsetTop
            const contentHeight = content.offsetHeight
            const windowHeight = window.innerHeight
            const scrollTop = window.scrollY

            const progress = Math.min(100, Math.max(0, 
                ((scrollTop - contentTop + windowHeight) / contentHeight) * 100
            ))

            readingMilestones.forEach(milestone => {
                if (progress >= milestone && !trackedMilestones.includes(milestone)) {
                    trackedMilestones.push(milestone)
                    this.trackEvent(`reading_progress_${milestone}`, window.location.pathname, this.currentBlog?.id)
                }
            })
        }

        window.addEventListener('scroll', trackReadingProgress)
    }

    setupSocialTracking() {
        // Add event listeners for social sharing
        window.doraemonBlog = this // Make instance globally available
    }

    async trackEvent(eventType, pageUrl = null, blogId = null, movieId = null) {
        try {
            await axios.post('/api/analytics', {
                event_type: eventType,
                page_url: pageUrl || window.location.pathname,
                blog_id: blogId,
                movie_id: movieId
            })
        } catch (error) {
            console.error('Analytics tracking failed:', error)
        }
    }

    // Social sharing methods
    shareOnFacebook() {
        const url = encodeURIComponent(window.location.href)
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=600,height=400')
        this.trackEvent('social_share_facebook')
    }

    shareOnTwitter() {
        const url = encodeURIComponent(window.location.href)
        const text = encodeURIComponent(this.currentBlog?.title || 'Check out this Doraemon movie!')
        window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank', 'width=600,height=400')
        this.trackEvent('social_share_twitter')
    }

    copyToClipboard() {
        navigator.clipboard.writeText(window.location.href).then(() => {
            // Show toast notification
            this.showToast('Link copied to clipboard!')
            this.trackEvent('social_share_copy')
        })
    }

    // Helper methods
    estimateReadingTime(content) {
        const wordsPerMinute = 200
        const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).length
        return Math.ceil(wordCount / wordsPerMinute)
    }

    generateTags(keywords) {
        if (!keywords) return ['Doraemon', 'Anime', 'Movie', 'Watch Online']
        return keywords.split(',').map(tag => tag.trim()).slice(0, 8)
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
        return num.toString()
    }

    showToast(message) {
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300'
        toast.textContent = message
        document.body.appendChild(toast)
        
        setTimeout(() => {
            toast.style.opacity = '0'
            setTimeout(() => toast.remove(), 300)
        }, 3000)
    }

    showBlogNotFound() {
        document.getElementById('blog-article').innerHTML = `
            <div class="text-center py-12">
                <img src="/static/images/doraemon-confused.png" alt="Not Found" class="w-32 h-32 mx-auto mb-4">
                <h2 class="text-3xl font-bold text-gray-800 mb-4">Blog Post Not Found</h2>
                <p class="text-gray-600 mb-6">The blog post you're looking for doesn't exist or has been moved.</p>
                <a href="/" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                    <i class="fas fa-home mr-2"></i>Back to Home
                </a>
            </div>
        `
    }

    showBlogError() {
        document.getElementById('blog-article').innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                <h2 class="text-3xl font-bold text-gray-800 mb-4">Something Went Wrong</h2>
                <p class="text-gray-600 mb-6">We couldn't load this blog post. Please try again.</p>
                <button onclick="window.location.reload()" 
                        class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                    <i class="fas fa-refresh mr-2"></i>Try Again
                </button>
            </div>
        `
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.doraemonBlog = new DoraemonBlog()
})