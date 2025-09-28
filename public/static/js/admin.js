// Admin Panel JavaScript
let currentUser = null;
let currentSection = 'dashboard';

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in (simple session check)
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
        currentUser = { token: savedToken };
        showAdminInterface();
    } else {
        showLoginModal();
    }

    // Setup event listeners
    setupEventListeners();
    updateLastUpdated();
});

// Event Listeners Setup
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    loginForm?.addEventListener('submit', handleLogin);

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', handleLogout);

    // Navigation
    document.querySelectorAll('.admin-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            showSection(section);
        });
    });

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn?.addEventListener('click', () => {
        loadCurrentSectionData();
        updateLastUpdated();
    });

    // Forms
    const movieForm = document.getElementById('movie-form');
    movieForm?.addEventListener('submit', handleMovieSubmit);

    const settingsForm = document.getElementById('settings-form');
    settingsForm?.addEventListener('submit', handleSettingsSubmit);

    const singleGenerationForm = document.getElementById('single-generation-form');
    singleGenerationForm?.addEventListener('submit', handleSingleGeneration);

    // Auto-generate slug when title changes
    const movieTitleField = document.getElementById('movie-title-field');
    movieTitleField?.addEventListener('input', (e) => {
        const slug = generateSlug(e.target.value);
        const slugField = document.getElementById('movie-slug');
        if (slugField && !slugField.dataset.userModified) {
            slugField.value = slug;
        }
    });

    // Mark slug as user-modified when manually changed
    const movieSlugField = document.getElementById('movie-slug');
    movieSlugField?.addEventListener('input', (e) => {
        e.target.dataset.userModified = 'true';
    });
}

// Authentication Functions
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    try {
        const response = await axios.post('/api/admin/login', {
            username,
            password
        });

        if (response.data.success) {
            currentUser = response.data.user;
            localStorage.setItem('admin_token', response.data.token);
            showAdminInterface();
        } else {
            showError(errorDiv, response.data.error || 'Login failed');
        }
    } catch (error) {
        showError(errorDiv, 'Network error. Please try again.');
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('admin_token');
    document.getElementById('admin-interface').classList.add('hidden');
    showLoginModal();
}

function showLoginModal() {
    document.getElementById('login-modal').classList.remove('hidden');
}

function showAdminInterface() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('admin-interface').classList.remove('hidden');
    loadDashboardData();
}

// Section Management
function showSection(sectionName) {
    // Update navigation
    document.querySelectorAll('.admin-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`)?.classList.add('active');

    // Update sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(`${sectionName}-section`)?.classList.remove('hidden');

    // Update page title
    const pageTitle = document.getElementById('page-title');
    pageTitle.textContent = sectionName.charAt(0).toUpperCase() + sectionName.slice(1).replace('-', ' ');

    currentSection = sectionName;
    loadCurrentSectionData();
}

function loadCurrentSectionData() {
    switch(currentSection) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'movies':
            loadMoviesData();
            break;
        case 'blogs':
            loadBlogsData();
            break;
        case 'analytics':
            loadAnalyticsData();
            break;
        case 'settings':
            loadSettingsData();
            break;
    }
}

// Dashboard Functions
async function loadDashboardData() {
    try {
        const response = await axios.get('/api/admin/dashboard');
        
        if (response.data.success) {
            const stats = response.data.stats;
            document.getElementById('stats-movies').textContent = stats.movies;
            document.getElementById('stats-blogs').textContent = stats.blogs;
            document.getElementById('stats-views').textContent = stats.pageViews.toLocaleString();
            document.getElementById('stats-clicks').textContent = stats.watchClicks;
        }
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
    }
}

// Movies Management Functions
async function loadMoviesData() {
    const container = document.getElementById('movies-table');
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i><p class="text-gray-500 mt-2">Loading movies...</p></div>';

    try {
        const response = await axios.get('/api/admin/movies');
        
        if (response.data.success) {
            renderMoviesTable(response.data.movies);
        }
    } catch (error) {
        container.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-triangle"></i><p class="mt-2">Failed to load movies</p></div>';
    }
}

function renderMoviesTable(movies) {
    const container = document.getElementById('movies-table');
    
    if (movies.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-film text-4xl mb-4"></i><p>No movies found. Add your first movie!</p></div>';
        return;
    }

    const table = `
        <table class="w-full">
            <thead>
                <tr class="border-b">
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Movie</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Year</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Type</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Views</th>
                    <th class="text-center py-3 px-4 font-medium text-gray-700">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${movies.map(movie => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-4 px-4">
                            <div class="flex items-center">
                                ${movie.poster_url ? `<img src="${movie.poster_url}" alt="${movie.title}" class="w-12 h-12 rounded object-cover mr-3">` : '<div class="w-12 h-12 bg-gray-200 rounded mr-3 flex items-center justify-center"><i class="fas fa-film text-gray-400"></i></div>'}
                                <div>
                                    <h4 class="font-medium text-gray-900">${movie.title}</h4>
                                    <p class="text-sm text-gray-500">${movie.slug}</p>
                                </div>
                            </div>
                        </td>
                        <td class="py-4 px-4 text-gray-700">${movie.release_year || 'N/A'}</td>
                        <td class="py-4 px-4">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                ${movie.video_type || 'youtube'}
                            </span>
                        </td>
                        <td class="py-4 px-4">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${movie.published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                                ${movie.published ? 'Published' : 'Draft'}
                            </span>
                        </td>
                        <td class="py-4 px-4 text-gray-700">${movie.view_count || 0}</td>
                        <td class="py-4 px-4 text-center">
                            <div class="flex items-center justify-center space-x-2">
                                <button onclick="editMovie(${movie.id})" class="text-blue-600 hover:text-blue-800" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="deleteMovie(${movie.id}, '${movie.title}')" class="text-red-600 hover:text-red-800" title="Delete">
                                    <i class="fas fa-trash"></i>
                                </button>
                                <a href="/blog/${movie.slug}" target="_blank" class="text-green-600 hover:text-green-800" title="View">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Movie Form Functions
function showMovieForm(movieId = null) {
    const modal = document.getElementById('movie-form-modal');
    const form = document.getElementById('movie-form');
    const title = document.getElementById('movie-form-title');
    
    // Reset form
    form.reset();
    document.getElementById('movie-id').value = '';
    document.getElementById('movie-slug').dataset.userModified = '';
    
    if (movieId) {
        title.textContent = 'Edit Movie';
        loadMovieForEdit(movieId);
    } else {
        title.textContent = 'Add New Movie';
    }
    
    modal.classList.remove('hidden');
}

async function loadMovieForEdit(movieId) {
    try {
        const response = await axios.get(`/api/admin/movies/${movieId}`);
        
        if (response.data.success) {
            const movie = response.data.movie;
            
            document.getElementById('movie-id').value = movie.id;
            document.getElementById('movie-title-field').value = movie.title || '';
            document.getElementById('movie-slug').value = movie.slug || '';
            document.getElementById('movie-year').value = movie.release_year || '';
            document.getElementById('movie-summary').value = movie.summary || '';
            document.getElementById('movie-trivia').value = movie.trivia || '';
            document.getElementById('movie-poster').value = movie.poster_url || '';
            document.getElementById('movie-video-type').value = movie.video_type || 'youtube';
            document.getElementById('movie-video-url').value = movie.video_embed_url || '';
            document.getElementById('movie-seo-title').value = movie.seo_title || '';
            document.getElementById('movie-seo-description').value = movie.seo_description || '';
            document.getElementById('movie-seo-keywords').value = movie.seo_keywords || '';
            document.getElementById('movie-published').checked = movie.published || false;
            
            document.getElementById('movie-slug').dataset.userModified = 'true';
        }
    } catch (error) {
        console.error('Failed to load movie for editing:', error);
        alert('Failed to load movie data');
    }
}

async function handleMovieSubmit(e) {
    e.preventDefault();
    
    const movieId = document.getElementById('movie-id').value;
    const movieData = {
        title: document.getElementById('movie-title-field').value,
        slug: document.getElementById('movie-slug').value,
        release_year: parseInt(document.getElementById('movie-year').value) || null,
        summary: document.getElementById('movie-summary').value,
        trivia: document.getElementById('movie-trivia').value,
        poster_url: document.getElementById('movie-poster').value,
        video_type: document.getElementById('movie-video-type').value,
        video_embed_url: document.getElementById('movie-video-url').value,
        seo_title: document.getElementById('movie-seo-title').value,
        seo_description: document.getElementById('movie-seo-description').value,
        seo_keywords: document.getElementById('movie-seo-keywords').value,
        published: document.getElementById('movie-published').checked
    };

    try {
        let response;
        if (movieId) {
            response = await axios.put(`/api/admin/movies/${movieId}`, movieData);
        } else {
            response = await axios.post('/api/admin/movies', movieData);
        }

        if (response.data.success) {
            closeModal('movie-form-modal');
            loadMoviesData();
            showNotification(movieId ? 'Movie updated successfully!' : 'Movie created successfully!', 'success');
        } else {
            alert(response.data.error || 'Failed to save movie');
        }
    } catch (error) {
        console.error('Error saving movie:', error);
        alert('Failed to save movie. Please try again.');
    }
}

async function editMovie(movieId) {
    showMovieForm(movieId);
}

async function deleteMovie(movieId, title) {
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await axios.delete(`/api/admin/movies/${movieId}`);
        
        if (response.data.success) {
            loadMoviesData();
            showNotification('Movie deleted successfully!', 'success');
        } else {
            alert(response.data.error || 'Failed to delete movie');
        }
    } catch (error) {
        console.error('Error deleting movie:', error);
        alert('Failed to delete movie. Please try again.');
    }
}

// Blog Management Functions
async function loadBlogsData() {
    const container = document.getElementById('blogs-table');
    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i><p class="text-gray-500 mt-2">Loading blog posts...</p></div>';

    try {
        const response = await axios.get('/api/admin/blogs');
        
        if (response.data.success) {
            renderBlogsTable(response.data.blogs);
        }
    } catch (error) {
        container.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-triangle"></i><p class="mt-2">Failed to load blog posts</p></div>';
    }
}

function renderBlogsTable(blogs) {
    const container = document.getElementById('blogs-table');
    
    if (blogs.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-blog text-4xl mb-4"></i><p>No blog posts found. Create your first post!</p></div>';
        return;
    }

    const table = `
        <table class="w-full">
            <thead>
                <tr class="border-b">
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Title</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Movie</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Views</th>
                    <th class="text-left py-3 px-4 font-medium text-gray-700">Created</th>
                    <th class="text-center py-3 px-4 font-medium text-gray-700">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${blogs.map(blog => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-4 px-4">
                            <div>
                                <h4 class="font-medium text-gray-900">${blog.title}</h4>
                                <p class="text-sm text-gray-500">${blog.slug}</p>
                            </div>
                        </td>
                        <td class="py-4 px-4 text-gray-700">${blog.movie_title || 'No Movie'}</td>
                        <td class="py-4 px-4">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${blog.published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                                ${blog.published ? 'Published' : 'Draft'}
                            </span>
                        </td>
                        <td class="py-4 px-4 text-gray-700">${blog.view_count || 0}</td>
                        <td class="py-4 px-4 text-gray-700">${formatDate(blog.created_at)}</td>
                        <td class="py-4 px-4 text-center">
                            <div class="flex items-center justify-center space-x-2">
                                <button onclick="editBlog(${blog.id})" class="text-blue-600 hover:text-blue-800" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="deleteBlog(${blog.id}, '${blog.title}')" class="text-red-600 hover:text-red-800" title="Delete">
                                    <i class="fas fa-trash"></i>
                                </button>
                                <a href="/blog/${blog.slug}" target="_blank" class="text-green-600 hover:text-green-800" title="View">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

// Settings Management
async function loadSettingsData() {
    try {
        const response = await axios.get('/api/admin/settings');
        
        if (response.data.success) {
            const settings = response.data.settings;
            const form = document.getElementById('settings-form');
            
            // Populate form fields
            Object.keys(settings).forEach(key => {
                const field = form.querySelector(`[name="${key}"]`);
                if (field) {
                    field.value = settings[key].value || '';
                }
            });
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const settings = {};
    
    for (let [key, value] of formData.entries()) {
        settings[key] = { value };
    }

    try {
        const response = await axios.put('/api/admin/settings', { settings });
        
        if (response.data.success) {
            showNotification('Settings saved successfully!', 'success');
        } else {
            alert(response.data.error || 'Failed to save settings');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings. Please try again.');
    }
}

// Analytics Functions
async function loadAnalyticsData() {
    try {
        const response = await axios.get('/api/admin/analytics?days=7');
        
        if (response.data.success) {
            renderAnalyticsChart(response.data.analytics);
            renderTopContent(response.data.topBlogs);
        }
    } catch (error) {
        console.error('Failed to load analytics:', error);
    }
}

function renderAnalyticsChart(analyticsData) {
    const ctx = document.getElementById('analytics-chart');
    if (!ctx) return;

    // Process data for Chart.js
    const dates = [...new Set(analyticsData.map(item => item.date))].sort();
    const eventTypes = [...new Set(analyticsData.map(item => item.event_type))];
    
    const datasets = eventTypes.map(eventType => {
        const color = getEventTypeColor(eventType);
        return {
            label: eventType.replace('_', ' ').toUpperCase(),
            data: dates.map(date => {
                const item = analyticsData.find(d => d.date === date && d.event_type === eventType);
                return item ? item.count : 0;
            }),
            borderColor: color,
            backgroundColor: color + '20',
            tension: 0.1
        };
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: datasets
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function renderTopContent(topBlogs) {
    const container = document.getElementById('top-content');
    
    if (topBlogs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No data available</p>';
        return;
    }

    const html = topBlogs.map(blog => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
                <h5 class="font-medium text-gray-900">${blog.title}</h5>
                <p class="text-sm text-gray-500">${blog.slug}</p>
            </div>
            <span class="text-lg font-bold text-blue-600">${blog.views}</span>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Content Generation Functions
async function handleSingleGeneration(e) {
    e.preventDefault();
    
    const movieTitle = document.getElementById('movie-title').value;
    const generationType = document.getElementById('generation-type').value;

    try {
        const response = await axios.post('/api/admin/generate-content', {
            movie_title: movieTitle,
            generation_type: generationType
        });

        if (response.data.success) {
            const content = response.data.generated_content;
            
            // Show generated content in a modal or form
            showGeneratedContent(content);
        } else {
            alert(response.data.error || 'Failed to generate content');
        }
    } catch (error) {
        console.error('Error generating content:', error);
        alert('Failed to generate content. Please try again.');
    }
}

function showGeneratedContent(content) {
    // This would open a modal with the generated content
    // For now, just show an alert with the title
    alert(`Generated: ${content.title}\\n\\nContent has been generated successfully!`);
}

// Utility Functions
function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim('-');
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

function getEventTypeColor(eventType) {
    const colors = {
        'page_view': '#3B82F6',
        'blog_view': '#10B981',
        'video_view': '#8B5CF6',
        'watch_button_click': '#F59E0B',
        'ad_click': '#EF4444'
    };
    return colors[eventType] || '#6B7280';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg ${
        type === 'success' ? 'bg-green-500' : 
        type === 'error' ? 'bg-red-500' : 
        'bg-blue-500'
    } text-white`;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${
                type === 'success' ? 'fa-check-circle' : 
                type === 'error' ? 'fa-exclamation-circle' : 
                'fa-info-circle'
            } mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function updateLastUpdated() {
    document.getElementById('last-updated').textContent = new Date().toLocaleString();
}

// Bulk operations
function showBulkImport() {
    // This would show a modal for bulk import
    alert('Bulk import functionality coming soon!');
}

function exportMovies() {
    // Export movies to JSON
    axios.get('/api/admin/movies/export')
        .then(response => {
            if (response.data.success) {
                const blob = new Blob([JSON.stringify(response.data.movies, null, 2)], 
                    { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'movies-export.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        })
        .catch(error => {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        });
}

function showBlogForm() {
    // This would show the blog form modal
    alert('Blog form functionality will be added next!');
}

function editBlog(blogId) {
    alert(`Edit blog ${blogId} functionality will be added next!`);
}

function deleteBlog(blogId, title) {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
        return;
    }
    
    axios.delete(`/api/admin/blogs/${blogId}`)
        .then(response => {
            if (response.data.success) {
                loadBlogsData();
                showNotification('Blog post deleted successfully!', 'success');
            } else {
                alert(response.data.error || 'Failed to delete blog post');
            }
        })
        .catch(error => {
            console.error('Error deleting blog:', error);
            alert('Failed to delete blog post. Please try again.');
        });
}