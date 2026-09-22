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

    const parseDateToMidnight = (dateStr) => {
      if (!dateStr) return null;
      if (typeof dateStr === 'string') {
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const y = parseInt(parts[2], 10);
            return new Date(y, m, d, 0, 0, 0, 0);
          }
        } else if (dateStr.includes('-')) {
          const clean = dateStr.split('T')[0];
          const parts = clean.split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            return new Date(y, m, d, 0, 0, 0, 0);
          }
        }
      }
      const dt = new Date(dateStr);
      if (isNaN(dt.getTime())) return null;
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    // 1. Stats Cards
    const totalClients = clients.length;
    const activePolicies = policies.filter(p => p.status === 'Active').length;

    // Renewals due (milestones: 15, 7, and 1 day before expiry, excluding Life & dismissed)
    const renewalsDuePolicies = policies.filter(p => {
      if (p.type === 'Life') return false;
      if (p.status !== 'Active') return false;
      if (!p.expiryDate) return false;

      const expiryDateObj = parseDateToMidnight(p.expiryDate);
      if (!expiryDateObj) return false;

      const diffTime = expiryDateObj.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      if (![15, 7, 1].includes(diffDays)) return false;

      const alertId = `p-${p.id}-${p.expiryDate}-${diffDays}`;
      return shouldShowAlert(alertId);
    });
    const renewalsDueCount = renewalsDuePolicies.length;

    const getDaysUntilBirthday = (dobStr) => {
      if (!dobStr) return null;
      let birthMonth = -1;
      let birthDay = -1;

      if (typeof dobStr === 'string') {
        if (dobStr.includes('/')) {
          const parts = dobStr.split('/');
          if (parts.length >= 2) {
            birthDay = parseInt(parts[0], 10);
            birthMonth = parseInt(parts[1], 10) - 1;
          }
        } else if (dobStr.includes('-')) {
          const clean = dobStr.split('T')[0];
          const parts = clean.split('-');
          if (parts.length === 3) {
            birthMonth = parseInt(parts[1], 10) - 1;
            birthDay = parseInt(parts[2], 10);
          } else if (parts.length === 2) {
            birthMonth = parseInt(parts[0], 10) - 1;
            birthDay = parseInt(parts[1], 10);
          }
        }
      }

      if (birthMonth < 0 || birthDay < 0 || isNaN(birthMonth) || isNaN(birthDay)) {
        const d = new Date(dobStr);
        if (isNaN(d.getTime())) return null;
        birthMonth = d.getMonth();
        birthDay = d.getDate();
      }

      const currentYear = today.getFullYear();
      let nextBirthday = new Date(currentYear, birthMonth, birthDay, 0, 0, 0, 0);

      if (nextBirthday < today) {
        nextBirthday = new Date(currentYear + 1, birthMonth, birthDay, 0, 0, 0, 0);
      }

      const diffTime = nextBirthday.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      return { diffDays, nextBirthdayYear: nextBirthday.getFullYear() };
    };

    // 2. Birthday Reminders (milestones: 5 days before, 1 day before, and today)
    const birthdayClients = clients.map(c => {
      if (!c.dob) return null;
      const bInfo = getDaysUntilBirthday(c.dob);
      if (!bInfo) return null;
      const { diffDays, nextBirthdayYear } = bInfo;

      if (![5, 1, 0].includes(diffDays)) return null;

      const alertId = `b-${c.id}-${nextBirthdayYear}-${diffDays}`;
      if (!shouldShowAlert(alertId)) return null;

      let msg = '';
      let label = '';
      if (diffDays === 0) {
        label = 'Birthday Today';
        msg = `Happy Birthday ${c.name}! Wishing you a wonderful day filled with happiness and a fantastic year ahead, from the team at TrustAssure. 🎂🎉`;
      } else if (diffDays === 1) {
        label = 'Birthday Tomorrow (1 day left)';
        msg = `Dear ${c.name}, wishing you an early Happy Birthday for tomorrow! May your year ahead be blessed with joy and good health. Best regards from TrustAssure. 🎂🎈`;
      } else {
        label = 'Upcoming Birthday (in 5 days)';
        msg = `Dear ${c.name}, team TrustAssure wishes you an advanced Happy Birthday! Looking forward to celebrating your special day in 5 days. 🎂✨`;
      }

      const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
      
      return {
        id: alertId,
        alertId,
        clientId: c.id,
        name: c.name,
        dob: c.dob,
        phone: c.phone,
        email: c.email || '',
        avatar: c.avatar,
        daysLeft: diffDays,
        label,
        whatsappUrl
      };
    }).filter(Boolean);

    birthdayClients.sort((a, b) => a.daysLeft - b.daysLeft);

    // 3. Policy Renewal Alerts (milestones: exactly 15 days, 7 days, and 1 day before expiry)
    const expiryAlerts = policies.filter(p => {
      if (p.type === 'Life') return false;
      if (p.status !== 'Active') return false;
      if (!p.expiryDate) return false;

      const expiryDateObj = parseDateToMidnight(p.expiryDate);
      if (!expiryDateObj) return false;

      const diffTime = expiryDateObj.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      if (![15, 7, 1].includes(diffDays)) return false;

      const alertId = `p-${p.id}-${p.expiryDate}-${diffDays}`;
      return shouldShowAlert(alertId);
    }).map(p => {
      const expiryDateObj = parseDateToMidnight(p.expiryDate);
      const diffTime = expiryDateObj.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const client = clients.find(c => c.id === p.clientId);
      const clientPhone = client ? client.phone : '';
      const clientEmail = client ? client.email : '';
      const cleanPhone = clientPhone.replace(/[^0-9]/g, '');

      let msg = '';
      if (diffDays === 1) {
        msg = `URGENT RENEWAL: Dear ${p.clientName}, your TrustAssure policy #${p.policyNumber} (${p.type} Insurance) expires TOMORROW (${p.expiryDate}). Please renew today to prevent break in policy coverage. Thank you!`;
      } else if (diffDays === 7) {
        msg = `Dear ${p.clientName}, important reminder: your TrustAssure policy #${p.policyNumber} (${p.type} Insurance) is expiring in 7 days on ${p.expiryDate}. Please reach out promptly to complete renewal. Thank you!`;
      } else {
        msg = `Dear ${p.clientName}, friendly reminder: your TrustAssure policy #${p.policyNumber} (${p.type} Insurance) is due for renewal on ${p.expiryDate} (15 days left). Please contact us to initiate renewal. Thank you!`;
      }

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

    // 4. Sales & Premium Analytics by Year, Month, and Policy Type
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yearlyMap = {};
    const yearsSet = new Set();
    const typesSet = new Set();
    const currentYear = today.getFullYear();
    yearsSet.add(currentYear);
    yearsSet.add(currentYear - 1);

    policies.forEach(p => {
      let pDate = null;
      if (p.issueDate) {
        pDate = new Date(p.issueDate);
      } else if (p.createdAt) {
        pDate = new Date(p.createdAt);
      }
      
      if (!pDate || isNaN(pDate.getTime())) {
        pDate = new Date();
      }

      const pYear = pDate.getFullYear();
      const pMonth = pDate.getMonth(); // 0 - 11
      const premium = Number(p.premiumAmount || 0);
      const pType = p.type || 'General';

      yearsSet.add(pYear);
      typesSet.add(pType);

      if (!yearlyMap[pYear]) {
        yearlyMap[pYear] = {
          year: pYear,
          totalRevenue: 0,
          totalPolicies: 0,
          monthly: Array.from({ length: 12 }, (_, i) => ({
            month: monthNames[i],
            monthIndex: i,
            revenue: 0,
            policies: 0,
            byType: {}
          })),
          byType: {}
        };
      }

      yearlyMap[pYear].totalRevenue += premium;
      yearlyMap[pYear].totalPolicies += 1;

      yearlyMap[pYear].monthly[pMonth].revenue += premium;
      yearlyMap[pYear].monthly[pMonth].policies += 1;

      if (!yearlyMap[pYear].byType[pType]) {
        yearlyMap[pYear].byType[pType] = { revenue: 0, count: 0 };
      }
      yearlyMap[pYear].byType[pType].revenue += premium;
      yearlyMap[pYear].byType[pType].count += 1;

      if (!yearlyMap[pYear].monthly[pMonth].byType[pType]) {
        yearlyMap[pYear].monthly[pMonth].byType[pType] = { revenue: 0, count: 0 };
      }
      yearlyMap[pYear].monthly[pMonth].byType[pType].revenue += premium;
      yearlyMap[pYear].monthly[pMonth].byType[pType].count += 1;
    });

    yearsSet.forEach(yr => {
      if (!yearlyMap[yr]) {
        yearlyMap[yr] = {
          year: yr,
          totalRevenue: 0,
          totalPolicies: 0,
          monthly: Array.from({ length: 12 }, (_, i) => ({
            month: monthNames[i],
            monthIndex: i,
            revenue: 0,
            policies: 0,
            byType: {}
          })),
          byType: {}
        };
      }
    });

    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
    const availableTypes = ['All', ...Array.from(typesSet)];

    // 5. Normalized policy records for granular multi-period comparisons
    const policyRecords = policies.map(p => {
      let dateStr = '';
      if (p.issueDate) {
        dateStr = String(p.issueDate).split('T')[0];
      } else if (p.createdAt) {
        dateStr = String(p.createdAt).split('T')[0];
      } else {
        dateStr = today.toISOString().split('T')[0];
      }

      return {
        id: p.id,
        policyNumber: p.policyNumber || '',
        clientName: p.clientName || 'General Policy Holder',
        type: p.type || 'General',
        subType: p.subType || '',
        company: p.company || '',
        date: dateStr,
        createdAt: p.createdAt || p.issueDate || '',
        premiumAmount: Number(p.premiumAmount || 0),
        status: p.status || 'Active'
      };
    });

    // 6. Recent Activities (limit to 10)
    const recentActivities = activities.slice(0, 10);

    res.json({
      stats: {
        totalClients,
        activePolicies,
        renewalsDue: renewalsDueCount
      },
      salesAnalytics: {
        availableYears,
        availableTypes,
        yearlyMap,
        policyRecords
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
