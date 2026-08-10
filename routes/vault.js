const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// GET /api/vault
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const { query } = req.query;
    const filter = {};

    if (query) {
      filter.customerName = { $regex: query.toLowerCase(), $options: 'i' };
    }

    const items = await db.collection('vault').find(filter).toArray();
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching vault data', error: error.message });
  }
});

// POST /api/vault
router.post('/', authMiddleware, upload.fields([{ name: 'aadhaar', maxCount: 1 }, { name: 'pan', maxCount: 1 }]), async (req, res) => {
  const { customerName } = req.body;
  if (!customerName) {
    // Cleanup any uploaded files if validation fails
    if (req.files) {
      if (req.files.aadhaar) { try { fs.unlinkSync(req.files.aadhaar[0].path); } catch (e) {} }
      if (req.files.pan) { try { fs.unlinkSync(req.files.pan[0].path); } catch (e) {} }
    }
    return res.status(400).json({ message: 'Customer Name is required' });
  }

  try {
    const db = getDb();
    const aadhaarFile = req.files && req.files.aadhaar ? req.files.aadhaar[0] : null;
    const panFile = req.files && req.files.pan ? req.files.pan[0] : null;

    const newVaultItem = {
      id: 'vlt-' + uuidv4(),
      customerName,
      aadhaarName: aadhaarFile ? aadhaarFile.originalname : '',
      aadhaarPath: aadhaarFile ? `uploads/${aadhaarFile.filename}` : '',
      aadhaarSize: aadhaarFile ? formatBytes(aadhaarFile.size) : '',
      panName: panFile ? panFile.originalname : '',
      panPath: panFile ? `uploads/${panFile.filename}` : '',
      panSize: panFile ? formatBytes(panFile.size) : '',
      createdAt: new Date().toISOString()
    };

    await db.collection('vault').insertOne(newVaultItem);
    res.status(201).json(newVaultItem);
  } catch (error) {
    res.status(500).json({ message: 'Error saving to vault', error: error.message });
  }
});

// DELETE /api/vault/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const item = await db.collection('vault').findOne({ id: req.params.id });
    if (!item) {
      return res.status(404).json({ message: 'Vault document not found' });
    }

    // Delete physical files
    if (item.aadhaarPath) {
      const fullPath = path.join(__dirname, '..', item.aadhaarPath);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) {}
      }
    }

    if (item.panPath) {
      const fullPath = path.join(__dirname, '..', item.panPath);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) {}
      }
    }

    await db.collection('vault').deleteOne({ id: req.params.id });
    res.json({ message: 'Vault document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting from vault', error: error.message });
  }
});

module.exports = router;
