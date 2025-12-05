import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import pool from '../db.js';

dotenv.config();
const router = express.Router();

// API Routes
const menuRoutes = require('./routes/menu-routes');
const userRoutes = require('./routes/user-routes');
const cartRoutes = require('./routes/cart-routes');
const orderRoutes = require('./routes/order-routes');

router.use('/api/menu', menuRoutes);
router.use('/api/user', userRoutes);
router.use('/api/cart', cartRoutes);
router.use('/api/orders', orderRoutes);

// Secure Geocoding Endpoint
router.get('/api/geocode', async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }
  try {
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
    const geoData = await geoRes.json();
    const address = geoData.status === "OK" && geoData.results.length
      ? geoData.results[0].formatted_address
      : "Unknown Address";
    res.json({ address });
  } catch (err) {
    console.error('Geocoding error:', err);
    res.status(500).json({ error: 'Failed to retrieve address' });
  }
});

// Clear Cart Endpoint
router.delete('/api/cart/:username/clear', async (req, res) => {
  const { username } = req.params;
  try {
    await pool.query('DELETE FROM cart WHERE username=$1', [username]);
    res.json({ message: 'Cart cleared successfully!' });
  } catch (err) {
    console.error('Error clearing cart:', err.message);
    res.status(500).json({ error: 'Server error clearing cart' });
  }
});

export default router;