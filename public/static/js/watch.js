// Video page functionality (ad-free clean viewing experience)
class DoraemonWatch {
    constructor() {
        this.movieSlug = window.movieSlug
        this.currentMovie = null
        this.init()
    }

    async init() {
        await this.loadMovieData()
        this.setupAnalytics()
    }

    async loadMovieData() {
        try {
            const response = await axios.get(`/api/movies/${this.movieSlug}`)
            if (response.data.success) {
                this.currentMovie = response.data.movie
                this.renderVideoPlayer(this.currentMovie)
                this.renderMovieInfo(this.currentMovie)
                this.updatePageTitle(this.currentMovie)
            } else {
                this.showMovieNotFound()
            }
        } catch (error) {
            console.error('Failed to load movie data:', error)
            this.showMovieError()
        }
    }

    renderVideoPlayer(movie) {
        const container = document.getElementById('video-container')
        
        if (!movie.video_embed_url) {
            container.innerHTML = `
                <div class="bg-gray-900 rounded-lg p-8 text-center text-white">
                    <i class="fas fa-exclamation-triangle text-6xl text-yellow-500 mb-4"></i>
                    <h3 class="text-2xl font-bold mb-4">Video Not Available</h3>
                    <p class="text-gray-300 mb-6">
                        The video for "${movie.title}" is currently not available. 
                        Please check back later or contact support.
                    </p>
                    <div class="space-x-4">
                        <button onclick="window.history.back()" 
                                class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Go Back
                        </button>
                        <a href="/" class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors inline-block">
                            <i class="fas fa-home mr-2"></i>Home
                        </a>
                    </div>
                </div>
            `
            return
        }

        const embedHtml = this.generateEmbedHtml(movie.video_embed_url, movie.video_type)
        
        container.innerHTML = `
            <div class="relative bg-black rounded-lg overflow-hidden shadow-2xl">
                <!-- Video Player -->
                <div class="relative aspect-video">
                    ${embedHtml}
                </div>
                
                <!-- Video Controls Overlay (if needed) -->
                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <div class="flex items-center justify-between text-white">
                        <div class="flex items-center space-x-4">
                            <button onclick="this.toggleFullscreen()" 
                                    class="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
                                    title="Fullscreen">
                                <i class="fas fa-expand"></i>
                            </button>
                            
                            <div class="text-sm">
                                <span class="bg-green-500 px-2 py-1 rounded-full text-xs">
                                    <i class="fas fa-play mr-1"></i>HD
                                </span>
                                <span class="ml-2 opacity-75">Free Streaming</span>
                            </div>
                        </div>
                        
                        <div class="flex items-center space-x-3 text-sm">
                            <button onclick="this.shareVideo()" 
                                    class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">
                                <i class="fas fa-share mr-1"></i>Share
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Video Loading Success Message -->
            <div class="text-center mt-4">
                <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg inline-block">
                    <i class="fas fa-check-circle mr-2"></i>
                    Video loaded successfully! Enjoy watching "${movie.title}"
                </div>
            </div>
        `
    }

    generateEmbedHtml(embedUrl, videoType) {
        const commonClasses = "w-full h-full border-0"
        
        switch (videoType) {
            case 'youtube':
                // Extract YouTube video ID and create proper embed URL
                const youtubeId = this.extractYouTubeId(embedUrl)
                if (youtubeId) {
                    return `
                        <iframe src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1"
                                class="${commonClasses}"
                                allowfullscreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                        </iframe>
                    `
                }
                break
                
            case 'archive':
                // Internet Archive embed
                const archiveId = this.extractArchiveId(embedUrl)
                if (archiveId) {
                    return `
                        <iframe src="https://archive.org/embed/${archiveId}"
                                class="${commonClasses}"
                                allowfullscreen>
                        </iframe>
                    `
                }
                break
                
            case 'drive':
                // Google Drive embed
                const driveId = this.extractDriveId(embedUrl)
                if (driveId) {
                    return `
                        <iframe src="https://drive.google.com/file/d/${driveId}/preview"
                                class="${commonClasses}"
                                allowfullscreen>
                        </iframe>
                    `
                }
                break
                
            default:
                // Generic iframe embed
                return `
                    <iframe src="${embedUrl}"
                            class="${commonClasses}"
                            allowfullscreen>
                    </iframe>
                `
        }
        
        // Fallback if extraction fails
        return `
            <div class="flex items-center justify-center h-full bg-gray-800 text-white">
                <div class="text-center">
                    <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                    <p class="text-lg">Unable to load video player</p>
                    <p class="text-sm text-gray-400 mt-2">Invalid video URL format</p>
                </div>
            </div>
        `
    }

    renderMovieInfo(movie) {
        const container = document.getElementById('movie-info')
        
        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <!-- Movie Details -->
                <div class="lg:col-span-2">
                    <h1 class="text-3xl md:text-4xl font-bold text-white mb-4">${movie.title}</h1>
                    
                    <div class="flex flex-wrap items-center gap-4 mb-6 text-sm">
                        ${movie.release_year ? `
                            <span class="bg-blue-600 text-white px-3 py-1 rounded-full">
                                <i class="fas fa-calendar mr-1"></i>${movie.release_year}
                            </span>
                        ` : ''}
                        
                        <span class="bg-green-600 text-white px-3 py-1 rounded-full">
                            <i class="fas fa-star mr-1"></i>4.8/5
                        </span>
                        
                        <span class="bg-purple-600 text-white px-3 py-1 rounded-full">
                            <i class="fas fa-users mr-1"></i>Family Friendly
                        </span>
                        
                        <span class="bg-red-600 text-white px-3 py-1 rounded-full">
                            <i class="fas fa-hd-video mr-1"></i>HD Quality
                        </span>
                    </div>
                    
                    ${movie.summary ? `
                        <div class="mb-6">
                            <h3 class="text-xl font-semibold text-white mb-3">
                                <i class="fas fa-info-circle mr-2 text-blue-400"></i>
                                Story Summary
                            </h3>
                            <p class="text-gray-300 leading-relaxed">${movie.summary}</p>
                        </div>
                    ` : ''}
                    
                    ${movie.trivia ? `
                        <div class="mb-6">
                            <h3 class="text-xl font-semibold text-white mb-3">
                                <i class="fas fa-lightbulb mr-2 text-yellow-400"></i>
                                Fun Trivia
                            </h3>
                            <p class="text-gray-300 leading-relaxed">${movie.trivia}</p>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Sidebar Info -->
                <div class="lg:col-span-1 space-y-6">
                    <!-- Movie Poster -->
                    ${movie.poster_url ? `
                        <div class="text-center">
                            <img src="${movie.poster_url}" 
                                 alt="${movie.title}" 
                                 class="w-full max-w-xs mx-auto rounded-lg shadow-lg">
                        </div>
                    ` : ''}
                    
                    <!-- Quick Actions -->
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-lg font-semibold text-white mb-3">
                            <i class="fas fa-tools mr-2 text-blue-400"></i>
                            Quick Actions
                        </h4>
                        <div class="space-y-3">
                            <button onclick="this.toggleFullscreen()" 
                                    class="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors">
                                <i class="fas fa-expand mr-2"></i>Fullscreen Mode
                            </button>
                            
                            <button onclick="this.shareVideo()" 
                                    class="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors">
                                <i class="fas fa-share mr-2"></i>Share Movie
                            </button>
                            
                            <button onclick="window.history.back()" 
                                    class="w-full bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors">
                                <i class="fas fa-arrow-left mr-2"></i>Back to Blog
                            </button>
                        </div>
                    </div>
                    
                    <!-- Technical Info -->
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-lg font-semibold text-white mb-3">
                            <i class="fas fa-cog mr-2 text-green-400"></i>
                            Technical Details
                        </h4>
                        <div class="space-y-2 text-sm text-gray-300">
                            <div class="flex justify-between">
                                <span>Video Source:</span>
                                <span class="capitalize text-blue-400">${movie.video_type || 'Standard'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Quality:</span>
                                <span class="text-green-400">HD 1080p</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Audio:</span>
                                <span class="text-green-400">Stereo</span>
                            </div>
                            <div class="flex justify-between">
                                <span>Subtitles:</span>
                                <span class="text-green-400">Available</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Viewing Stats -->
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-lg font-semibold text-white mb-3">
                            <i class="fas fa-chart-bar mr-2 text-purple-400"></i>
                            Viewing Stats
                        </h4>
                        <div class="space-y-2 text-sm text-gray-300">
                            <div class="flex items-center justify-between">
                                <span>Currently Watching:</span>
                                <span class="text-green-400 font-semibold">You</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span>Today's Views:</span>
                                <span class="text-blue-400 font-semibold">${Math.floor(Math.random() * 1000) + 100}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span>Rating:</span>
                                <span class="text-yellow-400">★★★★☆ 4.8</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    }

    updatePageTitle(movie) {
        document.title = `Watch ${movie.title} - Doraemon Movies`
        document.getElementById('page-title').textContent = `Watch ${movie.title}`
    }

    setupAnalytics() {
        // Track video page view
        this.trackEvent('video_view', window.location.pathname, null, this.currentMovie?.id)
        
        // Track video engagement
        this.setupVideoEngagement()
        
        // Track time spent watching
        this.setupWatchTimeTracking()
    }

    setupVideoEngagement() {
        // Track when video starts, pauses, etc.
        // This would need to be customized based on the video player used
        
        let hasStartedWatching = false
        
        // Check if user is actively watching (simplified)
        const checkEngagement = () => {
            if (!hasStartedWatching && document.querySelector('iframe')) {
                hasStartedWatching = true
                this.trackEvent('video_start', window.location.pathname, null, this.currentMovie?.id)
            }
        }
        
        // Check engagement every few seconds
        setInterval(checkEngagement, 5000)
        
        // Track when user leaves the page
        window.addEventListener('beforeunload', () => {
            if (hasStartedWatching) {
                this.trackEvent('video_session_end', window.location.pathname, null, this.currentMovie?.id)
            }
        })
    }

    setupWatchTimeTracking() {
        const startTime = Date.now()
        const trackingIntervals = [30, 60, 300, 600] // 30s, 1m, 5m, 10m
        let trackedIntervals = []
        
        const checkWatchTime = () => {
            const watchTime = Math.floor((Date.now() - startTime) / 1000)
            
            trackingIntervals.forEach(interval => {
                if (watchTime >= interval && !trackedIntervals.includes(interval)) {
                    trackedIntervals.push(interval)
                    this.trackEvent(`watch_time_${interval}s`, window.location.pathname, null, this.currentMovie?.id)
                }
            })
        }
        
        setInterval(checkWatchTime, 10000) // Check every 10 seconds
    }

    // Video control methods
    toggleFullscreen() {
        const videoContainer = document.querySelector('#video-container iframe')
        if (videoContainer) {
            if (document.fullscreenElement) {
                document.exitFullscreen()
            } else {
                videoContainer.requestFullscreen().catch(err => {
                    console.error('Fullscreen failed:', err)
                    this.showToast('Fullscreen not supported')
                })
            }
            this.trackEvent('fullscreen_toggle')
        }
    }

    shareVideo() {
        const url = window.location.href
        const title = this.currentMovie?.title || 'Doraemon Movie'
        
        if (navigator.share) {
            navigator.share({
                title: `Watch ${title}`,
                text: `Check out this amazing Doraemon movie: ${title}`,
                url: url
            }).then(() => {
                this.trackEvent('video_share_native')
            })
        } else {
            // Fallback to clipboard copy
            navigator.clipboard.writeText(url).then(() => {
                this.showToast('Video link copied to clipboard!')
                this.trackEvent('video_share_copy')
            })
        }
    }

    // Utility methods for extracting video IDs
    extractYouTubeId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
        const match = url.match(regex)
        return match ? match[1] : null
    }

    extractArchiveId(url) {
        const regex = /archive\.org\/(?:embed\/|details\/)([^\/\s]+)/
        const match = url.match(regex)
        return match ? match[1] : null
    }

    extractDriveId(url) {
        const regex = /drive\.google\.com\/file\/d\/([^\/\s]+)/
        const match = url.match(regex)
        return match ? match[1] : null
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

    showToast(message) {
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300'
        toast.textContent = message
        document.body.appendChild(toast)
        
        setTimeout(() => {
            toast.style.opacity = '0'
            setTimeout(() => toast.remove(), 300)
        }, 3000)
    }

    showMovieNotFound() {
        document.getElementById('video-container').innerHTML = `
            <div class="bg-gray-900 rounded-lg p-8 text-center text-white">
                <i class="fas fa-film text-6xl text-gray-500 mb-4"></i>
                <h3 class="text-3xl font-bold mb-4">Movie Not Found</h3>
                <p class="text-gray-300 mb-6">
                    The movie you're looking for doesn't exist or has been removed.
                </p>
                <div class="space-x-4">
                    <a href="/" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors inline-block">
                        <i class="fas fa-home mr-2"></i>Browse Movies
                    </a>
                    <button onclick="window.history.back()" 
                            class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors">
                        <i class="fas fa-arrow-left mr-2"></i>Go Back
                    </button>
                </div>
            </div>
        `
    }

    showMovieError() {
        document.getElementById('video-container').innerHTML = `
            <div class="bg-gray-900 rounded-lg p-8 text-center text-white">
                <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                <h3 class="text-3xl font-bold mb-4">Loading Error</h3>
                <p class="text-gray-300 mb-6">
                    We couldn't load this movie. Please try again or contact support if the problem persists.
                </p>
                <div class="space-x-4">
                    <button onclick="window.location.reload()" 
                            class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                        <i class="fas fa-refresh mr-2"></i>Try Again
                    </button>
                    <button onclick="window.history.back()" 
                            class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors">
                        <i class="fas fa-arrow-left mr-2"></i>Go Back
                    </button>
                </div>
            </div>
        `
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DoraemonWatch()
})