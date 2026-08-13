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

// POST /api/vault (Supports dynamic multi-file batch uploads with custom labels)
router.post('/', authMiddleware, upload.any(), async (req, res) => {
  const { customerName, isFolder, documentFor, documenter } = req.body;
  if (!customerName) {
    if (req.files) {
      req.files.forEach(f => {
        try { fs.unlinkSync(f.path); } catch (e) {}
      });
    }
    return res.status(400).json({ message: 'Customer Name is required' });
  }

  try {
    const db = getDb();
    
    if (isFolder === 'true') {
      const newFolder = {
        id: 'vlt-' + uuidv4(),
        customerName,
        isFolder: true,
        createdAt: new Date().toISOString()
      };
      await db.collection('vault').insertOne(newFolder);
      return res.status(201).json(newFolder);
    }

    // Dynamic file upload batch
    const metadata = JSON.parse(req.body.metadata || '[]');
    const files = req.files || [];
    const insertedItems = [];

    for (let i = 0; i < metadata.length; i++) {
      const meta = metadata[i];
      const file = files.find(f => f.fieldname === `file-${meta.fileIndex}`);
      
      if (file) {
        const newVaultItem = {
          id: 'vlt-' + uuidv4(),
          customerName,
          docType: meta.label || 'Other Document',
          documentFor: documentFor || customerName,
          documenter: documenter || 'Unknown',
          fileName: file.originalname,
          filePath: `uploads/${file.filename}`,
          fileSize: formatBytes(file.size),
          isFolder: false,
          createdAt: new Date().toISOString()
        };
        await db.collection('vault').insertOne(newVaultItem);
        insertedItems.push(newVaultItem);
      }
    }

    res.status(201).json({ message: 'Batch uploaded successfully', items: insertedItems });
  } catch (error) {
    if (req.files) {
      req.files.forEach(f => {
        try { fs.unlinkSync(f.path); } catch (e) {}
      });
    }
    res.status(500).json({ message: 'Error saving to vault', error: error.message });
  }
});

// GET /api/vault/download/:id
router.get('/download/:id', async (req, res) => {
  try {
    const db = getDb();
    const item = await db.collection('vault').findOne({ id: req.params.id });
    if (!item || !item.filePath) {
      return res.status(404).json({ message: 'File not found' });
    }
    const fullPath = path.join(__dirname, '../', item.filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Physical file not found' });
    }
    res.download(fullPath, item.fileName);
  } catch (error) {
    res.status(500).json({ message: 'Error downloading file', error: error.message });
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

    // Delete physical file
    if (item.filePath) {
      const fullPath = path.join(__dirname, '../', item.filePath);
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
