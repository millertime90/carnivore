require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const {
  signupManual,
  loginManual,
  authenticateGoogle,
  authenticateToken,
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS for frontend running locally or on GitHub Pages
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Serve static frontend files directly from the parent directory
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ───────── Authentication Endpoints ─────────

// 1. Manual Signup (username + password)
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, password, email } = req.body;
    const result = signupManual(username, password, email);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Manual Login (username/email + password)
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const result = loginManual(username, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// 3. Google Sign-In / Signup
// Supports passing customUsername if the user opts to customize their handle on signup
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, customUsername } = req.body;
    console.log('Incoming /api/auth/google request, customUsername:', customUsername);
    const result = await authenticateGoogle(credential, customUsername);
    console.log('Google Auth Result: isNewUser =', result.isNewUser, 'username =', result.user.username);
    res.json(result);
  } catch (err) {
    console.error('Google Auth Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// 4. Get Current User Info (verifies active JWT token)
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, email, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// ───────── User Journal Sync Endpoints ─────────

// Get User's Journal
app.get('/api/journal', authenticateToken, (req, res) => {
  const row = db.prepare('SELECT journal_data, updated_at FROM user_journals WHERE user_id = ?').get(req.user.id);
  if (!row) {
    return res.json({ journal: null });
  }
  try {
    res.json({ journal: JSON.parse(row.journal_data), updatedAt: row.updated_at });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse journal data' });
  }
});

// Save / Sync User's Entire Journal
app.put('/api/journal', authenticateToken, (req, res) => {
  const journalData = req.body;
  if (!journalData || typeof journalData !== 'object') {
    return res.status(400).json({ error: 'Invalid journal payload' });
  }

  const jsonStr = JSON.stringify(journalData);
  const stmt = db.prepare(`
    INSERT INTO user_journals (user_id, journal_data, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      journal_data = excluded.journal_data,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(req.user.id, jsonStr);
  res.json({ success: true, message: 'Journal synced successfully' });
});

app.listen(PORT, () => {
  console.log(`🥩 Carnivore backend server running on http://localhost:${PORT}`);
});

module.exports = app;
