const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendMailNotification } = require('../utils/mailer');

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
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const { query, status } = req.query;

    const filter = {};
    if (status && status !== 'All') {
      filter.status = { $regex: new RegExp(`^${status}$`, 'i') };
    }

    if (query) {
      const q = query.toLowerCase();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { id: { $regex: q, $options: 'i' } }
      ];
    }

    const clients = await db.collection('clients').find(filter).toArray();
    clients.sort((a, b) => a.name.localeCompare(b.name));

    // Fetch documents and attach
    const documents = await db.collection('documents').find({}).toArray();
    const clientsWithDocs = clients.map(c => {
      const clientDocs = documents.filter(d => d.clientId === c.id);
      return {
        ...c,
        documents: clientDocs
      };
    });

    res.json(clientsWithDocs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching clients', error: error.message });
  }
});

// GET /api/clients/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const client = await db.collection('clients').findOne({ id: req.params.id });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching client details', error: error.message });
  }
});

// POST /api/clients
router.post('/', authMiddleware, upload.fields([{ name: 'aadhaar', maxCount: 1 }, { name: 'pan', maxCount: 1 }]), async (req, res) => {
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

  try {
    const db = getDb();
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=004DC0&color=fff`;

    const newClient = {
      id: 'cli-' + Math.floor(10000 + Math.random() * 90000),
      name,
      email,
      phone: phone || '',
      dob: dob || '',
      activePoliciesCount: 0,
      status: status || 'Active',
      avatar,
      createdAt: new Date().toISOString()
    };

    await db.collection('clients').insertOne(newClient);

    // Handle uploaded files (Aadhaar & PAN)
    if (req.files) {
      const clientDocs = [];

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
        clientDocs.push({
          id: 'doc-' + uuidv4(),
          policyId: '',
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
        clientDocs.push({
          id: 'doc-' + uuidv4(),
          policyId: '',
          clientId: newClient.id,
          documentName: 'PAN Card Copy',
          documentType: 'PAN',
          filePath: `uploads/${file.filename}`,
          fileSize: formattedSize,
          uploadedAt: new Date().toISOString()
        });
      }

      if (clientDocs.length > 0) {
        await db.collection('documents').insertMany(clientDocs);
      }
    }

    // Log activity
    const activity = {
      id: 'act-' + uuidv4(),
      logText: `New Client added: ${name}`,
      timestamp: new Date().toISOString(),
      type: 'info'
    };
    await db.collection('activities').insertOne(activity);

    // Keep last 50 activities
    const acts = await db.collection('activities').find({}).sort({ timestamp: -1 }).toArray();
    if (acts.length > 50) {
      const toDeleteIds = acts.slice(50).map(a => a.id);
      await db.collection('activities').deleteMany({ id: { $in: toDeleteIds } });
    }

    // Send email notification to client and author
    const mailContent = `
      <p>Dear jimt & Client,</p>
      <p>A new client profile has been registered successfully on the TrustAssure Broker CRM.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 120px; border-bottom: 1px solid #f1f5f9;">Client ID:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newClient.id}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Full Name:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newClient.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Email ID:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newClient.email}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Mobile No:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newClient.phone || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Date of Birth:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newClient.dob || 'N/A'}</td>
        </tr>
      </table>
    `;
    sendMailNotification(newClient.email, `Client Registered: ${newClient.name}`, 'Client Registration Complete', mailContent);

    res.status(201).json(newClient);
  } catch (error) {
    res.status(500).json({ message: 'Error creating client', error: error.message });
  }
});

// PUT /api/clients/:id
router.put('/:id', authMiddleware, upload.fields([{ name: 'aadhaar', maxCount: 1 }, { name: 'pan', maxCount: 1 }]), async (req, res) => {
  try {
    const db = getDb();
    const client = await db.collection('clients').findOne({ id: req.params.id });
    if (!client) {
      if (req.files) {
        if (req.files.aadhaar) { try { fs.unlinkSync(req.files.aadhaar[0].path); } catch (e) {} }
        if (req.files.pan) { try { fs.unlinkSync(req.files.pan[0].path); } catch (e) {} }
      }
      return res.status(404).json({ message: 'Client not found' });
    }

    const { name, email, phone, dob, status } = req.body;
    const updatedFields = {};
    if (name !== undefined) updatedFields.name = name;
    if (email !== undefined) updatedFields.email = email;
    if (phone !== undefined) updatedFields.phone = phone;
    if (dob !== undefined) updatedFields.dob = dob;
    if (status !== undefined) updatedFields.status = status;

    await db.collection('clients').updateOne({ id: req.params.id }, { $set: updatedFields });
    const updatedClient = { ...client, ...updatedFields };

    // Handle uploaded files (Aadhaar & PAN update)
    if (req.files) {
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

        const existingDoc = await db.collection('documents').findOne({ clientId: req.params.id, documentType: 'Aadhaar' });
        if (existingDoc) {
          const oldPath = path.join(__dirname, '..', existingDoc.filePath);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (e) {}
          }
          await db.collection('documents').updateOne(
            { id: existingDoc.id },
            { $set: { filePath: `uploads/${file.filename}`, fileSize: formattedSize, uploadedAt: new Date().toISOString() } }
          );
        } else {
          await db.collection('documents').insertOne({
            id: 'doc-' + uuidv4(),
            policyId: '',
            clientId: req.params.id,
            documentName: 'Aadhaar Card',
            documentType: 'Aadhaar',
            filePath: `uploads/${file.filename}`,
            fileSize: formattedSize,
            uploadedAt: new Date().toISOString()
          });
        }
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

        const existingDoc = await db.collection('documents').findOne({ clientId: req.params.id, documentType: 'PAN' });
        if (existingDoc) {
          const oldPath = path.join(__dirname, '..', existingDoc.filePath);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (e) {}
          }
          await db.collection('documents').updateOne(
            { id: existingDoc.id },
            { $set: { filePath: `uploads/${file.filename}`, fileSize: formattedSize, uploadedAt: new Date().toISOString() } }
          );
        } else {
          await db.collection('documents').insertOne({
            id: 'doc-' + uuidv4(),
            policyId: '',
            clientId: req.params.id,
            documentName: 'PAN Card Copy',
            documentType: 'PAN',
            filePath: `uploads/${file.filename}`,
            fileSize: formattedSize,
            uploadedAt: new Date().toISOString()
          });
        }
      }
    }

    // Log activity
    const activity = {
      id: 'act-' + uuidv4(),
      logText: `Client details updated: ${updatedClient.name}`,
      timestamp: new Date().toISOString(),
      type: 'info'
    };
    await db.collection('activities').insertOne(activity);

    // Send email notification to client and author
    const mailContent = `
      <p>Dear jimt & Client,</p>
      <p>The client profile details have been updated successfully on the TrustAssure Broker CRM.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; width: 120px; border-bottom: 1px solid #f1f5f9;">Client ID:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedClient.id}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Full Name:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedClient.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Email ID:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedClient.email}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Mobile No:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedClient.phone || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Status:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedClient.status}</td>
        </tr>
      </table>
    `;
    sendMailNotification(updatedClient.email, `Client Updated: ${updatedClient.name}`, 'Client Profile Updated', mailContent);

    delete updatedClient._id;
    res.json(updatedClient);
  } catch (error) {
    res.status(500).json({ message: 'Error updating client', error: error.message });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const clientToDelete = await db.collection('clients').findOne({ id: req.params.id });
    if (!clientToDelete) {
      return res.status(404).json({ message: 'Client not found' });
    }

    await db.collection('clients').deleteOne({ id: req.params.id });
    await db.collection('policies').deleteMany({ clientId: req.params.id });
    await db.collection('documents').deleteMany({ clientId: req.params.id });

    // Log activity
    const activity = {
      id: 'act-' + uuidv4(),
      logText: `Client removed: ${clientToDelete.name}`,
      timestamp: new Date().toISOString(),
      type: 'danger'
    };
    await db.collection('activities').insertOne(activity);

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting client', error: error.message });
  }
});

module.exports = router;
