const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { readTable, writeTable } = require('../db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const users = readTable('users');
  const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar
    }
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const users = readTable('users');
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    avatar: user.avatar
  });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  // Find if user/broker exists with this email or just mock success
  // For the TrustAssure broker portal, we return a successful response with a link mockup
  return res.json({
    message: 'Password reset link sent to your registered email.',
    link: `http://localhost:5173/reset-password?token=mocked-token-for-${encodeURIComponent(email)}`
  });
});

module.exports = router;
