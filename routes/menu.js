// routes/menu.js
import express from 'express';
import pool from '../db.js'; // make sure path is correct
const router = express.Router();

// GET /api/menu?category=street
router.get('/', async (req, res) => {
  try {
    const category = req.query.category || 'street';
    console.log('Requested category:', category);

    // Corrected query to match your DB columns
    const queryText = `
      SELECT id, name, price, image_url AS img, description, category
      FROM menu
      WHERE category = $1
      ORDER BY id ASC
    `;
    
    const result = await pool.query(queryText, [category]);
    console.log('Query rows:', result.rows);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No items found for this category' });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Menu route error:', err.stack);
    res.status(500).json({ error: 'Server Error' });
  }
});

export default router;
