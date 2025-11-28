// Main JavaScript file for website functionality

// Global variables
let currentUser = null;
let posts = [];
let users = [];

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    await checkAuthentication();
    loadPageSpecificFunctions();
}

// Authentication functions
async function checkAuthentication() {
    try {
        const response = await fetch('/api/user-info');
        if (response.ok) {
            const userData = await response.json();
            currentUser = userData;
            updateUIForLoggedInUser();
        } else {
            redirectToLogin();
        }
    } catch (error) {
        console.error('Authentication check failed:', error);
        redirectToLogin();
    }
}

function redirectToLogin() {
    if (!window.location.pathname.includes('login.html') && 
        !window.location.pathname.includes('register.html')) {
        window.location.href = '/login.html';
    }
}

function updateUIForLoggedInUser() {
    // Update navigation
    const navElements = document.querySelectorAll('.user-greeting, .profile-link');
    navElements.forEach(element => {
        if (element.classList.contains('user-greeting')) {
            element.textContent = `Soo dhawoow, ${currentUser.username}!`;
        }
        if (element.classList.contains('profile-link')) {
            element.textContent = currentUser.username;
            element.href = `profile.html?user=${currentUser.username}`;
        }
    });
}

// API functions
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (response.status === 401) {
            redirectToLogin();
            return null;
        }

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        showNotification('Qalad ayaa dhacay', 'error');
        return null;
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;

    // Add styles if not exists
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                z-index: 1000;
                max-width: 300px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideIn 0.3s ease;
            }
            .notification.success { background: #28a745; }
            .notification.error { background: #dc3545; }
            .notification.info { background: #17a2b8; }
            .notification.warning { background: #ffc107; color: #000; }
            .notification button {
                background: none;
                border: none;
                color: inherit;
                margin-left: 10px;
                cursor: pointer;
                font-weight: bold;
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Form validation
function validateForm(formData, rules) {
    const errors = {};

    for (const [field, rule] of Object.entries(rules)) {
        const value = formData.get(field);
        
        if (rule.required && (!value || value.trim() === '')) {
            errors[field] = 'Field required';
            continue;
        }

        if (value) {
            if (rule.minLength && value.length < rule.minLength) {
                errors[field] = `Must be at least ${rule.minLength} characters`;
            }
            
            if (rule.maxLength && value.length > rule.maxLength) {
                errors[field] = `Must be less than ${rule.maxLength} characters`;
            }
            
            if (rule.pattern && !rule.pattern.test(value)) {
                errors[field] = rule.message || 'Invalid format';
            }
            
            if (field === 'confirmPassword' && value !== formData.get('password')) {
                errors[field] = 'Passwords do not match';
            }
        }
    }

    return errors;
}

function displayFormErrors(form, errors) {
    // Clear previous errors
    const existingErrors = form.querySelectorAll('.error-message');
    existingErrors.forEach(error => error.remove());

    // Remove error classes
    const errorInputs = form.querySelectorAll('.error');
    errorInputs.forEach(input => input.classList.remove('error'));

    // Add new errors
    for (const [field, message] of Object.entries(errors)) {
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
            input.classList.add('error');
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.textContent = message;
            errorElement.style.cssText = 'color: #dc3545; font-size: 12px; margin-top: 5px;';
            input.parentNode.appendChild(errorElement);
        }
    }
}

// File upload handling
function handleFileUpload(input, previewId, maxSizeMB = 50) {
    return new Promise((resolve, reject) => {
        const file = input.files[0];
        if (!file) {
            resolve(null);
            return;
        }

        // Check file size
        const maxSize = maxSizeMB * 1024 * 1024;
        if (file.size > maxSize) {
            showNotification(`File too large. Maximum size is ${maxSizeMB}MB`, 'error');
            input.value = '';
            reject(new Error('File too large'));
            return;
        }

        // Create preview
        const preview = document.getElementById(previewId);
        if (preview) {
            const reader = new FileReader();
            reader.onload = function(e) {
                if (file.type.startsWith('image/')) {
                    preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 8px;">`;
                } else if (file.type.startsWith('video/')) {
                    preview.innerHTML = `
                        <video controls style="max-width: 300px; max-height: 200px; border-radius: 8px;">
                            <source src="${e.target.result}" type="${file.type}">
                            Video not supported.
                        </video>
                        <p>${file.name}</p>
                    `;
                } else if (file.type.startsWith('audio/')) {
                    preview.innerHTML = `
                        <audio controls style="width: 100%;">
                            <source src="${e.target.result}" type="${file.type}">
                            Audio not supported.
                        </audio>
                        <p>${file.name}</p>
                    `;
                } else {
                    preview.innerHTML = `<p>File: ${file.name}</p>`;
                }
            };
            reader.readAsDataURL(file);
        }

        resolve(file);
    });
}

// Search functionality
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Date formatting
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

// Modal handling
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

// Page-specific function loader
function loadPageSpecificFunctions() {
    const page = window.location.pathname.split('/').pop();
    
    switch(page) {
        case 'index.html':
        case '':
            loadIndexFunctions();
            break;
        case 'profile.html':
            loadProfileFunctions();
            break;
        case 'create-post.html':
            loadCreatePostFunctions();
            break;
        case 'user-list.html':
            loadUserListFunctions();
            break;
        case 'sheeko.html':
            loadChatFunctions();
            break;
        case 'admin.html':
            loadAdminFunctions();
            break;
        case 'settings.html':
            loadSettingsFunctions();
            break;
    }
}

// Index page functions
function loadIndexFunctions() {
    loadPosts();
    setupSearch();
    setupPostInteractions();
}

async function loadPosts() {
    try {
        const postsData = await apiCall('/api/posts');
        if (postsData) {
            posts = postsData;
            displayPosts(posts);
        }
    } catch (error) {
        console.error('Error loading posts:', error);
    }
}

function displayPosts(postsArray) {
    const container = document.getElementById('postsContainer');
    if (!container) return;

    if (postsArray.length === 0) {
        container.innerHTML = `
            <div class="no-posts">
                <h3>No posts yet</h3>
                <p>Be the first to share something!</p>
                <a href="create-post.html" class="btn-primary">Create Post</a>
            </div>
        `;
        return;
    }

    container.innerHTML = postsArray.map(post => `
        <div class="post" data-post-id="${post.id}">
            <div class="post-header">
                <img src="${post.profile_image}" alt="${post.username}" class="post-profile-img">
                <div class="post-user-info">
                    <strong>${post.username}</strong>
                    <span class="post-time">${formatDate(post.created_at)}</span>
                </div>
            </div>
            
            <div class="post-content">
                <p>${escapeHtml(post.content)}</p>
                ${post.image ? `<img src="${post.image}" class="post-image" alt="Post image" onclick="openImageModal('${post.image}')">` : ''}
                ${post.video ? `
                    <video controls class="post-video">
                        <source src="${post.video}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                ` : ''}
                ${post.audio ? `
                    <audio controls class="post-audio">
                        <source src="${post.audio}" type="audio/mpeg">
                        Your browser does not support the audio tag.
                    </audio>
                ` : ''}
            </div>
            
            <div class="post-actions">
                <button class="like-btn ${post.user_liked ? 'liked' : ''}" onclick="likePost(${post.id})">
                    ❤️ Like (${post.like_count})
                </button>
                <button class="comment-btn" onclick="showComments(${post.id})">
                    💬 Comment (${post.comment_count})
                </button>
                <button class="share-btn" onclick="sharePost(${post.id})">
                    🔗 Share
                </button>
            </div>

            <div class="comments-section" id="comments-${post.id}" style="display: none;">
                <div class="comments-list" id="comments-list-${post.id}"></div>
                <div class="comment-form">
                    <input type="text" id="comment-input-${post.id}" placeholder="Write a comment...">
                    <button onclick="addComment(${post.id})">Post</button>
                </div>
            </div>
        </div>
    `).join('');
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    if (searchInput && searchBtn) {
        const performSearch = debounce((term) => {
            searchPosts(term);
        }, 300);

        searchInput.addEventListener('input', (e) => {
            performSearch(e.target.value);
        });

        searchBtn.addEventListener('click', () => {
            searchPosts(searchInput.value);
        });
    }
}

function searchPosts(searchTerm) {
    if (!searchTerm.trim()) {
        displayPosts(posts);
        return;
    }

    const filteredPosts = posts.filter(post => 
        post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    displayPosts(filteredPosts);
}

async function likePost(postId) {
    try {
        const result = await apiCall(`/api/posts/${postId}/like`, {
            method: 'POST'
        });

        if (result) {
            loadPosts(); // Reload posts to update like counts
        }
    } catch (error) {
        console.error('Error liking post:', error);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();

    if (!content) return;

    try {
        const result = await apiCall(`/api/posts/${postId}/comment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });

        if (result) {
            input.value = '';
            showNotification('Comment added', 'success');
            loadPosts(); // Reload to show new comment
        }
    } catch (error) {
        console.error('Error adding comment:', error);
    }
}

function showComments(postId) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    if (commentsSection) {
        commentsSection.style.display = commentsSection.style.display === 'none' ? 'block' : 'none';
    }
}

function sharePost(postId) {
    const post = posts.find(p => p.id === postId);
    if (post && navigator.share) {
        navigator.share({
            title: `Post by ${post.username}`,
            text: post.content,
            url: window.location.href
        });
    } else {
        // Fallback: copy to clipboard
        const postUrl = `${window.location.origin}/?post=${postId}`;
        navigator.clipboard.writeText(postUrl).then(() => {
            showNotification('Post link copied to clipboard', 'success');
        });
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openImageModal(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal image-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
            <img src="${imageUrl}" alt="Full size" style="max-width: 90vw; max-height: 90vh;">
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';
}

// Export functions for global access
window.apiCall = apiCall;
window.showNotification = showNotification;
window.validateForm = validateForm;
window.displayFormErrors = displayFormErrors;
window.handleFileUpload = handleFileUpload;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.openModal = openModal;
window.closeModal = closeModal;
window.loadPosts = loadPosts;
window.likePost = likePost;
window.addComment = addComment;
window.showComments = showComments;
window.sharePost = sharePost;
window.openImageModal = openImageModal;

// Placeholder functions for other pages (to be implemented)
function loadProfileFunctions() {
    console.log('Loading profile functions...');
}

function loadCreatePostFunctions() {
    console.log('Loading create post functions...');
}

function loadUserListFunctions() {
    console.log('Loading user list functions...');
}

function loadChatFunctions() {
    console.log('Loading chat functions...');
}

function loadAdminFunctions() {
    console.log('Loading admin functions...');
}

function loadSettingsFunctions() {
    console.log('Loading settings functions...');
}