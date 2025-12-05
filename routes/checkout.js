// routes/checkout.js
import express from "express";
import pool from "../db.js";
import crypto from "crypto";
const router = express.Router();

/**
 * STEP 1: Suppliers that can fulfill the cart
 * GET /api/checkout/suppliers?cartId=123
 * Returns supplier cards: { id, name, location, phone, eta, total_cents }
 */
router.get("/suppliers", async (req, res) => {
  const { cartId } = req.query;
  if (!cartId) return res.status(400).json({ error: "cartId required" });

  try {
    // group items by supplier and compute totals
    const items = await pool.query(`
      SELECT ci.quantity, m.id AS menu_id, m.name, m.price_cents, m.supplier_id,
             s.name AS supplier_name, s.location, s.phone, s.eta_min, s.eta_max, s.delivery_fee_cents
      FROM cart_items ci
      JOIN menu m      ON m.id = ci.menu_id
      JOIN suppliers s ON s.id = m.supplier_id
      WHERE ci.cart_id = $1
    `, [cartId]);

    if (items.rowCount === 0) return res.json([]);

    // suppliers that appear in this cart
    const map = new Map();
    for (const r of items.rows) {
      const key = r.supplier_id;
      if (!map.has(key)) {
        map.set(key, {
          supplierId: key,
          name: r.supplier_name,
          location: r.location,
          phone: r.phone,
          eta: `${r.eta_min}-${r.eta_max} minutes`,
          itemsTotal: 0,
          deliveryFee: r.delivery_fee_cents
        });
      }
      const g = map.get(key);
      g.itemsTotal += r.price_cents * r.quantity;
    }

    const suppliers = [...map.values()].map(s => ({
      id: s.supplierId,
      name: s.name,
      location: s.location,
      phone: s.phone,
      eta: s.eta,
      items_total_cents: s.itemsTotal,
      delivery_fee_cents: s.deliveryFee,
      total_cents: s.itemsTotal + s.deliveryFee
    }));

    res.json(suppliers);
  } catch (e) {
    console.error("GET /suppliers error", e);
    res.status(500).json({ error: "failed to compute suppliers" });
  }
});

/**
 * STEP 2A: Create order (works for both COD and Card)
 * POST /api/checkout/create
 * body: { cartId, supplierId, paymentMethod: 'cod'|'card' }
 * Locks cart, validates stock/prices, creates order + order_items inside a transaction
 */
router.post("/create", async (req, res) => {
  const client = await pool.connect();
  try {
    const { cartId, supplierId, paymentMethod } = req.body;
    if (!cartId || !supplierId || !paymentMethod) {
      return res.status(400).json({ error: "cartId, supplierId, paymentMethod required" });
    }

    await client.query("BEGIN");

    // Lock cart & fetch items
    const cart = await client.query(
      "SELECT * FROM carts WHERE id = $1 AND status='open' FOR UPDATE",
      [cartId]
    );
    if (cart.rowCount === 0) throw new Error("Cart not open");

    const items = await client.query(`
      SELECT ci.id, ci.quantity, m.id as menu_id, m.name, m.price_cents, m.stock, m.supplier_id
      FROM cart_items ci
      JOIN menu m ON m.id = ci.menu_id
      WHERE ci.cart_id = $1
    `, [cartId]);
    if (items.rowCount === 0) throw new Error("Cart empty");

    // Ensure every item belongs to chosen supplier
    for (const it of items.rows) {
      if (it.supplier_id !== Number(supplierId)) throw new Error("Cart has items from another supplier");
      if (it.stock < it.quantity) throw new Error(`Insufficient stock for ${it.name}`);
    }

    // Totals
    const supplierRow = await client.query(
      "SELECT delivery_fee_cents FROM suppliers WHERE id = $1",
      [supplierId]
    );
    if (supplierRow.rowCount === 0) throw new Error("Supplier not found");

    const itemsTotal = items.rows.reduce((s, it) => s + it.price_cents * it.quantity, 0);
    const deliveryFee = supplierRow.rows[0].delivery_fee_cents;
    const total = itemsTotal + deliveryFee;

    // Create order
    const order = await client.query(`
      INSERT INTO orders (user_id, supplier_id, cart_id, status, total_cents, items_total_cents, delivery_fee_cents, payment_method)
      VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
      RETURNING id
    `, [cart.rows[0].user_id, supplierId, cartId, total, itemsTotal, deliveryFee, paymentMethod]);

    const orderId = order.rows[0].id;

    // Items snapshot
    for (const it of items.rows) {
      await client.query(`
        INSERT INTO order_items (order_id, menu_id, name, unit_price_cents, quantity, subtotal_cents)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [orderId, it.menu_id, it.name, it.price_cents, it.quantity, it.price_cents * it.quantity]);

      // decrement stock
      await client.query(`UPDATE menu SET stock = stock - $1 WHERE id = $2`, [it.quantity, it.menu_id]);
    }

    // lock/convert cart
    await client.query("UPDATE carts SET status='converted' WHERE id=$1", [cartId]);

    await client.query("COMMIT");

    // If COD → finalize and notify supplier immediately
    if (paymentMethod === "cod") {
      await markOrderAsCODAndNotify(orderId).catch(console.error);
      return res.json({ orderId, next: "confirmation", payment: "cod" });
    }

    // If CARD → create a payment intent with your provider here:
    // (Pseudo) callPaymentProvider(total) -> clientToken/redirect URL
    const clientToken = `mock_${orderId}_${Date.now()}`;
    await pool.query(`
      INSERT INTO payments (order_id, provider, status, amount_cents)
      VALUES ($1,'mock','initiated',$2)
    `, [orderId, total]);

    res.json({ orderId, next: "pay", clientToken });
  } catch (e) {
    await pool.query("ROLLBACK");
    console.error("POST /create error", e);
    res.status(400).json({ error: e.message || "failed to create order" });
  } finally {
    client.release();
  }
});

/**
 * STEP 2B: Payment webhook (provider -> our server)
 * POST /api/payments/webhook
 * body: { provider_ref, orderId, status, raw }
 */
router.post("/payments/webhook", async (req, res) => {
  const { orderId, provider_ref, status } = req.body;
  try {
    const order = await pool.query("SELECT * FROM orders WHERE id=$1", [orderId]);
    if (order.rowCount === 0) return res.status(404).end();

    const newStatus = status === "succeeded" ? "paid" : "failed";
    await pool.query("UPDATE orders SET status=$1 WHERE id=$2", [newStatus, orderId]);
    await pool.query(
      "UPDATE payments SET status=$1, provider_ref=$2, raw_response=$3 WHERE order_id=$4",
      [status, provider_ref || null, req.body, orderId]
    );

    if (newStatus === "paid") {
      await notifySupplier(orderId).catch(console.error);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    res.status(500).json({ ok: false });
  }
});

/* ---------- Orders API for supplier frontend ---------- */
/**
 * GET /api/orders
 * Optional query: ?status=Pending|Completed|Cancelled|all
 * Returns recent orders with normalized status field `normalized_status`.
 */
router.get("/orders", async (req, res) => {
  try {
    const { status } = req.query;
    // Basic query - adapt column names if your orders table differs
    const q = `
      SELECT id, username, supplier_name, items, subtotal, delivery_fee, total, status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 500
    `;
    const { rows } = await pool.query(q);

    // Normalize statuses for frontend expectations
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
      customer: r.username || r.customer || null,
      supplier: r.supplier_name || null,
      items: r.items || null,
      subtotal: r.subtotal || null,
      delivery_fee: r.delivery_fee || null,
      total_price: r.total || null,
      raw_status: r.status || null,
      normalized_status: normalize(r.status),
      created_at: r.created_at
    }));

    if (status && status !== "all") {
      const wanted = String(status).toLowerCase();
      out = out.filter(o => String(o.normalized_status).toLowerCase() === wanted);
    }

    res.json(out);
  } catch (e) {
    console.error("GET /api/orders error", e);
    res.status(500).json({ error: "failed to fetch orders" });
  }
});

/**
 * PUT /api/orders/:id/status
 * body: { status: 'Pending'|'Completed'|'Cancelled' }
 */
router.put("/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!id || !status) return res.status(400).json({ error: "id and status required" });

  try {
    const valid = ["Pending", "Completed", "Cancelled"];
    if (!valid.includes(status)) return res.status(400).json({ error: "invalid status" });

    // Attempt to update; map normalized status back to DB-friendly value if desired
    const dbStatus = status; // keep same; adjust mapping if your DB uses different strings
    const upd = await pool.query(
      "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, status",
      [dbStatus, id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: "order not found" });

    res.json({ ok: true, id: upd.rows[0].id, status: upd.rows[0].status });
  } catch (e) {
    console.error("PUT /api/orders/:id/status error", e);
    res.status(500).json({ error: "failed to update status" });
  }
});

/**
 * DELETE /api/orders/:id
 */
router.delete("/orders/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const del = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING id", [id]);
    if (del.rowCount === 0) return res.status(404).json({ error: "order not found" });
    res.json({ ok: true, id: del.rows[0].id, message: "Order deleted" });
  } catch (e) {
    console.error("DELETE /api/orders/:id error", e);
    res.status(500).json({ error: "failed to delete order" });
  }
});

export default router;

/* ---------- helpers ---------- */

async function notifySupplier(orderId) {
  // Fetch full order + items + supplier endpoint and POST it
  const { rows } = await pool.query(`
    SELECT o.id, o.total_cents, o.payment_method, o.status,
           s.api_url, s.api_secret, s.name AS supplier_name,
           json_agg(json_build_object(
             'name', oi.name,
             'unit_price_cents', oi.unit_price_cents,
             'quantity', oi.quantity,
             'subtotal_cents', oi.subtotal_cents
           )) AS items
    FROM orders o
    JOIN suppliers s ON s.id = o.supplier_id
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.id = $1
    GROUP BY o.id, s.api_url, s.api_secret, s.name
  `, [orderId]);

  if (!rows.length) return;
  const payload = rows[0];

  // Pseudo send (replace with fetch/axios)
  // await fetch(payload.api_url, { method:'POST', headers: {...hmac}, body: JSON.stringify(payload) })
  console.log("📦 Dispatching order to supplier:", payload.supplier_name);
}

async function markOrderAsCODAndNotify(orderId) {
  await pool.query("UPDATE orders SET status='cod' WHERE id=$1", [orderId]);
  await notifySupplier(orderId);
}
