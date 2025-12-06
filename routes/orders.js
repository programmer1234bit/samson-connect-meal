import express from "express";
import pool from "../db.js";
const router = express.Router();

// Normalize DB status values into: Pending | Completed | Cancelled
function normalizeStatus(raw) {
	if (!raw) return "Pending";
	const s = String(raw).toLowerCase();
	if (s.includes("cancel")) return "Cancelled";
	if (s.includes("complete") || s.includes("deliv") || s.includes("paid") || s.includes("received") || s.includes("confirm")) return "Completed";
	if (s.includes("cart") || s.includes("in_cart") || s.includes("incomplete")) return "Pending";
	if (s.includes("pending") || s.includes("await") || s.includes("open")) return "Pending";
	return "Pending";
}

// GET / - Main endpoint (handles /api/sup/orders)
router.get("/", async (req, res) => {
	try {
		const { status } = req.query;
		console.log("📊 Fetching orders from database...");

		const q = `
			SELECT 
				id, 
				username, 
				supplier_name, 
				items, 
				subtotal, 
				delivery_fee, 
				total, 
				status, 
				created_at,
				delivery_address,
				delivery_lat,
				delivery_lng,
				user_coords
			FROM orders
			ORDER BY created_at DESC
			LIMIT 1000
		`;
		const { rows } = await pool.query(q);
		console.log(`✅ Found ${rows.length} orders in database`);

		let out = rows.map(r => ({
			id: r.id,
			customer: r.username || null,
			supplier: r.supplier_name || null,
			items: r.items || null,
			subtotal: r.subtotal || null,
			delivery_fee: r.delivery_fee || null,
			total_price: r.total || null,
			raw_status: r.status || null,
			status: normalizeStatus(r.status),
			created_at: r.created_at,
			delivery_address: r.delivery_address,
			delivery_lat: r.delivery_lat,
			delivery_lng: r.delivery_lng,
			user_coords: r.user_coords
		}));

		// Optional server-side filter by normalized status
		if (status && status !== "all") {
			const wanted = String(status).toLowerCase();
			out = out.filter(o => String(o.status).toLowerCase() === wanted);
			console.log(`🔍 Filtered to ${out.length} orders with status: ${status}`);
		}

		res.json(out);
	} catch (e) {
		console.error("❌ GET /api/sup/orders error:", e);
		res.status(500).json({ error: "failed to fetch supplier orders", details: e.message });
	}
});

// GET /:id - Fetch individual order
router.get("/:id", async (req, res) => {
	const { id } = req.params;
	if (!id) return res.status(400).json({ error: "id required" });

	try {
		console.log(`🔍 Fetching order ${id}...`);
		const result = await pool.query(
			`SELECT 
				id, 
				username, 
				supplier_name, 
				items, 
				subtotal, 
				delivery_fee, 
				total, 
				status, 
				created_at,
				delivery_address,
				delivery_lat,
				delivery_lng,
				user_coords
			FROM orders
			WHERE id = $1`,
			[id]
		);

		if (result.rows.length === 0) {
			console.warn(`⚠️ Order ${id} not found`);
			return res.status(404).json({ error: "order not found" });
		}

		const r = result.rows[0];
		const order = {
			id: r.id,
			customer: r.username || null,
			supplier: r.supplier_name || null,
			items: r.items || null,
			subtotal: r.subtotal || null,
			delivery_fee: r.delivery_fee || null,
			total_price: r.total || null,
			raw_status: r.status || null,
			status: normalizeStatus(r.status),
			created_at: r.created_at,
			delivery_address: r.delivery_address,
			delivery_lat: r.delivery_lat,
			delivery_lng: r.delivery_lng,
			user_coords: r.user_coords
		};

		console.log(`✅ Order ${id} fetched successfully`);
		res.json(order);
	} catch (e) {
		console.error(`❌ GET /:id error:`, e);
		res.status(500).json({ error: "failed to fetch order", details: e.message });
	}
});

// PUT /:id/status - Update order status
router.put("/:id/status", async (req, res) => {
	const { id } = req.params;
	const { status } = req.body;
	if (!id || !status) return res.status(400).json({ error: "id and status required" });

	try {
		const valid = ["Pending", "Completed", "Cancelled"];
		if (!valid.includes(status)) return res.status(400).json({ error: "invalid status" });

		console.log(`⬆️ Updating order ${id} to status: ${status}`);
		const upd = await pool.query(
			"UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, status",
			[status, id]
		);
		if (upd.rowCount === 0) return res.status(404).json({ error: "order not found" });

		console.log(`✅ Order ${id} updated successfully`);
		res.json({ ok: true, id: upd.rows[0].id, status: normalizeStatus(upd.rows[0].status) });
	} catch (e) {
		console.error("❌ PUT /:id/status error:", e);
		res.status(500).json({ error: "failed to update status" });
	}
});

// DELETE /:id - Delete an order
router.delete("/:id", async (req, res) => {
	const { id } = req.params;
	if (!id) return res.status(400).json({ error: "id required" });
	try {
		console.log(`🗑️ Deleting order ${id}`);
		const del = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING id", [id]);
		if (del.rowCount === 0) return res.status(404).json({ error: "order not found" });
		console.log(`✅ Order ${id} deleted`);
		res.json({ ok: true, id: del.rows[0].id, message: "Order deleted" });
	} catch (e) {
		console.error("❌ DELETE /:id error:", e);
		res.status(500).json({ error: "failed to delete order" });
	}
});

// DEBUG: Check database state
router.get("/debug/stats", async (req, res) => {
	try {
		const ordersCount = await pool.query("SELECT COUNT(*) as count FROM orders");
		const cartCount = await pool.query("SELECT COUNT(*) as count FROM cart");
		const allOrders = await pool.query("SELECT id, username, status, created_at FROM orders LIMIT 10");
		const allCart = await pool.query("SELECT id, username, status, created_at FROM cart LIMIT 10");

		res.json({
			orders_total: ordersCount.rows[0].count,
			cart_total: cartCount.rows[0].count,
			recent_orders: allOrders.rows,
			recent_cart: allCart.rows,
			message: "Debug stats - check your recent orders above"
		});
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

export default router;