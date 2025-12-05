import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cron from 'node-cron';
import pool from './db.js';

// --- Import Routes ---
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import cartRoutes from './routes/cart.js';
import userRouter from './routes/user.js';
import contactRouter from './routes/contact.js';
import adminRoutes from './routes/admin.js';
import userRoutes, { purgeInactiveUsers } from './routes/users.js';
import orderRoutes from './routes/orders.js';
import adminMenuRoutes from './routes/adminMenu.js';
import analyticsRouter from "./routes/analytics.js";
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import supplierRoutes from './routes/suppliers.js';
import finalCheckout from "./routes/finalCheckout.js";

// Supplier-related APIS and Pages
import supplierPages from './routes/supplierPages.js';
import supProfileAPI from './routes/supProfileAPI.js';
import supOrdersAPI from './routes/supOrdersAPI.js';
import supMealsAPI from './routes/supMealsAPI.js';
import configRouter from "./routes/config.js";

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- Middleware ----------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// ---------------- API Routes ----------------
// Main Auth
app.use("/api/auth", authRoutes); 

// Core Routes
app.use("/api/menu", menuRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/user", userRouter);
app.use("/api/users", userRoutes);
app.use("/api/contact", contactRouter);
app.use("/api/orders", orderRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/checkout", finalCheckout);
app.use("/api/config", configRouter);

// Admin Routes
app.use("/api/admin/menu", adminMenuRoutes);
app.use("/api/admin", adminRoutes); // Assuming this is for general admin APIs
app.use("/api/analytics", analyticsRouter);
app.use("/api/settings", settingsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Supplier API Routes (Ensure these are clear and distinct)
app.use("/supplier", supplierPages); // For rendering the HTML pages
app.use("/api/supplier/profile", supProfileAPI);
app.use("/api/supplier/orders", supOrdersAPI);
app.use("/api/supplier/meals", supMealsAPI);

// ✅ CRITICAL: Mount orders router at /api/sup/orders
app.use("/api/sup/orders", orderRoutes); // This makes /api/sup/orders work

// Add a simple logout endpoint so client pages (e.g. supplier profile) can destroy sessions
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ message: 'Failed to logout' });
    }
    // clear the session cookie on client
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// ---------------- Public (Static Files) ----------------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/supplier', express.static(path.join(__dirname, 'public', 'meals_supplier')));

// ---------------- Authentication/Authorization Functions ----------------

function isAuthenticated(req, res, next) {
  // Simple check for session existence (should be updated to check role/ID)
  if (req.session && (req.session.userId || req.session.isAdmin)) return next();
  res.redirect("/admin-login.html");
}

/* // Example logout endpoint (needs to be defined in a router if you want to use POST/API)
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out successfully" }));
});
*/

// ---------------- Cron Jobs ----------------
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await pool.query(
      "DELETE FROM contact_messages WHERE read = TRUE AND read_at < NOW() - INTERVAL '30 days'"
    );
    console.log(`🧹️ Auto-deleted ${result.rowCount} old read messages`);
  } catch (err) {
    console.error('Error during auto-cleanup of messages:', err);
  }

  try {
    await purgeInactiveUsers();
  } catch (err) {
    console.error('Error during auto-purge of inactive users:', err);
  }
});

// ---------------- 404 & Error Handling ----------------
// Catch-all for routes not found
app.use((req, res) => res.status(404).json({ message: 'Route not found ❌' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server error ❌' });
});

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));