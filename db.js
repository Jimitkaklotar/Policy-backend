const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

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
  activities: []
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
    console.log("Successfully connected to MongoDB Atlas!");

    // Preload all tables from cloud database
    const tables = Object.keys(dbCache);
    for (const table of tables) {
      const collection = dbConnection.collection(table);
      const data = await collection.find({}).toArray();
      dbCache[table] = data;
      console.log(`Preloaded table '${table}': ${data.length} records`);
    }

    // Seed default records if collections are empty
    await seedDatabase();
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
  if (dbCache.users.length === 0 || !dbCache.users.some(u => u.email === 'jimitkaklotar786@gmail.com')) {
    console.log("Seeding users...");
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const currentUsers = [...dbCache.users];
    
    if (!currentUsers.some(u => u.username === 'admin')) {
      currentUsers.push({
        id: '1',
        username: 'admin',
        email: 'admin@trustassure.com',
        password: hashedPassword,
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
        password: hashedPassword,
        name: 'Alex Sterling',
        role: 'Senior Broker',
        avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      });
    }
    if (!currentUsers.some(u => u.email === 'jimitkaklotar786@gmail.com')) {
      currentUsers.push({
        id: '3',
        username: 'jimit',
        email: 'jimitkaklotar786@gmail.com',
        password: hashedPassword,
        name: 'Jimit Kaklotar',
        role: 'Senior Broker',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      });
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
        id: 'c1',
        name: 'Rahul Sharma',
        email: 'rahul.s@example.com',
        phone: '+91 98765 43210',
        dob: formattedTodayDob, // Today!
        activePoliciesCount: 2,
        status: 'Active',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        createdAt: new Date().toISOString()
      },
      {
        id: 'c2',
        name: 'Patel Family',
        email: 'patel.family@example.com',
        phone: '+91 99887 76655',
        dob: '1978-11-12',
        activePoliciesCount: 1,
        status: 'Active',
        avatar: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        createdAt: new Date().toISOString()
      },
      {
        id: 'c3',
        name: 'Alice Smith',
        email: 'alice.smith@email.com',
        phone: '(555) 123-4567',
        dob: '1992-04-15',
        activePoliciesCount: 2,
        status: 'Active',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        createdAt: new Date().toISOString()
      },
      {
        id: 'c4',
        name: 'Bob Johnson',
        email: 'bjohnson_pro@gmail.com',
        phone: '(555) 987-6543',
        dob: '1985-08-22',
        activePoliciesCount: 0,
        status: 'Pending',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        createdAt: new Date().toISOString()
      },
      {
        id: 'c5',
        name: 'Carol Davis',
        email: 'c.davis@outlook.com',
        phone: '(555) 444-1122',
        dob: '1990-01-20',
        activePoliciesCount: 3,
        status: 'Active',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
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
        clientName: 'Rahul Sharma',
        clientId: 'c1',
        type: 'Life',
        premiumAmount: 24500,
        sumAssured: 15000000, // 1.5 Cr
        expiryDate: '2026-10-15', // far expiry
        status: 'Active',
        description: 'Policy coverage for major critical illnesses, permanent disability, and high-sum assurance tailored for high-net-worth individuals.',
        kycVerified: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'p2',
        policyNumber: 'POL-112233445',
        clientName: 'Patel Family',
        clientId: 'c2',
        type: 'Life',
        premiumAmount: 48000,
        sumAssured: 20000000, // 2 Cr
        expiryDate: addDays(today, 15), // Expiring in 15 days
        status: 'Active',
        description: 'Term Life insurance policy renewal with premium rate protection.',
        kycVerified: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'p3',
        policyNumber: 'POL-921099887',
        clientName: 'Alice Smith',
        clientId: 'c3',
        type: 'Auto',
        premiumAmount: 12500,
        sumAssured: 1500000,
        expiryDate: addDays(today, 7), // Expiring in 7 days (URGENT RENEWAL)
        status: 'Active',
        description: 'Comprehensive Auto Insurance with collision and third-party liability cover.',
        kycVerified: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'p4',
        policyNumber: 'POL-882044556',
        clientName: 'Carol Davis',
        clientId: 'c5',
        type: 'Health',
        premiumAmount: 32000,
        sumAssured: 10000000,
        expiryDate: addDays(today, 30), // Expiring in 30 days
        status: 'Active',
        description: 'Family Floater Health Insurance covering hospitalization and pre/post-natal care.',
        kycVerified: false,
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
