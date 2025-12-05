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

/**
 * Helper: attempt to query pending carts from 'carts' then fallback to 'cart'
 * Returns array of normalized objects shaped like orders for frontend.
 */
async function fetchPendingFromCarts() {
	try {
		const q = `
			SELECT id, username, meal_id, name, price, quantity, created_at, supplier_id
			FROM carts
			WHERE (status IS NULL OR status ILIKE 'pending' OR status ILIKE 'open' OR order_id IS NULL)
			ORDER BY created_at DESC
		`;
		const { rows } = await pool.query(q);
		return rows.map(r => ({
			id: `cart-${r.id}`,
			customer: r.username || null,
			supplier: r.supplier_id || null,
			items: [{ name: r.name, qty: r.quantity || 1, unit_price: r.price || 0 }],
			total_price: Number((r.price || 0) * (r.quantity || 1)),
			raw_status: r.status ?? null,
			status: "Pending",
			created_at: r.created_at
		}));
	} catch (err) {
		// fallback to singular table name 'cart' if 'carts' does not exist
		try {
			const q2 = `
				SELECT id, username, meal_id, name, price, quantity, created_at, supplier_id
				FROM cart
				WHERE (status IS NULL OR status ILIKE 'pending' OR status ILIKE 'open' OR order_id IS NULL)
				ORDER BY created_at DESC
			`;
			const { rows } = await pool.query(q2);
			return rows.map(r => ({
				id: `cart-${r.id}`,
				customer: r.username || null,
				supplier: r.supplier_id || null,
				items: [{ name: r.name, qty: r.quantity || 1, unit_price: r.price || 0 }],
				total_price: Number((r.price || 0) * (r.quantity || 1)),
				raw_status: r.status ?? null,
				status: "Pending",
				created_at: r.created_at
			}));
		} catch (err2) {
			// If both fail, return empty and let caller use fallback
			console.warn("fetchPendingFromCarts: no carts table or query failed", err2);
			return [];
		}
	}
}

/**
 * GET /api/sup/orders
 * Optional query: ?status=Pending|Completed|Cancelled|all
 * Returns combined list: pending from cart(s) + records from orders table.
 */
router.get("/orders", async (req, res) => {
	try {
		const { status } = req.query;

		// fetch orders from orders table
		const ordersQ = `
			SELECT id, username, supplier_name, items, subtotal, delivery_fee, total as total_price, status, created_at
			FROM orders
			ORDER BY created_at DESC
			LIMIT 1000
		`;
		const ordersRes = await pool.query(ordersQ);
		const orders = (ordersRes.rows || []).map(r => ({
			id: r.id,
			customer: r.username || null,
			supplier: r.supplier_name || null,
			items: r.items || null,
			total_price: r.total_price ?? r.subtotal ?? 0,
			raw_status: r.status ?? null,
			status: normalizeStatus(r.status),
			created_at: r.created_at
		}));

		// fetch pending carts
		const carts = await fetchPendingFromCarts();

		// combine: carts (pending) first, then orders
		let combined = [...carts, ...orders];

		// optional server-side filter by normalized status
		if (status && status !== "all") {
			const wanted = String(status).toLowerCase();
			combined = combined.filter(o => String(o.status).toLowerCase() === wanted);
		}

		// sort by created_at desc (both sources), handle missing created_at
		combined.sort((a, b) => {
			const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
			const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
			return tb - ta;
		});

		res.json(combined);
	} catch (e) {
		console.error("GET /api/sup/orders error", e);
		res.status(500).json({ error: "failed to fetch supplier orders" });
	}
});

/**
 * PUT /api/sup/orders/:id/status
 * Updates only real orders (ids that are numeric). Rejects cart ids (prefixed 'cart-') — conversion should use a dedicated flow.
 */
router.put("/orders/:id/status", async (req, res) => {
	const { id } = req.params;
	const { status } = req.body;
	if (!id || !status) return res.status(400).json({ error: "id and status required" });

	// prevent updating cart entries via this endpoint
	if (String(id).startsWith("cart-")) {
		return res.status(400).json({ error: "cannot update cart status here; perform checkout/convert to order first" });
	}

	try {
		const valid = ["Pending", "Completed", "Cancelled"];
		if (!valid.includes(status)) return res.status(400).json({ error: "invalid status" });

		const upd = await pool.query(
			"UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, status",
			[status, id]
		);
		if (upd.rowCount === 0) return res.status(404).json({ error: "order not found" });

		res.json({ ok: true, id: upd.rows[0].id, status: normalizeStatus(upd.rows[0].status) });
	} catch (e) {
		console.error("PUT /api/sup/orders/:id/status error", e);
		res.status(500).json({ error: "failed to update status" });
	}
});

/**
 * Optional: DELETE /api/sup/orders/:id
 * (Deletes only orders table rows; does not touch carts)
 */
router.delete("/orders/:id", async (req, res) => {
	const { id } = req.params;
	if (!id) return res.status(400).json({ error: "id required" });
	if (String(id).startsWith("cart-")) return res.status(400).json({ error: "cannot delete cart via this endpoint" });
	try {
		const del = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING id", [id]);
		if (del.rowCount === 0) return res.status(404).json({ error: "order not found" });
		res.json({ ok: true, id: del.rows[0].id, message: "Order deleted" });
	} catch (e) {
		console.error("DELETE /api/sup/orders/:id error", e);
		res.status(500).json({ error: "failed to delete order" });
	}
});

export default router;