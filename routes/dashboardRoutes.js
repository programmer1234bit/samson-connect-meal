// routes/dashboard.js
import express from 'express';
import pool from '../db.js'; // Your PostgreSQL connection

const router = express.Router();

// GET /api/dashboard/overview
router.get('/overview', async (req, res) => {
    try {
        // Use COALESCE to ensure 0 if table empty
        const queries = {
            totalUsers: "SELECT COUNT(*)::int AS count FROM users",
            totalOrders: "SELECT COUNT(*)::int AS count FROM cart",
            totalRevenue: "SELECT COALESCE(SUM(price * quantity), 0)::float AS total FROM cart WHERE status ILIKE 'completed'",
            totalMeals: "SELECT COUNT(*)::int AS count FROM menu"
        };

        // Run all queries in parallel
        const [usersResult, ordersResult, revenueResult, mealsResult] = await Promise.all([
            pool.query(queries.totalUsers),
            pool.query(queries.totalOrders),
            pool.query(queries.totalRevenue),
            pool.query(queries.totalMeals)
        ]);

        // Send clean JSON response
        res.json({
            totalUsers: usersResult.rows[0].count,
            totalOrders: ordersResult.rows[0].count,
            totalRevenue: revenueResult.rows[0].total,
            totalMeals: mealsResult.rows[0].count
        });
    } catch (err) {
        console.error('❌ Failed to fetch dashboard data:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

export default router;
