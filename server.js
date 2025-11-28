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

// Create tables
db.serialize(() => {
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

  // Create default admin
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (row.count === 0) {
      bcrypt.hash('admin123', 10, (err, hashedPassword) => {
        db.run(
          'INSERT INTO users (username, password, name, is_admin) VALUES (?, ?, ?, ?)',
          ['admin', hashedPassword, 'Admin User', 1]
        );
      });
    }
  });
});

// MIDDLEWARE - SAXDA AH
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'website-secret-key-2024',
  resave: false,
  saveUninitialized: true, // ✅ Change this to TRUE
  cookie: { 
    secure: false, // ✅ Change to false for Render
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// File upload
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

const upload = multer({ storage: storage });

// ✅ SAXDA AH - Authentication middleware
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  next();
}

// ✅ SAXDA AH - Routes

// Home page
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

// ✅ SAXDA AH - Serve HTML files
app.get('/:page', (req, res) => {
  const page = req.params.page;
  const allowedPages = [
    'register.html', 'login.html', 'forget-password.html', 
    'reset-password.html', 'settings.html', 'create-post.html', 
    'profile.html', 'user-list.html', 'sheeko.html', 'admin.html'
  ];

  if (allowedPages.includes(page)) {
    res.sendFile(path.join(__dirname, 'views', page));
  } else {
    res.status(404).send('Page not found');
  }
});

// ✅ SAXDA AH - Login API
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log('Login attempt:', username); // Debug log

  if (!username || !password) {
    return res.send(`
      <script>
        alert('Fadlan geli username iyo password');
        window.history.back();
      </script>
    `);
  }

  db.get(
    'SELECT * FROM users WHERE username = ? AND is_blocked = 0', 
    [username.toLowerCase()],
    async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Server error');
      }
      
      if (!user) {
        return res.send(`
          <script>
            alert('Username ama password khalad');
            window.history.back();
          </script>
        `);
      }

      try {
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return res.send(`
            <script>
              alert('Username ama password khalad');
              window.history.back();
            </script>
          `);
        }

        // ✅ SAXDA AH - Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.is_admin === 1;
        
        console.log('Login successful:', user.username); // Debug log
        res.redirect('/');
        
      } catch (error) {
        console.error('Bcrypt error:', error);
        res.status(500).send('Server error');
      }
    }
  );
});

// ✅ SAXDA AH - Register API
app.post('/register', upload.single('profileImage'), async (req, res) => {
  const { username, password, name } = req.body;
  
  if (!username || !password || !name) {
    return res.send(`
      <script>
        alert('Fadlan buuxi dhammaan fields-ka');
        window.history.back();
      </script>
    `);
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
            return res.send(`
              <script>
                alert('Username hore u jiray');
                window.history.back();
              </script>
            `);
          }
          return res.status(500).send('Server error');
        }
        res.send(`
          <script>
            alert('Diiwaangelintadu waxay guulaysatay! Fadlan soo gal');
            window.location.href = '/login.html';
          </script>
        `);
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).send('Server error');
  }
});

// ✅ SAXDA AH - Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/login.html');
  });
});

// ✅ SAXDA AH - Get posts
app.get('/api/posts', requireLogin, (req, res) => {
  const userId = req.session.userId;

  const query = `
    SELECT p.*, u.username, u.profile_image 
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.privacy = 'public' OR p.user_id = ?
    ORDER BY p.created_at DESC
  `;

  db.all(query, [userId], (err, posts) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(posts || []);
  });
});

// ✅ SAXDA AH - Create post
app.post('/create-post', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), requireLogin, (req, res) => {
  const { content, privacy = 'public' } = req.body;
  const userId = req.session.userId;

  const image = req.files?.image ? 'uploads/' + req.files.image[0].filename : null;
  const video = req.files?.video ? 'uploads/' + req.files.video[0].filename : null;
  const audio = req.files?.audio ? 'uploads/' + req.files.audio[0].filename : null;

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

// ✅ SAXDA AH - Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server wuxuu ka socdaa http://localhost:${PORT}`);
  console.log(`📁 Database: ${dbPath}`);
});

// Handle shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
