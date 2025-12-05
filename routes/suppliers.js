import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.post('/find-by-meals', async (req, res) => {
    const { meal_ids } = req.body;

    if (!meal_ids || !Array.isArray(meal_ids) || meal_ids.length === 0) {
        return res.status(400).json({ error: 'Missing meal IDs in request body' });
    }

    try {
        const query = `
            SELECT DISTINCT
                u.id AS supplier_id,
                u.restaurant_name, -- ⚠️ New: Fetch the restaurant_name
                u.phone,
                u.location,
                u.eta_min,
                u.eta_max
            FROM users u
            JOIN meals m ON u.id = m.supplier_id
            WHERE u.role = 'meal_supplier' -- ⚠️ Note: Make sure the role matches your DB entry
            AND m.id = ANY($1::int[])
        `;
        const result = await pool.query(query, [meal_ids]);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching suppliers:', err);
        res.status(500).json({ error: 'Server error fetching meal suppliers' });
    }
});

export default router;