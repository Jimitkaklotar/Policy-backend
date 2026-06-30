const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { readTable, writeTable } = require('../db');
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

// GET /api/clients
router.get('/', authMiddleware, (req, res) => {
  let clients = readTable('clients');
  const { query, status } = req.query;

  if (query) {
    const q = query.toLowerCase();
    clients = clients.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.phone.toLowerCase().includes(q) || 
      c.email.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  }

  if (status && status !== 'All') {
    clients = clients.filter(c => c.status.toLowerCase() === status.toLowerCase());
  }

  // Sort by name
  clients.sort((a, b) => a.name.localeCompare(b.name));

  // Attach documents to each client
  const documents = readTable('documents');
  const clientsWithDocs = clients.map(c => {
    const clientDocs = documents.filter(d => d.clientId === c.id);
    return {
      ...c,
      documents: clientDocs
    };
  });

  res.json(clientsWithDocs);
});

// GET /api/clients/:id
router.get('/:id', authMiddleware, (req, res) => {
  const clients = readTable('clients');
  const client = clients.find(c => c.id === req.params.id);
  if (!client) {
    return res.status(404).json({ message: 'Client not found' });
  }
  res.json(client);
});

// POST /api/clients
router.post('/', authMiddleware, upload.fields([{ name: 'aadhaar', maxCount: 1 }, { name: 'pan', maxCount: 1 }]), (req, res) => {
  const { name, email, phone, dob, status } = req.body;
  if (!name || !email) {
    if (req.files) {
      if (req.files.aadhaar) {
        try { fs.unlinkSync(req.files.aadhaar[0].path); } catch (e) {}
      }
      if (req.files.pan) {
        try { fs.unlinkSync(req.files.pan[0].path); } catch (e) {}
      }
    }
    return res.status(400).json({ message: 'Name and Email are required' });
  }

  const clients = readTable('clients');
  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=004DC0&color=fff`;

  const newClient = {
    id: 'cli-' + Math.floor(10000 + Math.random() * 90000), // e.g. CLI-29402 style
    name,
    email,
    phone: phone || '',
    dob: dob || '',
    activePoliciesCount: 0,
    status: status || 'Active',
    avatar,
    createdAt: new Date().toISOString()
  };

  clients.push(newClient);
  writeTable('clients', clients);

  // Handle uploaded files (Aadhaar & PAN)
  if (req.files) {
    const documents = readTable('documents');

    if (req.files.aadhaar) {
      const file = req.files.aadhaar[0];
      const bytes = file.size;
      let formattedSize = '0 Bytes';
      if (bytes > 0) {
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        formattedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
      }
      documents.push({
        id: 'doc-' + uuidv4(),
        policyId: '', // client level
        clientId: newClient.id,
        documentName: 'Aadhaar Card',
        documentType: 'Aadhaar',
        filePath: `uploads/${file.filename}`,
        fileSize: formattedSize,
        uploadedAt: new Date().toISOString()
      });
    }

    if (req.files.pan) {
      const file = req.files.pan[0];
      const bytes = file.size;
      let formattedSize = '0 Bytes';
      if (bytes > 0) {
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        formattedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
      }
      documents.push({
        id: 'doc-' + uuidv4(),
        policyId: '', // client level
        clientId: newClient.id,
        documentName: 'PAN Card Copy',
        documentType: 'PAN',
        filePath: `uploads/${file.filename}`,
        fileSize: formattedSize,
        uploadedAt: new Date().toISOString()
      });
    }

    writeTable('documents', documents);
  }

  // Log activity
  const activities = readTable('activities');
  activities.unshift({
    id: 'act-' + uuidv4(),
    logText: `New Client added: ${name}`,
    timestamp: new Date().toISOString(),
    type: 'info'
  });
  writeTable('activities', activities.slice(0, 50)); // Keep last 50 activities

  res.status(201).json(newClient);
});

// PUT /api/clients/:id
router.put('/:id', authMiddleware, (req, res) => {
  const clients = readTable('clients');
  const idx = clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Client not found' });
  }

  const { name, email, phone, dob, status } = req.body;
  const updatedClient = {
    ...clients[idx],
    name: name || clients[idx].name,
    email: email || clients[idx].email,
    phone: phone !== undefined ? phone : clients[idx].phone,
    dob: dob !== undefined ? dob : clients[idx].dob,
    status: status || clients[idx].status
  };

  clients[idx] = updatedClient;
  writeTable('clients', clients);

  // Log activity
  const activities = readTable('activities');
  activities.unshift({
    id: 'act-' + uuidv4(),
    logText: `Client details updated: ${updatedClient.name}`,
    timestamp: new Date().toISOString(),
    type: 'info'
  });
  writeTable('activities', activities.slice(0, 50));

  res.json(updatedClient);
});

// DELETE /api/clients/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const clients = readTable('clients');
  const clientToDelete = clients.find(c => c.id === req.params.id);
  if (!clientToDelete) {
    return res.status(404).json({ message: 'Client not found' });
  }

  const filteredClients = clients.filter(c => c.id !== req.params.id);
  writeTable('clients', filteredClients);

  // Optional: cascade delete client's policies and tasks
  const policies = readTable('policies');
  const filteredPolicies = policies.filter(p => p.clientId !== req.params.id);
  writeTable('policies', filteredPolicies);

  const activities = readTable('activities');
  activities.unshift({
    id: 'act-' + uuidv4(),
    logText: `Client removed: ${clientToDelete.name}`,
    timestamp: new Date().toISOString(),
    type: 'danger'
  });
  writeTable('activities', activities.slice(0, 50));

  res.json({ message: 'Client deleted successfully' });
});

module.exports = router;
