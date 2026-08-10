const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const clients = await db.collection('clients').find({}).toArray();
    const policies = await db.collection('policies').find({}).toArray();
    const activities = await db.collection('activities').find({}).sort({ timestamp: -1 }).toArray();
    const dismissedAlerts = await db.collection('dismissedAlerts').find({}).toArray();
    const generatedAlerts = await db.collection('generatedAlerts').find({}).toArray();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dismissedIds = new Set(dismissedAlerts.map(d => d.alertId));
    const alertTimes = new Map(generatedAlerts.map(g => [g.alertId, new Date(g.createdAt)]));
    const newAlertDocs = [];

    const shouldShowAlert = (alertId) => {
      if (dismissedIds.has(alertId)) return false;
      const timeSeen = alertTimes.get(alertId);
      if (!timeSeen) {
        newAlertDocs.push({ alertId, createdAt: new Date().toISOString() });
        return true;
      }
      const hoursElapsed = (new Date() - timeSeen) / (1000 * 60 * 60);
      if (hoursElapsed > 24) {
        return false; // Auto-dismiss after 24 hours
      }
      return true;
    };

    // 1. Stats Cards
    const totalClients = clients.length;
    const activePolicies = policies.filter(p => p.status === 'Active').length;

    // Renewals due in the next 30 days (excluding Life insurance & dismissed alerts, based on 15, 7, 1 day ratio)
    const renewalsDuePolicies = policies.filter(p => {
      if (p.type === 'Life') return false;
      if (p.status !== 'Active') return false;
      const expiry = new Date(p.expiryDate);
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (![15, 7, 1].includes(diffDays)) return false;

      const alertId = `p-${p.id}-${p.expiryDate}-${diffDays}`;
      return shouldShowAlert(alertId);
    });
    const renewalsDueCount = renewalsDuePolicies.length;

    // 2. Birthday Reminders (matching MM-DD & not dismissed for current year)
    const todayMMDD = today.toISOString().slice(5, 10); // "MM-DD"
    const birthdayClients = clients.filter(c => {
      if (!c.dob) return false;
      const dobMMDD = c.dob.slice(5, 10);
      if (dobMMDD !== todayMMDD) return false;

      const alertId = `b-${c.id}-${today.getFullYear()}`;
      return shouldShowAlert(alertId);
    }).map(c => {
      const msg = `Happy Birthday ${c.name}! Wishing you a wonderful year ahead filled with happiness and success, from the team at TrustAssure. 🎂🎉`;
      const cleanPhone = c.phone.replace(/[^0-9]/g, '');
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
      
      return {
        id: `b-${c.id}-${today.getFullYear()}`,
        alertId: `b-${c.id}-${today.getFullYear()}`,
        clientId: c.id,
        name: c.name,
        dob: c.dob,
        phone: c.phone,
        email: c.email || '',
        avatar: c.avatar,
        whatsappUrl
      };
    });

    // 3. Policy Expiry Alerts (exactly 15, 7, 1 days) (excluding Life insurance & dismissed)
    const expiryAlerts = policies.filter(p => {
      if (p.type === 'Life') return false;
      if (p.status !== 'Active') return false;
      const expiry = new Date(p.expiryDate);
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (![15, 7, 1].includes(diffDays)) return false;

      const alertId = `p-${p.id}-${p.expiryDate}-${diffDays}`;
      return shouldShowAlert(alertId);
    }).map(p => {
      const expiry = new Date(p.expiryDate);
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const client = clients.find(c => c.id === p.clientId);
      const clientPhone = client ? client.phone : '';
      const clientEmail = client ? client.email : '';
      const cleanPhone = clientPhone.replace(/[^0-9]/g, '');

      const msg = `Dear ${p.clientName}, your TrustAssure policy ${p.policyNumber} (${p.type} Insurance) is due for renewal on ${p.expiryDate} (${diffDays} days left). Please reach out to initiate renewal. Thank you!`;
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;

      return {
        id: `p-${p.id}-${p.expiryDate}-${diffDays}`,
        alertId: `p-${p.id}-${p.expiryDate}-${diffDays}`,
        policyId: p.id,
        policyNumber: p.policyNumber,
        clientName: p.clientName,
        clientEmail,
        type: p.type,
        expiryDate: p.expiryDate,
        daysLeft: diffDays,
        whatsappUrl
      };
    });

    expiryAlerts.sort((a, b) => a.daysLeft - b.daysLeft);

    // Save newly calculated alerts with generation timestamps
    if (newAlertDocs.length > 0) {
      await db.collection('generatedAlerts').insertMany(newAlertDocs);
    }

    // 4. Recent Activities (limit to 10)
    const recentActivities = activities.slice(0, 10);

    res.json({
      stats: {
        totalClients,
        activePolicies,
        renewalsDue: renewalsDueCount
      },
      birthdaysToday: birthdayClients,
      expiringPolicies: expiryAlerts,
      recentActivities
    });
  } catch (error) {
    res.status(500).json({ message: 'Error calculating dashboard metrics', error: error.message });
  }
});

// POST /api/dashboard/dismiss
router.post('/dismiss', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const { alertId } = req.body;
    if (!alertId) {
      return res.status(400).json({ message: 'alertId is required' });
    }

    const existing = await db.collection('dismissedAlerts').findOne({ alertId });
    if (!existing) {
      await db.collection('dismissedAlerts').insertOne({
        alertId,
        dismissedAt: new Date().toISOString()
      });
    }

    res.json({ message: 'Alert dismissed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error dismissing alert', error: error.message });
  }
});

module.exports = router;
