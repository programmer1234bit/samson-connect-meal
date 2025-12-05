import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET all menu items (for admin panel)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM menu ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch menu ❌' });
    }
});

// ADD new menu item
router.post('/', async (req, res) => {
    const { name, description, price, category, image_url } = req.body;
    if (!name || !price || !category) {
        return res.status(400).json({ error: 'Please provide name, price, and category ❌' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO menu (name, description, price, category, image_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [name, description || '', price, category, image_url || '']
        );
        res.json({ message: 'Menu item added ✅', item: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add menu item ❌' });
    }
});

// UPDATE menu item
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, price, category, image_url } = req.body;

    try {
        const result = await pool.query(
            'UPDATE menu SET name=$1, description=$2, price=$3, category=$4, image_url=$5 WHERE id=$6 RETURNING *',
            [name, description, price, category, image_url, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Menu item not found ❌' });
        res.json({ message: 'Menu item updated ✅', item: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update menu item ❌' });
    }
});

// DELETE menu item
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM menu WHERE id=$1 RETURNING *', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Menu item not found ❌' });
        res.json({ message: 'Menu item deleted ✅' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete menu item ❌' });
    }
});

export default router;
