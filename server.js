const express = require('express');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.db' 
  : './database.db';

const db = new sqlite3.Database(dbPath);

// Create all tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    name TEXT,
    profile_image TEXT DEFAULT 'images/default-profile.png',
    bio TEXT,
    is_admin INTEGER DEFAULT 0,
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Posts table
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT,
    image TEXT,
    video TEXT,
    audio TEXT,
    privacy TEXT DEFAULT 'public',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Comments table
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Likes table
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Chats table
  db.run(`CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER,
    user2_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user1_id) REFERENCES users(id),
    FOREIGN KEY(user2_id) REFERENCES users(id)
  )`);

  // Messages table
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    sender_id INTEGER,
    content TEXT,
    message_type TEXT DEFAULT 'text',
    file_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES chats(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  )`);

  // Reports table
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER,
    target_type TEXT,
    target_id INTEGER,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(reporter_id) REFERENCES users(id)
  )`);

  // Admin messages table
  db.run(`CREATE TABLE IF NOT EXISTS admin_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT,
    message_type TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create default admin user
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (row.count === 0) {
      bcrypt.hash('admin123', 10, (err, hashedPassword) => {
        db.run(
          'INSERT INTO users (username, password, name, is_admin) VALUES (?, ?, ?, ?)',
          ['admin', hashedPassword, 'Admin User', 1],
          (err) => {
            if (err) console.log('Error creating admin user:', err);
            else console.log('Default admin user created: admin / admin123');
          }
        );
      });
    }
  });
});

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'website-secret-key-2024',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// File upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Authentication middleware
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login.html');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).send('Admin access required');
  }
  next();
}

// ==================== ROUTES ====================

// Home page
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

// Serve HTML files
app.get('/:page', (req, res) => {
  const page = req.params.page;
  const allowedPages = [
    'register.html', 'login.html', 'forget-password.html', 
    'reset-password.html', 'index.html', 'settings.html',
    'create-post.html', 'profile.html', 'user-list.html',
    'sheeko.html', 'admin.html'
  ];

  if (allowedPages.includes(page)) {
    res.sendFile(path.join(__dirname, 'views', page));
  } else {
    res.status(404).send('Page not found');
  }
});

// ==================== AUTHENTICATION APIs ====================

// User info
app.get('/api/user-info', requireLogin, (req, res) => {
  db.get(
    'SELECT id, username, name, profile_image, is_admin FROM users WHERE id = ?',
    [req.session.userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    }
  );
});

// Register
app.post('/register', upload.single('profileImage'), async (req, res) => {
  const { username, password, name } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const profileImage = req.file ? 'uploads/' + req.file.filename : 'images/default-profile.png';

    db.run(
      'INSERT INTO users (username, password, name, profile_image) VALUES (?, ?, ?, ?)',
      [username.toLowerCase(), hashedPassword, name, profileImage],
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.send('Username hore u jiray');
          }
          return res.status(500).send('Server error');
        }
        res.redirect('/login.html');
      }
    );
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get(
    'SELECT * FROM users WHERE username = ? AND is_blocked = 0', 
    [username.toLowerCase()],
    async (err, user) => {
      if (err) return res.status(500).send('Server error');
      if (!user) return res.send('Username ama password khalad');

      try {
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.send('Username ama password khalad');

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.is_admin === 1;
        
        res.redirect('/');
      } catch (error) {
        res.status(500).send('Server error');
      }
    }
  );
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

// ==================== PROFILE APIs ====================

// Update profile
app.post('/update-profile', upload.single('profileImage'), requireLogin, (req, res) => {
  const { username, name, bio } = req.body;
  const userId = req.session.userId;

  let updateQuery = 'UPDATE users SET username = ?, name = ?, bio = ?';
  let queryParams = [username.toLowerCase(), name, bio];

  if (req.file) {
    updateQuery += ', profile_image = ?';
    queryParams.push('uploads/' + req.file.filename);
  }

  updateQuery += ' WHERE id = ?';
  queryParams.push(userId);

  db.run(updateQuery, queryParams, function(err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.send('Username hore u jiray');
      }
      return res.status(500).send('Server error');
    }
    
    req.session.username = username;
    res.redirect('/settings.html');
  });
});

// Update password
app.post('/update-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.userId;

  db.get(
    'SELECT password FROM users WHERE id = ?',
    [userId],
    async (err, user) => {
      if (err) return res.status(500).send('Server error');
      
      try {
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) return res.send('Password-ka hadda waa khalad');

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        db.run(
          'UPDATE users SET password = ? WHERE id = ?',
          [hashedPassword, userId],
          function(err) {
            if (err) return res.status(500).send('Server error');
            res.redirect('/settings.html?message=password_updated');
          }
        );
      } catch (error) {
        res.status(500).send('Server error');
      }
    }
  );
});

// Get user profile
app.get('/api/profile/:username', requireLogin, (req, res) => {
  const username = req.params.username;

  const query = `
    SELECT u.*, 
           (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count,
           (SELECT COUNT(*) FROM likes l JOIN posts p ON l.post_id = p.id WHERE p.user_id = u.id) as like_count
    FROM users u
    WHERE u.username = ?
  `;

  db.get(query, [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

// Get user posts
app.get('/api/profile/:username/posts', requireLogin, (req, res) => {
  const username = req.params.username;
  const currentUserId = req.session.userId;

  const query = `
    SELECT p.*, 
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE u.username = ? AND (p.privacy = 'public' OR p.user_id = ?)
    ORDER BY p.created_at DESC
  `;

  db.all(query, [username, currentUserId], (err, posts) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(posts);
  });
});

// ==================== POST APIs ====================

// Get posts
app.get('/api/posts', requireLogin, (req, res) => {
  const userId = req.session.userId;

  const query = `
    SELECT p.*, u.username, u.profile_image, 
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
           EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.privacy = 'public' OR p.user_id = ?
    ORDER BY p.created_at DESC
  `;

  db.all(query, [userId, userId], (err, posts) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(posts);
  });
});

// Create post
app.post('/create-post', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), requireLogin, (req, res) => {
  const { content, privacy } = req.body;
  const userId = req.session.userId;

  const image = req.files?.image ? 'uploads/' + req.files.image[0].filename : null;
  const video = req.files?.video ? 'uploads/' + req.files.video[0].filename : null;
  const audio = req.files?.audio ? 'uploads/' + req.files.audio[0].filename : null;

  db.run(
    'INSERT INTO posts (user_id, content, image, video, audio, privacy) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, content, image, video, audio, privacy],
    function(err) {
      if (err) return res.status(500).send('Server error');
      res.redirect('/');
    }
  );
});

// Like post
app.post('/api/posts/:id/like', requireLogin, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;

  db.get(
    'SELECT * FROM likes WHERE post_id = ? AND user_id = ?',
    [postId, userId],
    (err, like) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      if (like) {
        // Unlike
        db.run(
          'DELETE FROM likes WHERE post_id = ? AND user_id = ?',
          [postId, userId],
          function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ liked: false });
          }
        );
      } else {
        // Like
        db.run(
          'INSERT INTO likes (post_id, user_id) VALUES (?, ?)',
          [postId, userId],
          function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ liked: true });
          }
        );
      }
    }
  );
});

// Add comment
app.post('/api/posts/:id/comment', requireLogin, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;
  const { content } = req.body;

  db.run(
    'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
    [postId, userId, content],
    function(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true, commentId: this.lastID });
    }
  );
});

// Get comments
app.get('/api/posts/:id/comments', requireLogin, (req, res) => {
  const postId = req.params.id;

  const query = `
    SELECT c.*, u.username, u.profile_image
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `;

  db.all(query, [postId], (err, comments) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(comments);
  });
});

// ==================== USER MANAGEMENT APIs ====================

// Get all users
app.get('/api/users', requireLogin, (req, res) => {
  const query = `
    SELECT id, username, name, profile_image, created_at,
           (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count
    FROM users 
    WHERE is_blocked = 0 AND id != ?
    ORDER BY created_at DESC
  `;

  db.all(query, [req.session.userId], (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// Search users
app.get('/api/users/search', requireLogin, (req, res) => {
  const searchTerm = req.query.q;
  
  const query = `
    SELECT id, username, name, profile_image
    FROM users 
    WHERE (username LIKE ? OR name LIKE ?) AND is_blocked = 0 AND id != ?
    LIMIT 10
  `;

  db.all(query, [`%${searchTerm}%`, `%${searchTerm}%`, req.session.userId], (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// ==================== CHAT APIs ====================

// Get user chats
app.get('/api/chats', requireLogin, (req, res) => {
  const userId = req.session.userId;

  const query = `
    SELECT c.*, 
           CASE 
             WHEN c.user1_id = ? THEN u2.username 
             ELSE u1.username 
           END as other_username,
           CASE 
             WHEN c.user1_id = ? THEN u2.profile_image 
             ELSE u1.profile_image 
           END as other_profile_image,
           (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
           (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_activity
    FROM chats c
    JOIN users u1 ON c.user1_id = u1.id
    JOIN users u2 ON c.user2_id = u2.id
    WHERE c.user1_id = ? OR c.user2_id = ?
    ORDER BY last_activity DESC
  `;

  db.all(query, [userId, userId, userId, userId], (err, chats) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(chats);
  });
});

// Get chat messages
app.get('/api/chats/:id/messages', requireLogin, (req, res) => {
  const chatId = req.params.id;
  const userId = req.session.userId;

  // Check if user has access to this chat
  db.get(
    'SELECT * FROM chats WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
    [chatId, userId, userId],
    (err, chat) => {
      if (err || !chat) return res.status(403).json({ error: 'Access denied' });

      const query = `
        SELECT m.*, u.username, u.profile_image
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = ?
        ORDER BY m.created_at ASC
      `;

      db.all(query, [chatId], (err, messages) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(messages);
      });
    }
  );
});

// Send message
app.post('/api/chats/:id/messages', requireLogin, upload.single('file'), (req, res) => {
  const chatId = req.params.id;
  const userId = req.session.userId;
  const { content } = req.body;

  // Check if user has access to this chat
  db.get(
    'SELECT * FROM chats WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
    [chatId, userId, userId],
    (err, chat) => {
      if (err || !chat) return res.status(403).json({ error: 'Access denied' });

      const messageType = req.file ? 'file' : 'text';
      const fileUrl = req.file ? 'uploads/' + req.file.filename : null;

      db.run(
        'INSERT INTO messages (chat_id, sender_id, content, message_type, file_url) VALUES (?, ?, ?, ?, ?)',
        [chatId, userId, content, messageType, fileUrl],
        function(err) {
          if (err) return res.status(500).json({ error: 'Database error' });
          res.json({ success: true, messageId: this.lastID });
        }
      );
    }
  );
});

// Create or get chat
app.post('/api/chats', requireLogin, (req, res) => {
  const userId = req.session.userId;
  const { otherUserId } = req.body;

  // Check if chat already exists
  db.get(
    'SELECT * FROM chats WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
    [userId, otherUserId, otherUserId, userId],
    (err, existingChat) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      if (existingChat) {
        return res.json(existingChat);
      }

      // Create new chat
      db.run(
        'INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)',
        [userId, otherUserId],
        function(err) {
          if (err) return res.status(500).json({ error: 'Database error' });
          res.json({ id: this.lastID, user1_id: userId, user2_id: otherUserId });
        }
      );
    }
  );
});

// ==================== ADMIN APIs ====================

// Admin stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const queries = {
    totalUsers: 'SELECT COUNT(*) as count FROM users',
    totalPosts: 'SELECT COUNT(*) as count FROM posts',
    totalComments: 'SELECT COUNT(*) as count FROM comments',
    totalReports: 'SELECT COUNT(*) as count FROM reports WHERE status = "pending"'
  };

  const results = {};
  let completed = 0;

  Object.keys(queries).forEach(key => {
    db.get(queries[key], [], (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      results[key] = row.count;
      completed++;
      
      if (completed === Object.keys(queries).length) {
        res.json(results);
      }
    });
  });
});

// Get all users for admin
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const query = `
    SELECT *, (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count
    FROM users 
    ORDER BY created_at DESC
  `;

  db.all(query, [], (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// Block/unblock user
app.post('/api/admin/users/:id/block', requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { blocked } = req.body;

  db.run(
    'UPDATE users SET is_blocked = ? WHERE id = ?',
    [blocked ? 1 : 0, userId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true });
    }
  );
});

// Delete user
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;

  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  });
});

// ==================== UTILITY APIs ====================

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Forget password (placeholder)
app.post('/forget-password', (req, res) => {
  const { username, rememberName } = req.body;
  // In real app, send email with reset link
  res.send(`
    <script>
      alert('Fariin reset password ayaa la ku diray email-kaaga');
      window.location.href = '/reset-password.html?username=${username}';
    </script>
  `);
});

// Reset password
app.post('/reset-password', (req, res) => {
  const { username, newPassword } = req.body;
  
  bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
    if (err) return res.status(500).send('Server error');
    
    db.run(
      'UPDATE users SET password = ? WHERE username = ?',
      [hashedPassword, username],
      function(err) {
        if (err) return res.status(500).send('Server error');
        res.send(`
          <script>
            alert('Password-kaaga si guul leh ayaa loo beddelay!');
            window.location.href = '/login.html';
          </script>
        `);
      }
    );
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Server error');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server wuxuu ka socdaa http://localhost:${PORT}`);
  console.log(`📁 Database: ${dbPath}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGINT', () => {
  console.log('Server closing...');
  db.close();
  process.exit(0);
});
