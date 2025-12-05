import express from 'express';
import pool from '../db.js';

const router = express.Router();

// ⭐️ GET Supplier Profile - Flexible role checking
router.get('/:id', async (req, res) => {
    const supplierId = req.params.id;

    // Validate that ID is a number
    if (!supplierId || isNaN(supplierId)) {
        return res.status(400).json({ message: 'Invalid supplier ID ❌' });
    }

    try {
        // ⭐️ UPDATED: First check if user exists at all
        const userCheck = await pool.query(
            'SELECT id, role FROM users WHERE id = $1',
            [supplierId]
        );

        if (userCheck.rows.length === 0) {
            console.error(`User ID ${supplierId} not found in database`);
            return res.status(404).json({ message: 'User not found in database ❌' });
        }

        const user = userCheck.rows[0];
        console.log(`User ${supplierId} found with role: ${user.role}`);

        // Check if user is a supplier (flexible role matching)
        if (user.role !== 'meal_supplier' && user.role !== 'supplier') {
            console.error(`User ${supplierId} is not a supplier. Role: ${user.role}`);
            return res.status(403).json({ message: 'User is not a supplier ❌' });
        }

        // ⭐️ Now fetch the full profile
        const query = `
            SELECT 
                id, first_name, last_name, email, phone, profile_pic,
                restaurant_name, bank_account, location, 
                latitude, longitude, service_radius_km
            FROM users
            WHERE id = $1
        `;
        const { rows } = await pool.query(query, [supplierId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Supplier profile not found ❌' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching supplier profile:', err);
        res.status(500).json({ message: `Server error: ${err.message} ❌` });
    }
});

// ⭐️ UPDATE Supplier Profile - Flexible role checking
router.put('/:id', async (req, res) => {
    const supplierId = req.params.id;
    const { 
        restaurant_name, 
        bank_account, 
        location, 
        latitude, 
        longitude, 
        service_radius_km 
    } = req.body;

    // Validate that ID is a number
    if (!supplierId || isNaN(supplierId)) {
        return res.status(400).json({ message: 'Invalid supplier ID ❌' });
    }

    // Validate required fields for supplier profile
    if (!restaurant_name || !bank_account || !location || !service_radius_km) {
        return res.status(400).json({ message: 'Restaurant name, bank account, location, and service radius are required ❌' });
    }

    try {
        // ⭐️ Check user exists and is a supplier
        const userCheck = await pool.query(
            'SELECT id, role FROM users WHERE id = $1',
            [supplierId]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'User not found ❌' });
        }

        const user = userCheck.rows[0];
        if (user.role !== 'meal_supplier' && user.role !== 'supplier') {
            return res.status(403).json({ message: 'User is not a supplier ❌' });
        }

        // ⭐️ Update the profile
        const updateQuery = `
            UPDATE users
            SET restaurant_name = $1,
                bank_account = $2,
                location = $3,
                latitude = $4,
                longitude = $5,
                service_radius_km = $6,
                updated_at = NOW(),
                last_active = NOW()
            WHERE id = $7
            RETURNING id, first_name, last_name, email, phone, restaurant_name, 
                      bank_account, location, latitude, longitude, service_radius_km
        `;
        const { rows } = await pool.query(
            updateQuery, 
            [restaurant_name, bank_account, location, latitude, longitude, service_radius_km, supplierId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Failed to update profile ❌' });
        }

        res.json({ message: 'Profile updated ✅', supplier: rows[0] });
    } catch (err) {
        console.error('Error updating supplier profile:', err);
        res.status(500).json({ message: `Server error: ${err.message} ❌` });
    }
});

export default router;