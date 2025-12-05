import express from "express";
import pool from "../db.js";
const router = express.Router();

/**
 * GET /api/sup/orders
 * Optional query: ?status=Pending|Completed|Cancelled|all
 */
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const q = `
      SELECT id, username, supplier_name, items, subtotal, delivery_fee, total, status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 1000
    `;
    const { rows } = await pool.query(q);

    const normalize = raw => {
      if (!raw) return "Pending";
      const s = String(raw).toLowerCase();
      if (s.includes("cancel")) return "Cancelled";
      if (s.includes("complete") || s.includes("deliv") || s.includes("paid") || s.includes("received") || s.includes("confirm")) return "Completed";
      if (s.includes("cart") || s.includes("in_cart") || s.includes("incomplete")) return "Pending";
      if (s.includes("pending") || s.includes("await")) return "Pending";
      return "Pending";
    };

    let out = rows.map(r => ({
      id: r.id,
      customer: r.username || null,
      supplier: r.supplier_name || null,
      items: r.items || null,
      subtotal: r.subtotal || null,
      delivery_fee: r.delivery_fee || null,
      total_price: r.total || null,
      raw_status: r.status || null,
      status: normalize(r.status),
      created_at: r.created_at
    }));

    if (status && status !== "all") {
      const wanted = String(status).toLowerCase();
      out = out.filter(o => String(o.status).toLowerCase() === wanted);
    }

    res.json(out);
  } catch (e) {
    console.error("GET /api/sup/orders error", e);
    res.status(500).json({ error: "failed to fetch orders" });
  }
});

/**
 * PUT /api/sup/orders/:id/status
 * body: { status: 'Pending'|'Completed'|'Cancelled' }
 */
router.put("/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!id || !status) return res.status(400).json({ error: "id and status required" });

  try {
    const valid = ["Pending", "Completed", "Cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ error: "invalid status" });

    const upd = await pool.query(
      "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, status",
      [status, id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: "order not found" });

    res.json({ ok: true, id: upd.rows[0].id, status: upd.rows[0].status });
  } catch (e) {
    console.error("PUT /api/sup/orders/:id/status error", e);
    res.status(500).json({ error: "failed to update status" });
  }
});

/**
 * DELETE /api/sup/orders/:id
 */
router.delete("/orders/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });
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
