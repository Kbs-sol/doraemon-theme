// Main JavaScript for homepage functionality
class DoraemonMovies {
    constructor() {
        this.init()
    }

    async init() {
        await this.loadMovies()
        this.setupAnalytics()
    }

    async loadMovies() {
        try {
            const response = await axios.get('/api/movies')
            if (response.data.success) {
                this.renderMovies(response.data.movies)
            }
        } catch (error) {
            console.error('Failed to load movies:', error)
            this.showError()
        }
    }

    renderMovies(movies) {
        const container = document.getElementById('movies-grid')
        
        if (movies.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <img src="/static/images/doraemon-empty.png" alt="No movies" class="w-32 h-32 mx-auto mb-4">
                    <h3 class="text-2xl font-semibold text-gray-700 mb-2">No movies yet!</h3>
                    <p class="text-gray-500">Come back soon for awesome Doraemon content!</p>
                </div>
            `
            return
        }

        const moviesHTML = movies.map(movie => {
            const blogSlug = movie.blog_slug || `blog-${movie.slug}`
            const viewCount = movie.view_count || 0
            
            return `
                <div class="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300 group">
                    <div class="relative">
                        <img src="${movie.poster_url || '/static/images/default-poster.jpg'}" 
                             alt="${movie.title}" 
                             class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300">
                        <div class="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                            ${movie.release_year || 'N/A'}
                        </div>
                        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                            <div class="flex items-center space-x-2 text-white text-sm">
                                <i class="fas fa-eye"></i>
                                <span>${this.formatNumber(viewCount)} views</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-gray-800 mb-2 line-clamp-2">
                            ${movie.title}
                        </h3>
                        
                        <p class="text-gray-600 text-sm mb-4 line-clamp-3">
                            ${movie.excerpt || movie.summary || 'Join Doraemon and Nobita in their amazing adventure!'}
                        </p>
                        
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-1 text-yellow-500">
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star-half-alt"></i>
                                <span class="text-gray-500 text-sm ml-2">(4.5)</span>
                            </div>
                            
                            <a href="/blog/${blogSlug}" 
                               class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                               onclick="this.trackClick('movie_card_click', '${movie.id}')">
                                <i class="fas fa-play mr-1"></i>
                                Read & Watch
                            </a>
                        </div>
                        
                        <div class="mt-4 pt-4 border-t border-gray-100">
                            <div class="flex items-center justify-between text-xs text-gray-500">
                                <span>
                                    <i class="fas fa-calendar mr-1"></i>
                                    ${this.formatDate(movie.created_at)}
                                </span>
                                <span class="bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                    <i class="fas fa-check mr-1"></i>
                                    Free
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `
        }).join('')

        container.innerHTML = moviesHTML
    }

    showError() {
        const container = document.getElementById('movies-grid')
        container.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                <h3 class="text-2xl font-semibold text-gray-700 mb-2">Oops! Something went wrong</h3>
                <p class="text-gray-500 mb-4">We couldn't load the movies. Please try refreshing the page.</p>
                <button onclick="window.location.reload()" 
                        class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    <i class="fas fa-refresh mr-2"></i>
                    Try Again
                </button>
            </div>
        `
    }

    setupAnalytics() {
        // Track page view
        this.trackEvent('page_view', window.location.pathname)
        
        // Track scroll depth
        let maxScroll = 0
        window.addEventListener('scroll', () => {
            const scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100)
            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent
                if (maxScroll >= 25 && maxScroll < 50) {
                    this.trackEvent('scroll_25')
                } else if (maxScroll >= 50 && maxScroll < 75) {
                    this.trackEvent('scroll_50')
                } else if (maxScroll >= 75) {
                    this.trackEvent('scroll_75')
                }
            }
        })

        // Track time on page
        const startTime = Date.now()
        window.addEventListener('beforeunload', () => {
            const timeSpent = Math.round((Date.now() - startTime) / 1000)
            if (timeSpent >= 30) { // Only track if user spent at least 30 seconds
                this.trackEvent('time_on_page', null, null, { duration: timeSpent })
            }
        })
    }

    async trackEvent(eventType, pageUrl = null, blogId = null, movieId = null, extraData = null) {
        try {
            await axios.post('/api/analytics', {
                event_type: eventType,
                page_url: pageUrl || window.location.pathname,
                blog_id: blogId,
                movie_id: movieId,
                extra_data: extraData
            })
        } catch (error) {
            console.error('Analytics tracking failed:', error)
        }
    }

    trackClick(eventType, id) {
        this.trackEvent(eventType, window.location.pathname, null, id)
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M'
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K'
        }
        return num.toString()
    }

    formatDate(dateString) {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DoraemonMovies()
})

// Add CSS for line clamping
const style = document.createElement('style')
style.textContent = `
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    
    .line-clamp-3 {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    
    .group:hover img {
        transform: scale(1.05);
    }
`
document.head.appendChild(style)