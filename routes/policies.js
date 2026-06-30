const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { readTable, writeTable } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Multer Setup for File Uploads
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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// GET /api/policies
router.get('/', authMiddleware, (req, res) => {
  let policies = readTable('policies');
  const { query, type, status } = req.query;

  if (query) {
    const q = query.toLowerCase();
    policies = policies.filter(p => 
      p.policyNumber.toLowerCase().includes(q) || 
      p.clientName.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  if (type && type !== 'All') {
    policies = policies.filter(p => p.type.toLowerCase() === type.toLowerCase());
  }

  if (status && status !== 'All') {
    policies = policies.filter(p => p.status.toLowerCase() === status.toLowerCase());
  }

  // Sort by created date or number
  policies.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json(policies);
});

// GET /api/policies/:id
router.get('/:id', authMiddleware, (req, res) => {
  const policies = readTable('policies');
  const policy = policies.find(p => p.id === req.params.id);
  if (!policy) {
    return res.status(404).json({ message: 'Policy not found' });
  }

  // Fetch client details
  const clients = readTable('clients');
  const client = clients.find(c => c.id === policy.clientId);

  // Fetch related documents
  const documents = readTable('documents');
  const policyDocs = documents.filter(d => d.policyId === policy.id);

  res.json({
    ...policy,
    clientDetails: client || null,
    documents: policyDocs
  });
});

// POST /api/policies
router.post('/', authMiddleware, upload.single('file'), (req, res) => {
  const { clientId, type, premiumAmount, sumAssured, expiryDate, status, description } = req.body;
  
  if (!clientId || !type || !premiumAmount || !sumAssured || !expiryDate) {
    // If file was uploaded but validation fails, clean up the file
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(400).json({ message: 'Required fields: clientId, type, premiumAmount, sumAssured, expiryDate' });
  }

  const clients = readTable('clients');
  const client = clients.find(c => c.id === clientId);
  if (!client) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(404).json({ message: 'Client not found' });
  }

  const policies = readTable('policies');
  const newPolicy = {
    id: 'pol-' + Math.floor(100000 + Math.random() * 900000), // e.g. pol-123456
    policyNumber: 'POL-' + Math.floor(100000000 + Math.random() * 900000000), // e.g. POL-987654321
    clientName: client.name,
    clientId: client.id,
    type,
    premiumAmount: Number(premiumAmount),
    sumAssured: Number(sumAssured),
    expiryDate,
    status: status || 'Active',
    description: description || '',
    kycVerified: false,
    createdAt: new Date().toISOString()
  };

  policies.push(newPolicy);
  writeTable('policies', policies);

  // If a file is uploaded, add it to documents vault linked to this policy
  if (req.file) {
    const documents = readTable('documents');
    const bytes = req.file.size;
    let formattedSize = '0 Bytes';
    if (bytes > 0) {
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      formattedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    const newDoc = {
      id: 'doc-' + uuidv4(),
      policyId: newPolicy.id,
      clientId: newPolicy.clientId,
      documentName: 'Policy Schedule PDF',
      documentType: 'Policy Schedule',
      filePath: `uploads/${req.file.filename}`,
      fileSize: formattedSize,
      uploadedAt: new Date().toISOString()
    };
    documents.push(newDoc);
    writeTable('documents', documents);
  }

  // Update client's active policy count
  if (newPolicy.status === 'Active') {
    client.activePoliciesCount = (client.activePoliciesCount || 0) + 1;
    writeTable('clients', clients);
  }

  // Log activity
  const activities = readTable('activities');
  activities.unshift({
    id: 'act-' + uuidv4(),
    logText: `New ${type} Policy Issued for ${client.name} (Policy: ${newPolicy.policyNumber})${req.file ? ' with PDF schedule' : ''}`,
    timestamp: new Date().toISOString(),
    type: 'success'
  });
  writeTable('activities', activities.slice(0, 50));

  res.status(201).json(newPolicy);
});

// PUT /api/policies/:id
router.put('/:id', authMiddleware, (req, res) => {
  const policies = readTable('policies');
  const idx = policies.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Policy not found' });
  }

  const { type, premiumAmount, sumAssured, expiryDate, status, description, kycVerified } = req.body;
  const oldPolicy = policies[idx];

  const updatedPolicy = {
    ...oldPolicy,
    type: type || oldPolicy.type,
    premiumAmount: premiumAmount !== undefined ? Number(premiumAmount) : oldPolicy.premiumAmount,
    sumAssured: sumAssured !== undefined ? Number(sumAssured) : oldPolicy.sumAssured,
    expiryDate: expiryDate || oldPolicy.expiryDate,
    status: status || oldPolicy.status,
    description: description !== undefined ? description : oldPolicy.description,
    kycVerified: kycVerified !== undefined ? kycVerified : oldPolicy.kycVerified
  };

  policies[idx] = updatedPolicy;
  writeTable('policies', policies);

  // Adjust client active policies count if status changed
  if (oldPolicy.status !== updatedPolicy.status) {
    const clients = readTable('clients');
    const client = clients.find(c => c.id === updatedPolicy.clientId);
    if (client) {
      if (updatedPolicy.status === 'Active' && oldPolicy.status !== 'Active') {
        client.activePoliciesCount = (client.activePoliciesCount || 0) + 1;
      } else if (updatedPolicy.status !== 'Active' && oldPolicy.status === 'Active') {
        client.activePoliciesCount = Math.max(0, (client.activePoliciesCount || 0) - 1);
      }
      writeTable('clients', clients);
    }
  }

  // Log activity
  const activities = readTable('activities');
  activities.unshift({
    id: 'act-' + uuidv4(),
    logText: `Policy details updated: ${updatedPolicy.policyNumber}`,
    timestamp: new Date().toISOString(),
    type: 'info'
  });
  writeTable('activities', activities.slice(0, 50));

  res.json(updatedPolicy);
});

// DELETE /api/policies/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const policies = readTable('policies');
  const policyToDelete = policies.find(p => p.id === req.params.id);
  if (!policyToDelete) {
    return res.status(404).json({ message: 'Policy not found' });
  }

  const filteredPolicies = policies.filter(p => p.id !== req.params.id);
  writeTable('policies', filteredPolicies);

  // Decrement client active policies count
  if (policyToDelete.status === 'Active') {
    const clients = readTable('clients');
    const client = clients.find(c => c.id === policyToDelete.clientId);
    if (client) {
      client.activePoliciesCount = Math.max(0, (client.activePoliciesCount || 0) - 1);
      writeTable('clients', clients);
    }
  }

  // Cleanup documents associated with policy
  const documents = readTable('documents');
  const policyDocs = documents.filter(d => d.policyId === req.params.id);
  const remainingDocs = documents.filter(d => d.policyId !== req.params.id);
  writeTable('documents', remainingDocs);

  // Delete physical files
  policyDocs.forEach(d => {
    const fullPath = path.join(__dirname, '..', d.filePath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.error(`Failed to delete file: ${fullPath}`, err);
      }
    }
  });

  const activities = readTable('activities');
  activities.unshift({
    id: 'act-' + uuidv4(),
    logText: `Policy deleted: ${policyToDelete.policyNumber}`,
    timestamp: new Date().toISOString(),
    type: 'danger'
  });
  writeTable('activities', activities.slice(0, 50));

  res.json({ message: 'Policy deleted successfully' });
});

// POST /api/policies/:id/documents/upload
router.post('/:id/documents/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const policies = readTable('policies');
  const policy = policies.find(p => p.id === req.params.id);
  if (!policy) {
    // Cleanup physical file if policy is not found
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ message: 'Policy not found' });
  }

  const { documentType, documentName } = req.body;
  if (!documentType) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'documentType is required' });
  }

  const documents = readTable('documents');
  
  // Format file size
  const bytes = req.file.size;
  let formattedSize = '0 Bytes';
  if (bytes > 0) {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    formattedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const relativePath = `uploads/${req.file.filename}`;

  const newDoc = {
    id: 'doc-' + uuidv4(),
    policyId: policy.id,
    clientId: policy.clientId,
    documentName: documentName || req.file.originalname,
    documentType, // Aadhaar, PAN, Policy Schedule, Receipt, Other
    filePath: relativePath,
    fileSize: formattedSize,
    uploadedAt: new Date().toISOString()
  };

  documents.push(newDoc);
  writeTable('documents', documents);

  // If Aadhaar or PAN is uploaded, check if we need to auto mark kycVerified as true
  const docsForPolicy = documents.filter(d => d.policyId === policy.id);
  const hasAadhaar = docsForPolicy.some(d => d.documentType.toLowerCase() === 'aadhaar');
  const hasPAN = docsForPolicy.some(d => d.documentType.toLowerCase() === 'pan');
  if (hasAadhaar && hasPAN && !policy.kycVerified) {
    policy.kycVerified = true;
    writeTable('policies', policies);
  }

  res.status(201).json(newDoc);
});

// DELETE /api/policies/:id/documents/:docId
router.delete('/:id/documents/:docId', authMiddleware, (req, res) => {
  const documents = readTable('documents');
  const docIdx = documents.findIndex(d => d.id === req.params.docId && d.policyId === req.params.id);
  if (docIdx === -1) {
    return res.status(404).json({ message: 'Document not found' });
  }

  const doc = documents[docIdx];
  const fullPath = path.join(__dirname, '..', doc.filePath);
  
  // Remove record
  const filteredDocs = documents.filter(d => d.id !== req.params.docId);
  writeTable('documents', filteredDocs);

  // Delete physical file
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.error(`Failed to delete physical file: ${fullPath}`, err);
    }
  }

  res.json({ message: 'Document deleted successfully' });
});

// GET /api/policies/documents/download/:docId
router.get('/documents/download/:docId', (req, res) => {
  const documents = readTable('documents');
  const doc = documents.find(d => d.id === req.params.docId);
  if (!doc) {
    return res.status(404).json({ message: 'Document not found' });
  }

  const fullPath = path.join(__dirname, '..', doc.filePath);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: 'Physical file not found on server' });
  }

  // Force browser file download dialog
  res.download(fullPath, doc.documentName + path.extname(doc.filePath));
});

module.exports = router;
