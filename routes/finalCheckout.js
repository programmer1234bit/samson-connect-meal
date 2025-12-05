import express from "express";
import pool from "../db.js";

const router = express.Router();

// ---------------- CONFIRM ORDER ----------------
router.post("/checkout", async (req, res) => {
	console.log("═══════════════════════════════════════════");
	console.log("🔵 CHECKOUT REQUEST STARTED");
	console.log("═══════════════════════════════════════════");
	console.log("📥 Incoming payload:", JSON.stringify(req.body, null, 2));

	const body = req.body || {};

	// Accept both snake_case and camelCase fields
	let {
		username,
		items,
		subtotal,
		delivery_fee = 0,
		total,
		payment_method = null,
		delivery_address = null,
		user_coords = null,
		delivery_lat = null,
		delivery_lng = null,
		cart_id = null
	} = body;

	// Accept camelCase aliases
	if (!delivery_address) delivery_address = body.deliveryAddress || body.address || null;
	if (!user_coords) user_coords = body.userCoords || body.coordinates || user_coords;
	if (!delivery_lat) delivery_lat = body.deliveryLat ?? (body.coordinates && body.coordinates.lat) ?? delivery_lat;
	if (!delivery_lng) delivery_lng = body.deliveryLng ?? (body.coordinates && body.coordinates.lng) ?? delivery_lng;
	if (!payment_method) payment_method = body.paymentMethod ?? payment_method;

	// Ensure non-null payment_method (DB expects not-null)
	payment_method = (payment_method && String(payment_method).trim()) ? String(payment_method).trim() : "cod";

	// If delivery_address still missing, build from coords or fallback text
	if (!delivery_address) {
		try {
			let parsedCoords = null;
			if (user_coords) parsedCoords = (typeof user_coords === "string") ? JSON.parse(user_coords) : user_coords;
			const lat = (delivery_lat != null) ? Number(delivery_lat) : (parsedCoords && (parsedCoords.lat ?? parsedCoords.latitude));
			const lng = (delivery_lng != null) ? Number(delivery_lng) : (parsedCoords && (parsedCoords.lng ?? parsedCoords.longitude));
			if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
				delivery_address = `Lat: ${lat}, Lng: ${lng}`;
			} else {
				delivery_address = "Not provided";
			}
		} catch (e) {
			console.warn("Failed to build delivery_address from coords", e);
			delivery_address = "Not provided";
		}
	}

	let client;
	try {
		client = await pool.connect();
		await client.query("BEGIN");

		// Build items array if not provided
		let itemsArr = null;
		if (items) {
			try { 
				itemsArr = (typeof items === "string") ? JSON.parse(items) : items; 
				console.log("✅ Items from request:", itemsArr);
			} catch(e){ 
				console.error("❌ Error parsing items:", e);
				itemsArr = null; 
			}
		}

		// If no items in request, fetch from cart
		if (!Array.isArray(itemsArr) || itemsArr.length === 0) {
			console.log("⚠️ No items in request, fetching from cart for username:", username);
			let cartRows = [];
			
			if (username) {
				const cartQuery = "SELECT id, username, meal_id, name, price, quantity FROM cart WHERE username = $1 ORDER BY created_at DESC";
				console.log("🔍 Executing query:", cartQuery, "with username:", username);
				
				const r2 = await client.query(cartQuery, [username]);
				cartRows = r2.rows || [];
				console.log(`✅ Found ${cartRows.length} cart items for user ${username}:`, cartRows);
			}

			if (cartRows.length > 0) {
				itemsArr = cartRows.map(c => ({
					name: c.name,
					meal_id: c.meal_id,
					unit_price: Number(c.price || 0),
					quantity: Number(c.quantity || 1),
					subtotal: (Number(c.price || 0) * Number(c.quantity || 1)),
					cart_id: c.id
				}));
				console.log("✅ Converted to itemsArr:", itemsArr);
			} else {
				console.warn("⚠️ No cart items found for user:", username);
			}
		}

		if (!Array.isArray(itemsArr) || itemsArr.length === 0) {
			await client.query("ROLLBACK");
			console.error("❌ CHECKOUT FAILED: No items found");
			return res.status(400).json({ error: "Items are required" });
		}

		// compute subtotal/total if missing
		let computedSubtotal = (typeof subtotal === "number") ? Number(subtotal) : null;
		if (computedSubtotal === null) computedSubtotal = itemsArr.reduce((s, it) => s + Number(it.subtotal ?? (it.unit_price * it.quantity || 0)), 0);
		let computedTotal = (typeof total === "number") ? Number(total) : (computedSubtotal + Number(delivery_fee || 0));

		console.log("💰 Order totals - Subtotal:", computedSubtotal, "Delivery Fee:", delivery_fee, "Total:", computedTotal);

		// extract lat/lng (prefer numeric fields)
		let lat = null, lng = null;
		if (delivery_lat != null && delivery_lng != null) {
			const a = Number(delivery_lat), b = Number(delivery_lng);
			if (!Number.isNaN(a) && !Number.isNaN(b)) { lat = a; lng = b; }
		}
		if ((lat === null || lng === null) && user_coords) {
			try {
				const parsed = (typeof user_coords === "string") ? JSON.parse(user_coords) : user_coords;
				if (parsed && (parsed.lat || parsed.latitude) && (parsed.lng || parsed.longitude)) {
					lat = Number(parsed.lat ?? parsed.latitude);
					lng = Number(parsed.lng ?? parsed.longitude);
					if (Number.isNaN(lat) || Number.isNaN(lng)) { lat = null; lng = null; }
				}
			} catch (e) { /* ignore parse error */ }
		}

		// persist order
		const itemsJson = JSON.stringify(itemsArr);
		const userCoordsJson = user_coords ? (typeof user_coords === "string" ? user_coords : JSON.stringify(user_coords)) : null;
		
		const insertQ = `
			INSERT INTO orders
				(username, items, subtotal, delivery_fee, total, payment_method, delivery_address, user_coords, delivery_lat, delivery_lng, status, created_at)
			VALUES
				($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
			RETURNING id, username, total, status, created_at
		`;
		
		const params = [
			username,
			itemsJson,
			computedSubtotal,
			delivery_fee ?? 0,
			computedTotal,
			payment_method,
			delivery_address,
			userCoordsJson,
			lat,
			lng,
			"Pending"
		];

		console.log("🔒 Executing INSERT with params:");
		console.log("  - username:", params[0]);
		console.log("  - items count:", JSON.parse(params[1]).length);
		console.log("  - subtotal:", params[2]);
		console.log("  - total:", params[4]);
		console.log("  - status:", params[10]);

		const ins = await client.query(insertQ, params);
		const orderId = ins.rows[0].id;
		
		console.log("✅ ORDER INSERTED successfully:");
		console.log("  - Order ID:", orderId);
		console.log("  - Username:", ins.rows[0].username);
		console.log("  - Total:", ins.rows[0].total);
		console.log("  - Created at:", ins.rows[0].created_at);

		// Delete cart items
		try {
			const cartIds = new Set();
			itemsArr.forEach(it => { if (it.cart_id) cartIds.add(Number(it.cart_id)); });
			
			if (cartIds.size > 0) {
				for (const cid of cartIds) {
					const delRes = await client.query("DELETE FROM cart WHERE id = $1", [cid]);
					console.log(`🗑️ Deleted cart item ${cid}:`, delRes.rowCount, "rows affected");
				}
			} else if (username) {
				const delRes = await client.query(
					"DELETE FROM cart WHERE username = $1",
					[username]
				);
				console.log(`🗑️ Deleted ${delRes.rowCount} cart items for user ${username}`);
			}
		} catch (e) {
			console.warn("⚠️ Failed to clear cart rows:", e.message);
		}

		await client.query("COMMIT");
		console.log("✅ TRANSACTION COMMITTED");
		console.log("═══════════════════════════════════════════");
		
		return res.json({ 
			ok: true, 
			orderId, 
			coords: (lat!==null && lng!==null)?{lat,lng}:(userCoordsJson?JSON.parse(userCoordsJson):null), 
			total: computedTotal,
			cartCleared: true
		});
	} catch (err) {
		if (client) {
			try { await client.query("ROLLBACK"); } catch (_) {}
		}
		console.error("❌ POST /checkout error:");
		console.error("   Stack:", err.stack);
		console.error("   Message:", err.message);
		console.error("═══════════════════════════════════════════");
		return res.status(500).json({ error: err.message });
	} finally {
		if (client) client.release();
	}
});

// ---------------- GET ORDER STATUS ----------------
router.get("/orders/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM orders WHERE username = $1 ORDER BY created_at DESC LIMIT 10`,
      [username]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ message: "Error fetching orders" });
  }
});

// ---------------- GET LATEST ORDER ----------------
router.get("/latest/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM orders WHERE username = $1 ORDER BY created_at DESC LIMIT 1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No orders found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get latest order error:", err);
    res.status(500).json({ message: "Error fetching latest order" });
  }
});

// ---------------- GET ORDER TRACKING DATA ----------------
router.get("/track/:orderId", async (req, res) => {
  const { orderId } = req.params;

  try {
    // Get order with supplier information
    const result = await pool.query(`
      SELECT 
        o.*,
        u.restaurant_name,
        u.location as supplier_location,
        u.phone as supplier_phone,
        u.service_radius_km,
        CASE 
          WHEN o.status = 'Pending' THEN 'preparing'
          WHEN o.status = 'confirmed' THEN 'preparing'
          WHEN o.status = 'preparing' THEN 'preparing'
          WHEN o.status = 'ready' THEN 'ready'
          WHEN o.status = 'picked_up' THEN 'on_the_way'
          WHEN o.status = 'delivered' THEN 'delivered'
          ELSE 'preparing'
        END as tracking_status,
        EXTRACT(EPOCH FROM (NOW() - o.created_at))/60 as minutes_since_order
      FROM orders o
      LEFT JOIN users u ON o.username = u.username AND u.role = 'meal_supplier'
      WHERE o.id = $1
    `, [orderId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = result.rows[0];
    
    // Calculate estimated times based on order status
    let estimatedDeliveryTime = 30; // default 30 minutes
    if (order.tracking_status === 'preparing') {
      estimatedDeliveryTime = Math.max(15, 45 - order.minutes_since_order);
    } else if (order.tracking_status === 'ready') {
      estimatedDeliveryTime = 20;
    } else if (order.tracking_status === 'on_the_way') {
      estimatedDeliveryTime = Math.max(5, 15 - (order.minutes_since_order - 20));
    }

    // Mock supplier coordinates (in real app, these would come from supplier profile)
    const mockSupplierCoords = {
      lat: -6.799 + (Math.random() - 0.5) * 0.01, // Small random offset
      lng: 39.2 + (Math.random() - 0.5) * 0.01
    };

    res.json({
      orderId: order.id,
      status: order.tracking_status,
      items: order.items,
      total: order.total,
      deliveryAddress: order.delivery_address,
      userCoords: order.user_coords,
      deliveryLat: order.delivery_lat,
      deliveryLng: order.delivery_lng,
      supplierCoords: mockSupplierCoords,
      supplierName: order.restaurant_name || 'Restaurant',
      supplierPhone: order.supplier_phone,
      estimatedDeliveryTime: Math.round(estimatedDeliveryTime),
      orderTime: order.created_at,
      minutesSinceOrder: Math.round(order.minutes_since_order)
    });
  } catch (err) {
    console.error("Get order tracking error:", err);
    res.status(500).json({ message: "Error fetching order tracking data" });
  }
});

// ---------------- DEBUG ENDPOINT ----------------
router.get("/debug/cart/:username", async (req, res) => {
	const { username } = req.params;
	try {
		const result = await pool.query(
			"SELECT id, username, meal_id, name, price, quantity, status FROM cart WHERE username = $1",
			[username]
		);
		res.json({
			username,
			cartItems: result.rows,
			count: result.rows.length
		});
	} catch (err) {
		console.error("Debug cart error:", err);
		res.status(500).json({ error: err.message });
	}
});

export default router;