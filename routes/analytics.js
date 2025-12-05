import express from "express";
import pool from "../db.js"; // PostgreSQL pool

const router = express.Router();

/**
 * GET Analytics Overview
 * - Total Users
 * - Total Suppliers
 * - Total Orders
 * - Total Revenue
 */
router.get("/overview", async (req, res) => {
  try {
    const users = await pool.query("SELECT COUNT(*) FROM users");
    const suppliers = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'meal_supplier'");
    const orders = await pool.query("SELECT COUNT(*) FROM cart");
    const revenue = await pool.query("SELECT COALESCE(SUM(price * quantity),0) FROM cart WHERE status='Completed'");

    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalSuppliers: parseInt(suppliers.rows[0].count),
      totalOrders: parseInt(orders.rows[0].count),
      totalRevenue: parseInt(revenue.rows[0].coalesce)
    });
  } catch (err) {
    console.error("❌ Error fetching overview:", err);
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

/**
 * GET Meal Status (Available vs Unavailable)
 */
router.get("/meal-status", async (req, res) => {
  try {
    const available = await pool.query("SELECT COUNT(*) FROM menu WHERE status='Available'");
    const unavailable = await pool.query("SELECT COUNT(*) FROM menu WHERE status='Unavailable'");

    res.json({
      available: parseInt(available.rows[0].count),
      unavailable: parseInt(unavailable.rows[0].count)
    });
  } catch (err) {
    console.error("❌ Error fetching meal status:", err);
    res.status(500).json({ error: "Failed to fetch meal status" });
  }
});

/**
 * GET Top Suppliers (based on number of meals supplied)
 */
router.get("/top-suppliers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.username AS supplier, COUNT(m.id) AS total_meals
      FROM users u
      JOIN menu m ON u.id = m.supplier_id
      GROUP BY u.username
      ORDER BY total_meals DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching top suppliers:", err);
    res.status(500).json({ error: "Failed to fetch top suppliers" });
  }
});

/**
 * GET Top Selling Meals
 */
router.get("/top-meals", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.name, SUM(c.quantity) AS total_orders
      FROM cart c
      JOIN menu m ON c.meal_id = m.id
      WHERE c.status='Completed'
      GROUP BY m.name
      ORDER BY total_orders DESC
      LIMIT 5
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching top meals:", err);
    res.status(500).json({ error: "Failed to fetch top meals" });
  }
});

/**
 * GET Revenue Per Supplier
 */
router.get("/revenue-suppliers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.username AS supplier, COALESCE(SUM(c.price * c.quantity),0) AS revenue
      FROM cart c
      JOIN users u ON c.supplier_id = u.id
      WHERE c.status='Completed'
      GROUP BY u.username
      ORDER BY revenue DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching revenue per supplier:", err);
    res.status(500).json({ error: "Failed to fetch revenue per supplier" });
  }
});

export default router;
