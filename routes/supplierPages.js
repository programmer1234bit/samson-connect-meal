import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- Supplier Pages ----------------

// Supplier Dashboard
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/meals_supplier/sup-dashboard.html'));
});

// Supplier Profile
router.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/meals_supplier/sup-profile.html'));
});

// Supplier Stats
router.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/meals_supplier/sup-stats.html'));
});

// Optional: Logout redirects to signup/login page
router.get('/logout', (req, res) => {
  res.redirect('/sign up.html'); // make sure the path matches your public folder
});

export default router;
