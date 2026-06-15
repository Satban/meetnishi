/**
 * Nishi Blog Engagement - Comments & Ratings
 * Uses Supabase as backend
 */

const SUPABASE_URL = 'https://aqdapnwrsvyjrpiwtwip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZGFwbndyc3Z5anJwaXd0d2lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMTQ2MjAsImV4cCI6MjA4NDY5MDYyMH0.OkkiXODLlfbSEfLEYzO7sFBTZks2_7gKaKeSd22yV2M';

// Get post slug from URL
function getPostSlug() {
  const path = window.location.pathname;
  const filename = path.split('/').pop();
  return filename.replace('.html', '');
}

// Supabase REST API helper
async function supabaseRequest(table, method, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const options = {
    method: method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Load and display comments
async function loadComments() {
  const slug = getPostSlug();
  const container = document.getElementById('comments-list');
  if (!container) return;

  try {
    const comments = await supabaseRequest(
      'blog_comments',
      'GET',
      null,
      `?post_slug=eq.${slug}&order=created_at.desc`
    );

    if (comments.length === 0) {
      container.innerHTML = '<p class="no-comments">No comments yet. Be the first to share your thoughts!</p>';
      return;
    }

    container.innerHTML = comments.map(c => `
      <div class="comment">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(c.author_name)}</span>
          <span class="comment-date">${formatDate(c.created_at)}</span>
        </div>
        <p class="comment-text">${escapeHtml(c.comment_text)}</p>
      </div>
    `).join('');

    document.getElementById('comments-count').textContent = `(${comments.length})`;
  } catch (err) {
    console.error('Error loading comments:', err);
    container.innerHTML = '<p class="error">Unable to load comments.</p>';
  }
}

// Submit a new comment
async function submitComment(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const slug = getPostSlug();

  const name = form.querySelector('#comment-name').value.trim();
  const email = form.querySelector('#comment-email').value.trim();
  const text = form.querySelector('#comment-text').value.trim();

  if (!name || !email || !text) {
    alert('Please fill in all fields');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting...';

  try {
    await supabaseRequest('blog_comments', 'POST', {
      post_slug: slug,
      author_name: name,
      author_email: email,
      comment_text: text
    });

    form.reset();
    await loadComments();

    // Show success message
    const successMsg = document.createElement('div');
    successMsg.className = 'comment-success';
    successMsg.textContent = 'Comment posted successfully!';
    form.insertBefore(successMsg, form.firstChild);
    setTimeout(() => successMsg.remove(), 3000);
  } catch (err) {
    console.error('Error posting comment:', err);
    alert('Failed to post comment. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post Comment';
  }
}

// Load and display rating
async function loadRating() {
  const slug = getPostSlug();
  const container = document.getElementById('rating-display');
  if (!container) return;

  try {
    const ratings = await supabaseRequest(
      'blog_ratings',
      'GET',
      null,
      `?post_slug=eq.${slug}`
    );

    const total = ratings.length;
    const avg = total > 0
      ? (ratings.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1)
      : 0;

    container.innerHTML = `
      <span class="stars">${renderStars(avg)}</span>
      <span class="rating-text">${avg > 0 ? avg : '—'} (${total} ${total === 1 ? 'rating' : 'ratings'})</span>
    `;

    // Check if user already rated
    const ratedKey = `foil_blog_rated_${slug}`;
    if (localStorage.getItem(ratedKey)) {
      document.getElementById('rating-input').innerHTML =
        '<p class="already-rated">Thanks for rating this article!</p>';
    }
  } catch (err) {
    console.error('Error loading rating:', err);
  }
}

// Submit a rating
async function submitRating(rating) {
  const slug = getPostSlug();
  const ratedKey = `foil_blog_rated_${slug}`;

  // Check if already rated
  if (localStorage.getItem(ratedKey)) {
    alert('You have already rated this article');
    return;
  }

  try {
    await supabaseRequest('blog_ratings', 'POST', {
      post_slug: slug,
      rating: rating
    });

    localStorage.setItem(ratedKey, 'true');
    await loadRating();
  } catch (err) {
    console.error('Error submitting rating:', err);
    alert('Failed to submit rating. Please try again.');
  }
}

// Render star rating
function renderStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return '★'.repeat(fullStars) +
         (hasHalf ? '½' : '') +
         '☆'.repeat(emptyStars);
}

// Render clickable star input
function renderStarInput() {
  const container = document.getElementById('rating-input');
  if (!container) return;

  const slug = getPostSlug();
  const ratedKey = `foil_blog_rated_${slug}`;

  if (localStorage.getItem(ratedKey)) {
    container.innerHTML = '<p class="already-rated">Thanks for rating!</p>';
    return;
  }

  container.innerHTML = `
    <span class="rate-label">Rate this article:</span>
    <div class="star-input">
      ${[1,2,3,4,5].map(n => `
        <span class="star-btn" data-rating="${n}" onmouseover="highlightStars(${n})" onmouseout="resetStars()" onclick="submitRating(${n})">☆</span>
      `).join('')}
    </div>
  `;
}

// Star hover effects
function highlightStars(n) {
  document.querySelectorAll('.star-btn').forEach((star, i) => {
    star.textContent = i < n ? '★' : '☆';
    star.style.color = i < n ? '#E8B931' : '#ccc';
  });
}

function resetStars() {
  document.querySelectorAll('.star-btn').forEach(star => {
    star.textContent = '☆';
    star.style.color = '#ccc';
  });
}

// Helpers
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadComments();
  loadRating();
  renderStarInput();

  const commentForm = document.getElementById('comment-form');
  if (commentForm) {
    commentForm.addEventListener('submit', submitComment);
  }
});
