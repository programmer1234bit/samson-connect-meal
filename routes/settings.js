import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET all settings
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT key_name, value FROM system_settings');
        const settings = {};
        result.rows.forEach(row => settings[row.key_name] = row.value); // ✅ use key_name
        res.json(settings);
    } catch (err) {
        console.error('❌ Error fetching settings:', err);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// PUT update a setting
router.put('/:key', async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    try {
        await pool.query(`
            INSERT INTO system_settings(key_name, value)  -- ✅ use key_name
            VALUES($1, $2)
            ON CONFLICT(key_name) DO UPDATE SET value = EXCLUDED.value
        `, [key, value]);
        res.json({ success: true, key, value });
    } catch (err) {
        console.error('❌ Error updating setting:', err);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

export default router;
