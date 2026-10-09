require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const {
  authenticateToken,
  signupManual,
  loginManual,
  authenticateGoogle,
} = require('./auth');
const {
  sendFriendRequest,
  getFriendsOverview,
  respondFriendRequest,
  removeFriend,
  sendAccountabilityRequest,
  respondAccountabilityRequest,
  removeAccountabilityPartnership,
  getBuddyJournal,
} = require('./social');

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS for frontend clients (GitHub Pages, localhost)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));

// Serve static frontend files if hosted together
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: process.env.TURSO_DATABASE_URL ? 'turso' : 'local-sqlite',
    version: 'turso-cloud-v1',
    uptimeSeconds: Math.round(process.uptime()),
    commit: process.env.RENDER_GIT_COMMIT || 'local',
    timestamp: new Date().toISOString(),
  });
});

// ───────── Authentication Endpoints ─────────

// 1. Manual Signup (username + password)
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    const result = await signupManual(username, password, email);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Manual Login (username/email + password)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await loginManual(username, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// 3. Google Sign-In / Signup
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, customUsername } = req.body;
    console.log('Incoming /api/auth/google request, customUsername:', customUsername);
    const result = await authenticateGoogle(credential, customUsername);
    console.log('Google Auth Result: isNewUser =', result.isNewUser, 'username =', result.user ? result.user.username : result.suggestedUsername);
    res.json(result);
  } catch (err) {
    console.error('Google Auth Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// 4. Get Current User Info (verifies active JWT token)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────── User Journal Sync Endpoints ─────────

// Get User's Journal
app.get('/api/journal', authenticateToken, async (req, res) => {
  try {
    const row = await db.get('SELECT journal_data, updated_at FROM user_journals WHERE user_id = ?', [req.user.id]);
    if (!row) {
      return res.json({ journal: null });
    }
    res.json({ journal: JSON.parse(row.journal_data), updatedAt: row.updated_at });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve journal data' });
  }
});

// Save / Sync User's Entire Journal
app.put('/api/journal', authenticateToken, async (req, res) => {
  const journalData = req.body;
  if (!journalData || typeof journalData !== 'object') {
    return res.status(400).json({ error: 'Invalid journal payload' });
  }

  try {
    const jsonStr = JSON.stringify(journalData);
    await db.run(`
      INSERT INTO user_journals (user_id, journal_data, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        journal_data = excluded.journal_data,
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.id, jsonStr]);
    res.json({ success: true, message: 'Journal synced successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────── Friends & Social Endpoints ─────────

// Get Friends & Requests Overview
app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const data = await getFriendsOverview(req.user.id);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Send Friend Request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    const result = await sendFriendRequest(req.user.id, username);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Respond to Friend Request (accept or decline)
app.put('/api/friends/:id/respond', authenticateToken, async (req, res) => {
  try {
    const { accept } = req.body;
    const result = await respondFriendRequest(req.user.id, req.params.id, Boolean(accept));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove Friend
app.delete('/api/friends/:friendUserId', authenticateToken, async (req, res) => {
  try {
    const result = await removeFriend(req.user.id, req.params.friendUserId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ───────── Accountability Endpoints ─────────

// Send Accountability Request
app.post('/api/accountability/request', authenticateToken, async (req, res) => {
  try {
    const { friendUsername } = req.body;
    const result = await sendAccountabilityRequest(req.user.id, friendUsername);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Respond to Accountability Request (accept or decline, with shareBack)
app.put('/api/accountability/:id/respond', authenticateToken, async (req, res) => {
  try {
    const { accept, shareBack } = req.body;
    const result = await respondAccountabilityRequest(req.user.id, req.params.id, Boolean(accept), Boolean(shareBack));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// End Accountability Partnership
app.delete('/api/accountability/:id', authenticateToken, async (req, res) => {
  try {
    const result = await removeAccountabilityPartnership(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Buddy's Full Journal (Access-Controlled)
app.get('/api/accountability/journal/:targetUserId', authenticateToken, async (req, res) => {
  try {
    const data = await getBuddyJournal(req.user.id, req.params.targetUserId);
    res.json(data);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// Initialize database tables and start listening
db.initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🥩 Carnivore backend server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database tables:', err);
    process.exit(1);
  });

module.exports = app;
