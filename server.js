const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./db');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const clientRoutes = require('./routes/clients');
const policyRoutes = require('./routes/policies');
const taskRoutes = require('./routes/tasks');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend Vite port 5173
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API Log] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes mapping
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/tasks', taskRoutes);

// Root endpoint welcome landing page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TrustAssure Backend API</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #f8fafc;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 20px;
          box-sizing: border-box;
        }
        .card {
          background-color: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 40px;
          max-width: 550px;
          width: 100%;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
        }
        .icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        h1 {
          font-size: 26px;
          font-weight: 700;
          margin: 0 0 10px 0;
          color: #ffffff;
        }
        p {
          color: #94a3b8;
          font-size: 14px;
          margin: 0 0 25px 0;
          line-height: 1.6;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: rgba(16, 185, 129, 0.1);
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.2);
          padding: 6px 16px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 30px;
        }
        .dot {
          width: 8px;
          height: 8px;
          background-color: #34d399;
          border-radius: 50%;
          box-shadow: 0 0 10px #34d399;
        }
        .endpoints {
          text-align: left;
          background-color: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 20px;
        }
        .endpoints h3 {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #64748b;
          margin: 0 0 12px 0;
        }
        .endpoint-item {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .endpoint-item:last-child {
          border-bottom: none;
        }
        .method {
          font-weight: 700;
          color: #38bdf8;
        }
        .path {
          font-family: monospace;
          color: #cbd5e1;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">🚀</div>
        <h1>Welcome to TrustAssure API</h1>
        <p>The backend server for TrustAssure Insurance Broker Portal is up, connected to MongoDB Atlas, and fully operational.</p>
        
        <div class="status-pill">
          <span class="dot"></span>
          <span>System Online & Healthy</span>
        </div>

        <div class="endpoints">
          <h3>Active API Endpoints</h3>
          <div class="endpoint-item">
            <span class="method">POST</span>
            <span class="path">/api/auth/login</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/api/clients</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/api/policies</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <span class="path">/api/dashboard/summary</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Error Handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// Run server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  🚀 WELCOME TO TRUSTASSURE BROKER PORTAL BACKEND 🚀  `);
      console.log(`======================================================`);
      console.log(`  Status: Server initialized and ready!`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`  Database: MongoDB Atlas Connected`);
      console.log(`  Automated Scheduler: Active (Daily Digests)`);
      console.log(`======================================================\n`);
    });
  } catch (error) {
    console.error('Failed to start TrustAssure server:', error);
  }
};

startServer();
