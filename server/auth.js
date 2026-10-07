const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'carnivore_dev_secret_fallback';
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Middleware: Authenticate requests using Bearer JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}

// Clean username helper (converts "Scott Miller" -> "scott_miller" if needed)
function sanitizeUsername(input) {
  if (!input) return '';
  return input.trim().replace(/\s+/g, '_').toLowerCase();
}

// Ensure username is unique by appending random numbers if already taken
function getAvailableUsername(baseUsername) {
  let clean = sanitizeUsername(baseUsername) || 'carnivore_user';
  let candidate = clean;
  let suffix = 1;

  const checkStmt = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)');
  while (checkStmt.get(candidate)) {
    candidate = `${clean}_${suffix}`;
    suffix++;
  }
  return candidate;
}

// ───────── Manual Authentication ─────────

// Manual Signup: username + password (optional email)
function signupManual(username, password, email = null) {
  if (!username || !username.trim()) {
    throw new Error('Username is required');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }

  const cleanUsername = username.trim();

  // Check if username already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUsername);
  if (existingUser) {
    throw new Error('Username is already taken');
  }

  // Check email if provided
  if (email && email.trim()) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existingEmail) {
      throw new Error('Email is already registered');
    }
  }

  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);

  const insert = db.prepare(`
    INSERT INTO users (id, username, email, password_hash)
    VALUES (?, ?, ?, ?)
  `);

  insert.run(id, cleanUsername, email ? email.trim() : null, passwordHash);

  const user = { id, username: cleanUsername, email: email ? email.trim() : null };
  const token = generateToken(user);
  return { user, token };
}

// Manual Login: username + password
function loginManual(usernameOrEmail, password) {
  if (!usernameOrEmail || !password) {
    throw new Error('Username and password are required');
  }

  const query = usernameOrEmail.trim();
  const user = db.prepare(`
    SELECT * FROM users 
    WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
  `).get(query, query);

  if (!user || !user.password_hash) {
    throw new Error('Invalid username or password');
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    throw new Error('Invalid username or password');
  }

  const token = generateToken(user);
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
    },
    token,
  };
}

// ───────── Google Authentication ─────────

// Google Sign-In verification & user resolution
async function authenticateGoogle(credential, customUsername = null) {
  if (!credential) {
    throw new Error('Google credential is required');
  }

  let payload;
  try {
    if (googleClient) {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      // In dev mode without a client ID, decode JWT payload or mock credential
      let decoded = jwt.decode(credential);
      if (!decoded && typeof credential === 'string' && credential.includes('.')) {
        try {
          const parts = credential.split('.');
          const jsonStr = Buffer.from(parts[1], 'base64').toString('utf8');
          decoded = JSON.parse(jsonStr);
        } catch (e) {}
      }
      if (!decoded || !decoded.sub) throw new Error('Invalid Google token format');
      payload = decoded;
    }
  } catch (err) {
    throw new Error(`Failed to verify Google token: ${err.message}`);
  }

  const googleId = payload.sub;
  const email = payload.email || null;
  const googleName = payload.name || payload.given_name || 'carnivore_user';
  const avatarUrl = payload.picture || null;

  // 1. Check if user already exists by google_id
  let existingUser = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

  // 2. If not found by google_id, check by email
  if (!existingUser && email) {
    existingUser = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (existingUser) {
      // Link Google ID to existing account
      db.prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?')
        .run(googleId, avatarUrl, existingUser.id);
      existingUser.google_id = googleId;
    }
  }

  // If user already exists, log them in immediately
  if (existingUser) {
    const token = generateToken(existingUser);
    return {
      isNewUser: false,
      user: {
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        avatar_url: existingUser.avatar_url,
      },
      token,
    };
  }

  // 3. New User Flow
  // If no customUsername provided, this is a check / preview step before confirming username
  if (!customUsername) {
    return {
      isNewUser: true,
      suggestedUsername: getAvailableUsername(googleName),
      googleName,
      email,
      avatarUrl,
    };
  }

  // User confirmed their username choice
  const requested = customUsername.trim();
  const taken = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(requested);
  if (taken) {
    throw new Error(`Username "${requested}" is already taken. Please choose another.`);
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, username, email, google_id, avatar_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, requested, email, googleId, avatarUrl);

  const newUser = { id, username: requested, email, avatar_url: avatarUrl };
  const token = generateToken(newUser);

  return {
    isNewUser: true,
    user: newUser,
    token,
  };
}

module.exports = {
  authenticateToken,
  signupManual,
  loginManual,
  authenticateGoogle,
  getAvailableUsername,
};
