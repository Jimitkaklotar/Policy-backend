const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const db = getDb();
    const cleanInput = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await db.collection('users').findOne({
      $or: [
        { email: { $regex: new RegExp(`^${cleanInput}$`, 'i') } },
        { username: { $regex: new RegExp(`^${cleanInput}$`, 'i') } }
      ]
    });
    
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
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.collection('users').findOne({ id: req.user.id });
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
  } catch (error) {
    return res.status(500).json({ message: 'Profile fetch failed', error: error.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  // Returns successful link mock response
  return res.json({
    message: 'Password reset link sent to your registered email.',
    link: `http://localhost:5173/reset-password?token=mocked-token-for-${encodeURIComponent(email)}`
  });
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, password, name, role, avatar } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email and password are required' });
  }

  try {
    const db = getDb();
    const emailExists = await db.collection('users').findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (emailExists) {
      return res.status(400).json({ message: 'Email address is already registered' });
    }

    const usernameExists = await db.collection('users').findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (usernameExists) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      name: name || username,
      role: role || 'Broker',
      avatar: avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
    };

    await db.collection('users').insertOne(newUser);

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        avatar: newUser.avatar
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

module.exports = router;
