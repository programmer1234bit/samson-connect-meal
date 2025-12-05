import express from 'express';
import pool from '../db.js';
const router = express.Router();

// GET all meals for a supplier
router.get('/:supplierId', async (req, res) => {
    const { supplierId } = req.params;
    try {
        const result = await pool.query(
            "SELECT * FROM meals WHERE supplier_id=$1 ORDER BY created_at DESC",
            [supplierId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error ❌" });
    }
});

// ADD a meal
router.post('/', async (req, res) => {
    const { supplier_id, name, price, description } = req.body;
    try {
        await pool.query(
            "INSERT INTO meals (supplier_id, name, price, description) VALUES ($1,$2,$3,$4)",
            [supplier_id, name, price, description]
        );
        res.json({ message: "✅ Meal added" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error ❌" });
    }
});

// UPDATE a meal
router.put('/:mealId', async (req, res) => {
    const { mealId } = req.params;
    const { name, price, description } = req.body;
    try {
        await pool.query(
            "UPDATE meals SET name=$1, price=$2, description=$3 WHERE id=$4",
            [name, price, description, mealId]
        );
        res.json({ message: "✅ Meal updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error ❌" });
    }
});

// DELETE a meal
router.delete('/:mealId', async (req, res) => {
    const { mealId } = req.params;
    try {
        await pool.query(
            "DELETE FROM meals WHERE id=$1",
            [mealId]
        );
        res.json({ message: "✅ Meal deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error ❌" });
    }
});

export default router;
