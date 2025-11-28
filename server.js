const express = require('express');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup - Use absolute path for Render
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
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Create default admin user
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (err) return;
    
    if (row.count === 0) {
      bcrypt.hash('admin123', 10, (err, hashedPassword) => {
        if (err) return;
        
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
app.use('/uploads', express.static('public/uploads'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'website-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
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

// Routes

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

// API Routes

// User info endpoint
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
  
  if (!username || !password || !name) {
    return res.status(400).send('Fadlan buuxi dhammaan fields-ka');
  }

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
  
  if (!username || !password) {
    return res.status(400).send('Fadlan geli username iyo password');
  }

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

// Get posts for index page
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
    LIMIT 50
  `;

  db.all(query, [userId, userId], (err, posts) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(posts || []);
  });
});

// Create post
app.post('/create-post', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), requireLogin, (req, res) => {
  const { content, privacy = 'public' } = req.body;
  const userId = req.session.userId;

  if (!content && !req.files.image && !req.files.video && !req.files.audio) {
    return res.status(400).send('Fadlan geli content ama dooro file');
  }

  const image = req.files.image ? 'uploads/' + req.files.image[0].filename : null;
  const video = req.files.video ? 'uploads/' + req.files.video[0].filename : null;
  const audio = req.files.audio ? 'uploads/' + req.files.audio[0].filename : null;

  db.run(
    'INSERT INTO posts (user_id, content, image, video, audio, privacy) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, content, image, video, audio, privacy],
    function(err) {
      if (err) {
        console.error('Error creating post:', err);
        return res.status(500).send('Server error');
      }
      res.redirect('/');
    }
  );
});

// Like post
app.post('/api/posts/:id/like', requireLogin, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;

  // Check if already liked
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

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
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