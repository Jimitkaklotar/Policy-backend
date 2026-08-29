const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { sendMailNotification } = require('../utils/mailer');

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
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const { query, type, status } = req.query;

    const filter = {};
    if (type && type !== 'All') {
      filter.type = { $regex: new RegExp(`^${type}$`, 'i') };
    }
    if (status && status !== 'All') {
      filter.status = { $regex: new RegExp(`^${status}$`, 'i') };
    }

    let policies = await db.collection('policies').find(filter).sort({ createdAt: -1, _id: -1 }).toArray();

    if (query) {
      const q = query.toLowerCase();
      const clients = await db.collection('clients').find({}).toArray();
      policies = policies.filter(p => {
        const client = clients.find(c => c.id === p.clientId);
        
        const matchPolicyNumber = p.policyNumber ? p.policyNumber.toLowerCase().includes(q) : false;
        const matchClientName = p.clientName ? p.clientName.toLowerCase().includes(q) : false;
        const matchType = p.type ? p.type.toLowerCase().includes(q) : false;
        const matchStatus = p.status ? p.status.toLowerCase().includes(q) : false;
        const matchDescription = p.description ? p.description.toLowerCase().includes(q) : false;
        const matchExpiry = p.expiryDate ? p.expiryDate.toLowerCase().includes(q) : false;
        
        const matchClientEmail = client && client.email ? client.email.toLowerCase().includes(q) : false;
        const matchClientPhone = client && client.phone ? client.phone.toLowerCase().includes(q) : false;
        const matchClientId = client && client.id ? client.id.toLowerCase().includes(q) : false;
        
        const matchPremium = p.premiumAmount ? p.premiumAmount.toString().toLowerCase().includes(q) : false;
        const matchSum = p.sumAssured ? p.sumAssured.toString().toLowerCase().includes(q) : false;
        const matchCompany = p.company ? p.company.toLowerCase().includes(q) : false;
        const matchCode = p.code ? p.code.toLowerCase().includes(q) : false;
        const matchVehicleNumber = p.vehicleNumber ? p.vehicleNumber.toLowerCase().includes(q) : false;

        return (
          matchPolicyNumber ||
          matchClientName ||
          matchType ||
          matchStatus ||
          matchDescription ||
          matchExpiry ||
          matchClientEmail ||
          matchClientPhone ||
          matchClientId ||
          matchPremium ||
          matchSum ||
          matchCompany ||
          matchCode ||
          matchVehicleNumber
        );
      });
    }

    // Sort by latest entry first (createdAt descending, fallback to issueDate / _id / id)
    policies.sort((a, b) => {
      const timeA = (a.createdAt ? new Date(a.createdAt).getTime() : 0) || (a.issueDate ? new Date(a.issueDate).getTime() : 0) || 0;
      const timeB = (b.createdAt ? new Date(b.createdAt).getTime() : 0) || (b.issueDate ? new Date(b.issueDate).getTime() : 0) || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

    // Attach client details and policy schedule document if it exists
    const documents = await db.collection('documents').find({}).toArray();
    const clients = await db.collection('clients').find({}).toArray();
    const policiesWithDocs = policies.map(p => {
      const scheduleDoc = documents.find(d => d.policyId === p.id && d.documentType === 'Policy Schedule');
      const client = p.clientId ? clients.find(c => c.id === p.clientId) : null;
      return {
        ...p,
        clientEmail: client ? client.email : (p.clientEmail || ''),
        clientPhone: client ? client.phone : (p.clientPhone || ''),
        scheduleDocument: scheduleDoc || null
      };
    });

    res.json(policiesWithDocs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching policies', error: error.message });
  }
});

// GET /api/policies/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const policy = await db.collection('policies').findOne({ id: req.params.id });
    if (!policy) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    // Fetch client details
    let client = null;
    if (policy.clientId) {
      client = await db.collection('clients').findOne({ id: policy.clientId });
    }

    // Fetch related documents
    const policyDocs = await db.collection('documents').find({ policyId: policy.id }).toArray();

    res.json({
      ...policy,
      clientDetails: client || (policy.clientName ? {
        id: policy.clientId || '',
        name: policy.clientName,
        email: policy.clientEmail || '',
        phone: policy.clientPhone || '',
        dob: policy.dob || '',
        avatar: ''
      } : null),
      documents: policyDocs
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching policy details', error: error.message });
  }
});

// POST /api/policies
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  const { 
    clientId, 
    clientName, 
    clientEmail, 
    clientPhone, 
    type, 
    premiumAmount, 
    sumAssured, 
    expiryDate, 
    status, 
    description, 
    company, 
    dob, 
    subType, 
    issueDate, 
    vehicleNumber, 
    code 
  } = req.body;
  
  if (!type) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(400).json({ message: 'Required field: type' });
  }

  try {
    const db = getDb();
    let client = null;
    if (clientId) {
      client = await db.collection('clients').findOne({ id: clientId });
    }

    const resolvedClientName = (client ? client.name : clientName) || 'General Policy Holder';
    const resolvedClientEmail = (client ? client.email : clientEmail) || '';
    const resolvedClientPhone = (client ? client.phone : clientPhone) || '';
    const resolvedDob = dob || (client ? client.dob : '') || '';

    const newPolicy = {
      id: 'pol-' + Math.floor(100000 + Math.random() * 900000),
      policyNumber: 'POL-' + Math.floor(100000000 + Math.random() * 900000000),
      clientName: resolvedClientName,
      clientId: client ? client.id : (clientId || ''),
      clientEmail: resolvedClientEmail,
      clientPhone: resolvedClientPhone,
      type,
      subType: subType || '',
      company: company || '',
      premiumAmount: Number(premiumAmount || 0),
      sumAssured: Number(sumAssured || 0),
      issueDate: issueDate || '',
      expiryDate: expiryDate || '',
      dob: resolvedDob,
      status: status || 'Active',
      description: description || '',
      vehicleNumber: vehicleNumber || '',
      code: code || '',
      kycVerified: false,
      createdAt: new Date().toISOString()
    };

    await db.collection('policies').insertOne(newPolicy);

    // If a file is uploaded, add it to documents vault linked to this policy
    if (req.file) {
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
        clientId: newPolicy.clientId || '',
        documentName: 'Policy Schedule PDF',
        documentType: 'Policy Schedule',
        filePath: `uploads/${req.file.filename}`,
        fileSize: formattedSize,
        uploadedAt: new Date().toISOString()
      };
      await db.collection('documents').insertOne(newDoc);
    }

    // Update client's active policy count if linked to an existing client
    if (client && newPolicy.status === 'Active') {
      await db.collection('clients').updateOne(
        { id: client.id },
        { $inc: { activePoliciesCount: 1 } }
      );
    }

    // Log activity
    const activity = {
      id: 'act-' + uuidv4(),
      logText: `New ${type} Policy Issued for ${newPolicy.clientName} (Policy: ${newPolicy.policyNumber})${req.file ? ' with PDF schedule' : ''}`,
      timestamp: new Date().toISOString(),
      type: 'success'
    };
    await db.collection('activities').insertOne(activity);

    // Keep last 50 activities
    const acts = await db.collection('activities').find({}).sort({ timestamp: -1 }).toArray();
    if (acts.length > 50) {
      const toDeleteIds = acts.slice(50).map(a => a.id);
      await db.collection('activities').deleteMany({ id: { $in: toDeleteIds } });
    }

    // Send email notification if client email exists
    if (resolvedClientEmail) {
      const mailContent = `
        <p>Dear Valued Client,</p>
        <p>A new insurance policy has been issued successfully on the TrustAssure Broker CRM.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 120px; border-bottom: 1px solid #f1f5f9;">Policy Number:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newPolicy.policyNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Client Name:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newPolicy.clientName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Insurance Type:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newPolicy.type}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Premium Amount:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">₹${newPolicy.premiumAmount.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Sum Assured:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">₹${newPolicy.sumAssured.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Expiry Date:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newPolicy.expiryDate || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Status:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; color: #10B981; font-weight: 500;">${newPolicy.status}</td>
          </tr>
        </table>
      `;
      sendMailNotification(resolvedClientEmail, `Policy Issued: ${newPolicy.policyNumber}`, 'Insurance Policy Issued Confirmation', mailContent);
    }

    res.status(201).json(newPolicy);
  } catch (error) {
    res.status(500).json({ message: 'Error issuing policy', error: error.message });
  }
});

// PUT /api/policies/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const oldPolicy = await db.collection('policies').findOne({ id: req.params.id });
    if (!oldPolicy) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    const { 
      type, 
      subType,
      premiumAmount, 
      sumAssured, 
      expiryDate, 
      status, 
      description, 
      kycVerified, 
      company, 
      dob, 
      issueDate, 
      vehicleNumber, 
      code,
      clientName,
      clientEmail,
      clientPhone,
      clientId
    } = req.body;

    const updatedFields = {};
    if (type !== undefined) updatedFields.type = type;
    if (subType !== undefined) updatedFields.subType = subType;
    if (premiumAmount !== undefined) updatedFields.premiumAmount = Number(premiumAmount);
    if (sumAssured !== undefined) updatedFields.sumAssured = Number(sumAssured);
    if (expiryDate !== undefined) updatedFields.expiryDate = expiryDate;
    if (status !== undefined) updatedFields.status = status;
    if (description !== undefined) updatedFields.description = description;
    if (kycVerified !== undefined) updatedFields.kycVerified = kycVerified;
    if (company !== undefined) updatedFields.company = company;
    if (dob !== undefined) updatedFields.dob = dob;
    if (issueDate !== undefined) updatedFields.issueDate = issueDate;
    if (vehicleNumber !== undefined) updatedFields.vehicleNumber = vehicleNumber;
    if (code !== undefined) updatedFields.code = code;
    if (clientName !== undefined) updatedFields.clientName = clientName;
    if (clientEmail !== undefined) updatedFields.clientEmail = clientEmail;
    if (clientPhone !== undefined) updatedFields.clientPhone = clientPhone;
    if (clientId !== undefined) updatedFields.clientId = clientId;

    await db.collection('policies').updateOne({ id: req.params.id }, { $set: updatedFields });
    const updatedPolicy = { ...oldPolicy, ...updatedFields };

    // Adjust client active policies count if status changed and linked to client
    if (status && oldPolicy.status !== status && oldPolicy.clientId) {
      if (status === 'Active' && oldPolicy.status !== 'Active') {
        await db.collection('clients').updateOne({ id: oldPolicy.clientId }, { $inc: { activePoliciesCount: 1 } });
      } else if (status !== 'Active' && oldPolicy.status === 'Active') {
        await db.collection('clients').updateOne({ id: oldPolicy.clientId }, { $inc: { activePoliciesCount: -1 } });
      }
    }

    // Log activity
    const activity = {
      id: 'act-' + uuidv4(),
      logText: `Policy details updated: ${updatedPolicy.policyNumber}`,
      timestamp: new Date().toISOString(),
      type: 'info'
    };
    await db.collection('activities').insertOne(activity);

    // Send email notification to client if email exists
    const targetEmail = updatedPolicy.clientEmail || (updatedPolicy.clientId ? (await db.collection('clients').findOne({ id: updatedPolicy.clientId }))?.email : '');
    if (targetEmail) {
      const mailContent = `
        <p>Dear Valued Client,</p>
        <p>Your TrustAssure insurance policy details have been updated successfully.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 120px; border-bottom: 1px solid #f1f5f9;">Policy Number:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedPolicy.policyNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Insurance Type:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedPolicy.type}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Premium Amount:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">₹${updatedPolicy.premiumAmount.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Expiry Date:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedPolicy.expiryDate || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Status:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${updatedPolicy.status}</td>
          </tr>
        </table>
      `;
      sendMailNotification(targetEmail, `Policy Updated: ${updatedPolicy.policyNumber}`, 'Insurance Policy Details Updated', mailContent);
    }

    delete updatedPolicy._id;
    res.json(updatedPolicy);
  } catch (error) {
    res.status(500).json({ message: 'Error updating policy', error: error.message });
  }
});

// DELETE /api/policies/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const policyToDelete = await db.collection('policies').findOne({ id: req.params.id });
    if (!policyToDelete) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    await db.collection('policies').deleteOne({ id: req.params.id });

    // Decrement client active policies count if clientId exists
    if (policyToDelete.clientId && policyToDelete.status === 'Active') {
      await db.collection('clients').updateOne(
        { id: policyToDelete.clientId },
        { $inc: { activePoliciesCount: -1 } }
      );
    }

    // Cleanup documents associated with policy
    const policyDocs = await db.collection('documents').find({ policyId: req.params.id }).toArray();
    await db.collection('documents').deleteMany({ policyId: req.params.id });

    // Delete physical files
    policyDocs.forEach(d => {
      const fullPath = path.join(__dirname, '..', d.filePath);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (err) {}
      }
    });

    // Log activity
    const activity = {
      id: 'act-' + uuidv4(),
      logText: `Policy deleted: ${policyToDelete.policyNumber}`,
      timestamp: new Date().toISOString(),
      type: 'danger'
    };
    await db.collection('activities').insertOne(activity);

    res.json({ message: 'Policy deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting policy', error: error.message });
  }
});

// POST /api/policies/:id/documents/upload
router.post('/:id/documents/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const db = getDb();
    const policy = await db.collection('policies').findOne({ id: req.params.id });
    if (!policy) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Policy not found' });
    }

    const { documentType, documentName } = req.body;
    if (!documentType) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'documentType is required' });
    }

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
      documentType,
      filePath: relativePath,
      fileSize: formattedSize,
      uploadedAt: new Date().toISOString()
    };

    await db.collection('documents').insertOne(newDoc);

    // If Aadhaar or PAN is uploaded, check if we need to auto mark kycVerified as true
    const docsForPolicy = await db.collection('documents').find({ policyId: policy.id }).toArray();
    const hasAadhaar = docsForPolicy.some(d => d.documentType.toLowerCase() === 'aadhaar');
    const hasPAN = docsForPolicy.some(d => d.documentType.toLowerCase() === 'pan');
    if (hasAadhaar && hasPAN && !policy.kycVerified) {
      await db.collection('policies').updateOne({ id: policy.id }, { $set: { kycVerified: true } });
    }

    // Send email notification to client and author
    const client = await db.collection('clients').findOne({ id: policy.clientId });
    if (client) {
      const mailContent = `
        <p>Dear jimt & Client,</p>
        <p>A new document has been uploaded to the document vault for policy <strong>${policy.policyNumber}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 120px; border-bottom: 1px solid #f1f5f9;">Document Name:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newDoc.documentName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">Document Type:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newDoc.documentType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #f1f5f9;">File Size:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${newDoc.fileSize}</td>
          </tr>
        </table>
      `;
      sendMailNotification(client.email, `Document Uploaded: ${newDoc.documentName}`, 'Document Upload Notification', mailContent);
    }

    res.status(201).json(newDoc);
  } catch (error) {
    res.status(500).json({ message: 'Error uploading document', error: error.message });
  }
});

// DELETE /api/policies/:id/documents/:docId
router.delete('/:id/documents/:docId', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('documents').findOne({ id: req.params.docId, policyId: req.params.id });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const fullPath = path.join(__dirname, '..', doc.filePath);
    await db.collection('documents').deleteOne({ id: req.params.docId });

    // Delete physical file
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (err) {}
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting document', error: error.message });
  }
});

// GET /api/policies/documents/download/:docId
router.get('/documents/download/:docId', async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('documents').findOne({ id: req.params.docId });
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const fullPath = path.join(__dirname, '..', doc.filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Physical file not found on server' });
    }

    res.download(fullPath, doc.documentName + path.extname(doc.filePath));
  } catch (error) {
    res.status(500).json({ message: 'Error downloading document', error: error.message });
  }
});

module.exports = router;
