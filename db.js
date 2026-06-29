const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, 'database');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure database and uploads directories exist
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const getFilePath = (table) => path.join(DB_DIR, `${table}.json`);

const readTable = (table) => {
  const filePath = getFilePath(table);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error(`Error reading table ${table}:`, error);
    return [];
  }
};

const writeTable = (table, data) => {
  const filePath = getFilePath(table);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing table ${table}:`, error);
    return false;
  }
};

// Seed initial database state if empty
const seedDatabase = async () => {
  // 1. Users
  const usersFile = getFilePath('users');
  if (!fs.existsSync(usersFile) || readTable('users').length === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    writeTable('users', [
      {
        id: '1',
        username: 'admin',
        email: 'admin@trustassure.com',
        password: hashedPassword,
        name: 'John Doe',
        role: 'Senior Broker',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      },
      {
        id: '2',
        username: 'alex',
        email: 'alex@trustassure.com',
        password: hashedPassword,
        name: 'Alex Sterling',
        role: 'Senior Broker',
        avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
      }
    ]);
  }

  // 2. Clients
  const clientsFile = getFilePath('clients');
  if (!fs.existsSync(clientsFile) || readTable('clients').length === 0) {
    // We want some birthdays to be dynamic: today's date
    const today = new Date();
    const formattedTodayDob = `${today.getFullYear() - 40}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Rahul Sharma birthday today
    writeTable('clients', [
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
    ]);
  }

  // 3. Policies
  const policiesFile = getFilePath('policies');
  if (!fs.existsSync(policiesFile) || readTable('policies').length === 0) {
    const today = new Date();
    
    // Helper to add days
    const addDays = (date, days) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result.toISOString().split('T')[0];
    };

    writeTable('policies', [
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
    ]);
  }

  // 4. Documents Vault
  const documentsFile = getFilePath('documents');
  if (!fs.existsSync(documentsFile) || readTable('documents').length === 0) {
    writeTable('documents', [
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
    ]);
  }

  // 5. Tasks
  const tasksFile = getFilePath('tasks');
  if (!fs.existsSync(tasksFile) || readTable('tasks').length === 0) {
    writeTable('tasks', [
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
    ]);
  }

  // 6. Activities
  const activitiesFile = getFilePath('activities');
  if (!fs.existsSync(activitiesFile) || readTable('activities').length === 0) {
    writeTable('activities', [
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
    ]);
  }
};

// Seed on startup
seedDatabase().catch(console.error);

module.exports = {
  readTable,
  writeTable,
  seedDatabase
};
