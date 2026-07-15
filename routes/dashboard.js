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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Stats Cards
    const totalClients = clients.length;
    const activePolicies = policies.filter(p => p.status === 'Active').length;

    // Renewals due in the next 30 days
    const renewalsDuePolicies = policies.filter(p => {
      if (p.status !== 'Active') return false;
      const expiry = new Date(p.expiryDate);
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    });
    const renewalsDueCount = renewalsDuePolicies.length;

    // 2. Birthday Reminders (matching MM-DD)
    const todayMMDD = today.toISOString().slice(5, 10); // "MM-DD"
    const birthdayClients = clients.filter(c => {
      if (!c.dob) return false;
      const dobMMDD = c.dob.slice(5, 10);
      return dobMMDD === todayMMDD;
    }).map(c => {
      const msg = `Happy Birthday ${c.name}! Wishing you a wonderful year ahead filled with happiness and success, from the team at TrustAssure. 🎂🎉`;
      const cleanPhone = c.phone.replace(/[^0-9]/g, '');
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
      
      return {
        clientId: c.id,
        name: c.name,
        dob: c.dob,
        phone: c.phone,
        email: c.email || '',
        avatar: c.avatar,
        whatsappUrl
      };
    });

    // 3. Policy Expiry Alerts (30, 15, 7 days)
    const expiryAlerts = policies.filter(p => {
      if (p.status !== 'Active') return false;
      const expiry = new Date(p.expiryDate);
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
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

module.exports = router;
