const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const { sendMailNotification } = require('./utils/mailer');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists locally
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Seed dummy PDF documents locally for testing
const dummyFiles = ['policy_schedule_p1.pdf', 'aadhaar_c1.pdf', 'pan_c1.pdf'];
dummyFiles.forEach(fileName => {
  const filePath = path.join(UPLOADS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    const dummyPdfContent = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 50 >>\nstream\nBT\n/F1 12 Tf\n70 700 Td\n(TrustAssure Dummy Seeded Document) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000222 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n323\n%%EOF\n`;
    fs.writeFileSync(filePath, dummyPdfContent);
  }
});

// MongoDB Atlas Configuration
const uri = "mongodb+srv://jimitkaklotar786_db_user:n89oW7QRHwWEDcPx@cluster0.o5uo0nt.mongodb.net/?retryWrites=true&w=majority";
const mongoClient = new MongoClient(uri);
const DB_NAME = "trustassure";

// In-Memory cache of tables
const dbCache = {
  users: [],
  clients: [],
  policies: [],
  documents: [],
  tasks: [],
  activities: [],
  vault: [],
  dismissedAlerts: [],
  generatedAlerts: []
};

let dbConnection = null;
let isConnected = false;

// Async function to connect to MongoDB Atlas and preload all tables
const connectDB = async () => {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoClient.connect();
    dbConnection = mongoClient.db(DB_NAME);
    isConnected = true;
    console.log("mongodb connected");

    // Preload all tables from cloud database
    const tables = Object.keys(dbCache);
    for (const table of tables) {
      const collection = dbConnection.collection(table);
      const data = await collection.find({}).toArray();
      dbCache[table] = data;
      console.log(`Preloaded table '${table}': ${data.length} records`);
    }

    // Force update clients and policies seed if old seeds exist or schemas are outdated
    if (
      dbCache.clients.some(c => c.id === 'c4' || c.id === 'c5' || c.id === 'c1' || c.id === 'c2') ||
      dbCache.policies.some(p => !p.issueDate || p.clientId === 'c1' || p.clientId === 'c2')
    ) {
      console.log("[Seeder] Old seed data or outdated schema detected. Wiping clients and policies collections...");
      await dbConnection.collection('clients').deleteMany({});
      await dbConnection.collection('policies').deleteMany({});
      dbCache.clients = [];
      dbCache.policies = [];
    }

    // Seed default records if collections are empty
    await seedDatabase();

    // Start background daily email notification scheduler
    startDailyAlertScheduler();
  } catch (error) {
    console.error("Failed to connect to MongoDB Atlas:", error);
    throw error;
  }
};

const readTable = (table) => {
  return dbCache[table] || [];
};

const writeTable = (table, data) => {
  // Update memory cache synchronously
  dbCache[table] = data;

  // Asynchronously update MongoDB in background
  if (isConnected && dbConnection) {
    const collection = dbConnection.collection(table);
    // Replace all documents in collection with the new data array
    collection.deleteMany({})
      .then(() => {
        if (data.length > 0) {
          // Remove _id from objects to prevent insertion/duplicate-key conflicts
          const cleanData = data.map(item => {
            const copy = { ...item };
            delete copy._id;
            return copy;
          });
          return collection.insertMany(cleanData);
        }
      })
      .then(() => {
        console.log(`Successfully synced table '${table}' to MongoDB`);
      })
      .catch(error => {
        console.error(`Error syncing table '${table}' to MongoDB:`, error);
      });
  } else {
    console.warn(`MongoDB not connected. Changes to '${table}' are kept in memory only.`);
  }
  return true;
};

// Seed initial database state if empty
const seedDatabase = async () => {
  // 1. Users
  if (dbCache.users.length === 0 || !dbCache.users.some(u => u.email === 'maheshnandwani13@gmail.com')) {
    console.log("Seeding users...");
    const defaultPassword = await bcrypt.hash('admin123', 10);
    const maheshPassword = await bcrypt.hash('Preet@13', 10);
    const currentUsers = [...dbCache.users];
    
    if (!currentUsers.some(u => u.username === 'admin')) {
      currentUsers.push({
        id: '1',
        username: 'admin',
        email: 'admin@trustassure.com',
        password: defaultPassword,
        name: 'John Doe',
        role: 'Senior Broker',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      });
    }
    if (!currentUsers.some(u => u.username === 'alex')) {
      currentUsers.push({
        id: '2',
        username: 'alex',
        email: 'alex@trustassure.com',
        password: defaultPassword,
        name: 'Alex Sterling',
        role: 'Senior Broker',
        avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      });
    }
    
    const existingMahesh = currentUsers.find(u => u.email === 'maheshnandwani13@gmail.com');
    if (!existingMahesh) {
      currentUsers.push({
        id: '3',
        username: 'mahesh',
        email: 'maheshnandwani13@gmail.com',
        password: maheshPassword,
        name: 'Mahesh Nandwani',
        role: 'Senior Broker',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      });
    } else {
      existingMahesh.password = maheshPassword;
      existingMahesh.name = 'Mahesh Nandwani';
      existingMahesh.username = 'mahesh';
    }
    await writeTable('users', currentUsers);
  }

  // 2. Clients
  if (dbCache.clients.length === 0) {
    console.log("Seeding clients...");
    const today = new Date();
    const formattedTodayDob = `${today.getFullYear() - 40}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const initialClients = [
      {
        id: 'cli-78101',
        name: 'Arjun Mehta',
        email: 'arjun.mehta@email.com',
        phone: '+91 99887 76655',
        dob: '1993-08-12',
        activePoliciesCount: 1,
        status: 'Active',
        followUpDate: 'Call tomorrow morning',
        followUps: ['Call tomorrow morning', 'Send health insurance quotes'],
        notes: 'Interested in family floater plans. Budget around 15k-20k INR annually.',
        productName: 'HDFC Ergo Optima Restore',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cli-78102',
        name: 'Priya Sharma',
        email: 'priya.sharma@email.com',
        phone: '+91 98223 34455',
        dob: '1995-12-05',
        activePoliciesCount: 0,
        status: 'Active',
        followUpDate: 'Follow up next Monday',
        followUps: ['Follow up next Monday', 'Compare with Tata AIA plan'],
        notes: 'Wants critical illness cover rider. Has pre-existing thyroid issue.',
        productName: 'LIC Jeevan Anand',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cli-78103',
        name: 'Vikram Singh',
        email: 'vikram.singh@email.com',
        phone: '+91 91122 33445',
        dob: '1988-04-20',
        activePoliciesCount: 2,
        status: 'Active',
        followUpDate: 'Send email on Friday',
        followUps: ['Send email on Friday'],
        notes: 'Car insurance renewal due. Looking for zero-depreciation add-on.',
        productName: 'Tata AIG Auto Secure',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        createdAt: new Date().toISOString()
      }
    ];
    await writeTable('clients', initialClients);
  }

  // 3. Policies
  if (dbCache.policies.length === 0) {
    console.log("Seeding policies...");
    const today = new Date();
    
    // Helper to add days
    const addDays = (date, days) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result.toISOString().split('T')[0];
    };

    const initialPolicies = [
      {
        id: 'p1',
        policyNumber: 'POL-987654321',
        clientName: 'Arjun Mehta',
        clientId: 'cli-78101',
        type: 'Life',
        subType: 'Term Plan',
        company: 'LIC',
        premiumAmount: 0,
        sumAssured: 0,
        issueDate: '2021-10-15',
        expiryDate: '',
        status: 'Active',
        description: 'Term Life insurance policy with premium rate protection.',
        code: 'L-TERM-01',
        kycVerified: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'p2',
        policyNumber: 'POL-112233445',
        clientName: 'Priya Sharma',
        clientId: 'cli-78102',
        type: 'Mediclaim',
        subType: 'Mediclaim',
        company: 'Tata AIG',
        premiumAmount: 0,
        sumAssured: 0,
        issueDate: '2025-10-15',
        expiryDate: addDays(today, 15),
        status: 'Active',
        description: 'Comprehensive mediclaim cover for family members.',
        code: 'M-MED-02',
        kycVerified: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'p3',
        policyNumber: 'POL-921099887',
        clientName: 'Vikram Singh',
        clientId: 'cli-78103',
        type: 'General',
        subType: 'Car Insurance',
        company: 'HDFC Ergo',
        premiumAmount: 0,
        sumAssured: 0,
        issueDate: '2025-10-15',
        expiryDate: addDays(today, 7),
        status: 'Active',
        description: 'Comprehensive Auto Insurance with collision and third-party liability cover.',
        vehicleNumber: 'MH-12-PQ-9999',
        code: 'V-CAR-99',
        kycVerified: true,
        createdAt: new Date().toISOString()
      }
    ];
    await writeTable('policies', initialPolicies);
  }

  // 4. Documents Vault
  if (dbCache.documents.length === 0) {
    console.log("Seeding documents...");
    const initialDocuments = [
      {
        id: 'd1',
        policyId: 'p1',
        clientId: 'c1',
        documentName: 'Policy Schedule PDF',
        documentType: 'Policy Schedule',
        filePath: 'uploads/policy_schedule_p1.pdf',
        fileSize: '2.4 MB',
        uploadedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      },
      {
        id: 'd2',
        policyId: 'p1',
        clientId: 'c1',
        documentName: 'Aadhaar Card',
        documentType: 'Aadhaar',
        filePath: 'uploads/aadhaar_c1.pdf',
        fileSize: '850 KB',
        uploadedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      },
      {
        id: 'd3',
        policyId: 'p1',
        clientId: 'c1',
        documentName: 'PAN Card Copy',
        documentType: 'PAN',
        filePath: 'uploads/pan_c1.pdf',
        fileSize: '1.1 MB',
        uploadedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      }
    ];
    await writeTable('documents', initialDocuments);
  }

  // 5. Tasks
  if (dbCache.tasks.length === 0) {
    console.log("Seeding tasks...");
    const initialTasks = [
      {
        id: 't1',
        title: 'Call Sarah Jenkins regarding claim #9921',
        dueDate: new Date().toISOString().split('T')[0],
        status: 'To Do',
        priority: 'High',
        createdAt: new Date().toISOString()
      },
      {
        id: 't2',
        title: 'Review Patel Family renewal term options',
        dueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
        status: 'In Progress',
        priority: 'Medium',
        createdAt: new Date().toISOString()
      },
      {
        id: 't3',
        title: 'Submit Aadhaar KYC for Carol Davis policy',
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
        status: 'To Do',
        priority: 'High',
        createdAt: new Date().toISOString()
      },
      {
        id: 't4',
        title: 'Archived: Follow up with David Miller payment failure',
        dueDate: new Date().toISOString().split('T')[0],
        status: 'Completed',
        priority: 'Low',
        createdAt: new Date().toISOString()
      }
    ];
    await writeTable('tasks', initialTasks);
  }

  // 6. Activities
  if (dbCache.activities.length === 0) {
    console.log("Seeding activities...");
    const initialActivities = [
      {
        id: 'a1',
        logText: 'Call logged with Sarah Jenkins regarding claim #9921',
        timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        type: 'info'
      },
      {
        id: 'a2',
        logText: "Policy Approved: Michael Chen's Auto Insurance",
        timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        type: 'success'
      },
      {
        id: 'a3',
        logText: 'Email sent: Renewal notice for Gupta Logistics',
        timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        type: 'success'
      },
      {
        id: 'a4',
        logText: 'New Client added: Amanda West',
        timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        type: 'info'
      },
      {
        id: 'a5',
        logText: 'Payment failed: Policy #CH-2210 (David Miller)',
        timestamp: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
        type: 'danger'
      }
    ];
    await writeTable('activities', initialActivities);
  }
};

const runDailyNotificationCheck = async () => {
  try {
    if (!dbConnection) return;
    console.log("[Scheduler] Running daily alert notification checks...");

    const clients = await dbConnection.collection('clients').find({}).toArray();
    const policies = await dbConnection.collection('policies').find({}).toArray();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMMDD = today.toISOString().slice(5, 10); // "MM-DD"
    const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Prevent duplicate notification emails in the same day
    const metadataCol = dbConnection.collection('metadata');
    const trackingDoc = await metadataCol.findOne({ key: 'last_daily_notification_date' });
    if (trackingDoc && trackingDoc.value === todayStr) {
      console.log(`[Scheduler] Daily digest email has already been sent for today (${todayStr}). Skipping.`);
      return;
    }

    // 1. Birthdays today (checks both client.dob and policy.dob)
    const birthdayClients = clients.filter(c => {
      if (c.dob) {
        const dobMMDD = c.dob.slice(5, 10);
        if (dobMMDD === todayMMDD) return true;
      }
      const clientPolicies = policies.filter(p => p.clientId === c.id);
      return clientPolicies.some(p => {
        if (!p.dob) return false;
        const dobMMDD = p.dob.slice(5, 10);
        return dobMMDD === todayMMDD;
      });
    });

    // 2. Policies expiring in exactly 30, 15, or 7 days
    const expiringPolicies = policies.filter(p => {
      if (p.status !== 'Active') return false;
      const expiry = new Date(p.expiryDate);
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays === 30 || diffDays === 15 || diffDays === 7;
    }).map(p => {
      const expiry = new Date(p.expiryDate);
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { ...p, daysLeft: diffDays };
    });

    // If no birthdays and no expiries, log and write trackingDoc to skip sending blank email
    if (birthdayClients.length === 0 && expiringPolicies.length === 0) {
      console.log("[Scheduler] No daily alerts (birthdays or expiries) found for today.");
      await metadataCol.updateOne(
        { key: 'last_daily_notification_date' },
        { $set: { value: todayStr } },
        { upsert: true }
      );
      return;
    }

    // 3. Build stylized HTML content for email digest
    let htmlContent = `
      <p>Dear Mahesh,</p>
      <p>Here is your daily TrustAssure CRM automated notification summary for today, <strong>${today.toDateString()}</strong>:</p>
    `;

    if (birthdayClients.length > 0) {
      htmlContent += `
        <h3 style="color: #004DC0; border-bottom: 2px solid #004DC0; padding-bottom: 5px; margin-top: 25px;">🎂 Birthdays Today</h3>
        <p>The following clients are celebrating their birthday today. You can send them a warm greeting!</p>
        <ul style="padding-left: 20px; line-height: 1.8;">
      `;
      birthdayClients.forEach(c => {
        htmlContent += `
          <li>
            <strong>${c.name}</strong> 
            (Phone: <a href="tel:${c.phone}">${c.phone || 'N/A'}</a> | 
            Email: <a href="mailto:${c.email}">${c.email || 'N/A'}</a>)
          </li>
        `;
      });
      htmlContent += `</ul>`;
    }

    if (expiringPolicies.length > 0) {
      htmlContent += `
        <h3 style="color: #EF4444; border-bottom: 2px solid #EF4444; padding-bottom: 5px; margin-top: 25px;">⚠️ Upcoming Policy Expiries</h3>
        <p>The following active insurance policies are due for renewal soon:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <th style="padding: 10px 8px; text-align: left; font-size: 13px; font-weight: bold; color: #475569;">Policy Number</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 13px; font-weight: bold; color: #475569;">Client Name</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 13px; font-weight: bold; color: #475569;">Policy Type</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 13px; font-weight: bold; color: #475569;">Expiry Date</th>
              <th style="padding: 10px 8px; text-align: left; font-size: 13px; font-weight: bold; color: #475569;">Days Left</th>
            </tr>
          </thead>
          <tbody>
      `;
      expiringPolicies.forEach(p => {
        htmlContent += `
          <tr style="border-bottom: 1px solid #f1f5f9; font-size: 14px;">
            <td style="padding: 10px 8px; font-weight: bold; color: #004DC0;">${p.policyNumber}</td>
            <td style="padding: 10px 8px;">${p.clientName}</td>
            <td style="padding: 10px 8px;">${p.type}</td>
            <td style="padding: 10px 8px; color: #475569;">${p.expiryDate}</td>
            <td style="padding: 10px 8px; font-weight: bold; color: #EF4444;">${p.daysLeft} days left</td>
          </tr>
        `;
      });
      htmlContent += `
          </tbody>
        </table>
      `;
    }

    const subject = `TrustAssure CRM - Daily Dashboard Alerts (${todayStr})`;
    const success = await sendMailNotification("maheshnandwani13@gmail.com", subject, "Daily CRM Alerts Summary", htmlContent);
    
    if (success) {
      await metadataCol.updateOne(
        { key: 'last_daily_notification_date' },
        { $set: { value: todayStr } },
        { upsert: true }
      );
      console.log(`[Scheduler] Daily notification email dispatched successfully for ${todayStr}.`);
    }
  } catch (error) {
    console.error("[Scheduler] Daily notification check execution failed:", error);
  }
};

const startDailyAlertScheduler = () => {
  // Run once immediately on startup
  runDailyNotificationCheck();

  // Set interval to check every 12 hours
  setInterval(runDailyNotificationCheck, 12 * 60 * 60 * 1000);
};

const getDb = () => {
  if (!dbConnection) {
    throw new Error("Database not connected yet");
  }
  return dbConnection;
};

module.exports = {
  connectDB,
  getDb,
  readTable,
  writeTable,
  seedDatabase
};
