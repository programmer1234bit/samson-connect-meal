import express from 'express';
import pool from '../db.js';
const router = express.Router();

/**
 * GET /api/supplier/profile/:supplierId
 * Fetch supplier profile by ID or username
 */
router.get('/:supplierId', async (req, res) => {
    const { supplierId } = req.params;

    if (!supplierId) {
        return res.status(400).json({ message: 'Supplier ID is required' });
    }

    try {
        console.log(`📝 Fetching profile for supplier ID: ${supplierId}`);

        // Try numeric ID first, then fallback to username
        let result = await pool.query(
            `SELECT 
                id, 
                username, 
                email, 
                phone, 
                first_name, 
                last_name,
                restaurant_name, 
                location, 
                service_radius_km,
                bank_account,
                latitude,
                longitude,
                profile_pic,
                role,
                created_at
            FROM users 
            WHERE id = $1::integer
            AND role IN ('meal_supplier', 'supplier')`,
            [supplierId]
        );

        // If not found by ID, try by username
        if (result.rows.length === 0) {
            console.log(`⚠️ Not found by ID, trying username: ${supplierId}`);
            result = await pool.query(
                `SELECT 
                    id, 
                    username, 
                    email, 
                    phone, 
                    first_name, 
                    last_name,
                    restaurant_name, 
                    location, 
                    service_radius_km,
                    bank_account,
                    latitude,
                    longitude,
                    profile_pic,
                    role,
                    created_at
                FROM users 
                WHERE username = $1
                AND role IN ('meal_supplier', 'supplier')`,
                [supplierId]
            );
        }

        if (result.rows.length === 0) {
            console.warn(`⚠️ Supplier ${supplierId} not found or not a supplier`);
            return res.status(404).json({ message: 'Supplier not found' });
        }

        const supplier = result.rows[0];
        console.log(`✅ Profile found for supplier:`, supplier.username);

        res.json({
            id: supplier.id,
            username: supplier.username,
            email: supplier.email,
            phone: supplier.phone,
            first_name: supplier.first_name,
            last_name: supplier.last_name,
            restaurant_name: supplier.restaurant_name,
            location: supplier.location,
            service_radius_km: supplier.service_radius_km,
            bank_account: supplier.bank_account,
            latitude: supplier.latitude,
            longitude: supplier.longitude,
            profile_pic: supplier.profile_pic,
            role: supplier.role,
            created_at: supplier.created_at
        });

    } catch (err) {
        console.error('❌ Error fetching supplier profile:', err.message);
        res.status(500).json({ message: 'Error fetching supplier profile', error: err.message });
    }
});

/**
 * PUT /api/supplier/profile/:supplierId
 * Update supplier profile
 */
router.put('/:supplierId', async (req, res) => {
    const { supplierId } = req.params;
    const { 
        restaurant_name, 
        location, 
        service_radius_km, 
        bank_account,
        latitude,
        longitude
    } = req.body;

    if (!supplierId) {
        return res.status(400).json({ message: 'Supplier ID is required' });
    }

    try {
        console.log(`⬆️ Updating profile for supplier ID: ${supplierId}`);

        // Try updating by numeric ID first
        let result = await pool.query(
            `UPDATE users 
            SET 
                restaurant_name = COALESCE($1, restaurant_name),
                location = COALESCE($2, location),
                service_radius_km = COALESCE($3, service_radius_km),
                bank_account = COALESCE($4, bank_account),
                latitude = COALESCE($5, latitude),
                longitude = COALESCE($6, longitude),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7::integer
            AND role IN ('meal_supplier', 'supplier')
            RETURNING id, username, restaurant_name, location, service_radius_km, bank_account, latitude, longitude`,
            [restaurant_name, location, service_radius_km, bank_account, latitude, longitude, supplierId]
        );

        // If no rows updated, try by username
        if (result.rowCount === 0) {
            console.log(`⚠️ Not updated by ID, trying username: ${supplierId}`);
            result = await pool.query(
                `UPDATE users 
                SET 
                    restaurant_name = COALESCE($1, restaurant_name),
                    location = COALESCE($2, location),
                    service_radius_km = COALESCE($3, service_radius_km),
                    bank_account = COALESCE($4, bank_account),
                    latitude = COALESCE($5, latitude),
                    longitude = COALESCE($6, longitude),
                    updated_at = CURRENT_TIMESTAMP
                WHERE username = $7
                AND role IN ('meal_supplier', 'supplier')
                RETURNING id, username, restaurant_name, location, service_radius_km, bank_account, latitude, longitude`,
                [restaurant_name, location, service_radius_km, bank_account, latitude, longitude, supplierId]
            );
        }

        if (result.rowCount === 0) {
            console.warn(`⚠️ Supplier ${supplierId} not found or unauthorized`);
            return res.status(404).json({ message: 'Supplier not found or unauthorized' });
        }

        const updated = result.rows[0];
        console.log(`✅ Profile updated for supplier:`, updated.username);

        res.json({
            message: 'Profile updated successfully',
            profile: {
                id: updated.id,
                username: updated.username,
                restaurant_name: updated.restaurant_name,
                location: updated.location,
                service_radius_km: updated.service_radius_km,
                bank_account: updated.bank_account,
                latitude: updated.latitude,
                longitude: updated.longitude
            }
        });

    } catch (err) {
        console.error('❌ Error updating supplier profile:', err.message);
        res.status(500).json({ message: 'Error updating supplier profile', error: err.message });
    }
});

export default router;