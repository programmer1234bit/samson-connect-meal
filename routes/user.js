import express from 'express';
import pool from '../db.js';
import bcrypt from 'bcrypt';

const router = express.Router();

// ---------------- GET USER INFO ----------------
router.get('/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, first_name, last_name, email, username, phone, role, profile_pic, created_at FROM users WHERE username=$1',
            [username]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('User GET error:', err.message);
        res.status(500).json({ error: 'Server error fetching user info' });
    }
});

// ---------------- UPDATE PROFILE ----------------
// Note: This route no longer allows changing the username for security reasons.
router.put('/:username', async (req, res) => {
    const { username } = req.params;
    const { first_name, last_name, email, phone, profile_pic } = req.body;

    if (!email || !phone)
        return res.status(400).json({ error: 'Email and phone are required!' });

    try {
        const result = await pool.query(
            `UPDATE users 
             SET first_name=$1, last_name=$2, email=$3, phone=$4, profile_pic=$5
             WHERE username=$6
             RETURNING id, first_name, last_name, email, username, phone, role, profile_pic, created_at`,
            [first_name, last_name, email, phone, profile_pic, username]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'User not found' });

        res.json({ message: 'Profile updated successfully! ✅', user: result.rows[0] });
    } catch (err) {
        console.error('User PUT error:', err.message);
        res.status(500).json({ error: 'Server error updating profile' });
    }
});

// ---------------- CHANGE PASSWORD ----------------
router.put('/:username/password', async (req, res) => {
    const { username } = req.params;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword)
        return res.status(400).json({ error: 'Both old and new passwords required!' });

    try {
        const result = await pool.query(
            'SELECT password FROM users WHERE username=$1',
            [username]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'User not found' });

        const match = await bcrypt.compare(oldPassword, result.rows[0].password);
        if (!match) return res.status(400).json({ error: 'Current password incorrect' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE users SET password=$1 WHERE username=$2',
            [hashedPassword, username]
        );

        res.json({ message: 'Password updated successfully! ✅' });
    } catch (err) {
        console.error('Password PUT error:', err.message);
        res.status(500).json({ error: 'Server error updating password' });
    }
});

// ---------------- GET CART ITEMS ----------------
router.get('/:username/cart', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM cart WHERE username=$1 ORDER BY created_at DESC',
            [username]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Cart GET error:', err.message);
        res.status(500).json({ error: 'Server error fetching cart items' });
    }
});

// ---------------- GET ORDER HISTORY ----------------
router.get('/:username/orders', async (req, res) => {
    const { username } = req.params;
    try {
        const ordersResult = await pool.query(
            `SELECT id, total, status, created_at, items
             FROM orders
             WHERE username = $1
             ORDER BY created_at DESC`,
            [username]
        );
        res.json(ordersResult.rows);
    } catch (err) {
        console.error('Error fetching order history:', err.stack);
        res.status(500).json({ error: 'Server Error' });
    }
});

// ---------------- ADD ITEM TO CART ----------------
router.post('/:username/cart', async (req, res) => {
    const { username } = req.params;
    const { meal_id, name, price, quantity } = req.body;

    if (!meal_id || !name || !price || !quantity)
        return res.status(400).json({ error: 'Missing meal data' });

    try {
        const existing = await pool.query(
            'SELECT * FROM cart WHERE username=$1 AND meal_id=$2',
            [username, meal_id]
        );

        if (existing.rows.length > 0) {
            await pool.query(
                'UPDATE cart SET quantity = quantity + $1 WHERE username=$2 AND meal_id=$3',
                [quantity, username, meal_id]
            );
        } else {
            await pool.query(
                'INSERT INTO cart(username, meal_id, name, price, quantity) VALUES($1,$2,$3,$4,$5)',
                [username, meal_id, name, price, quantity]
            );
        }

        const updatedCart = await pool.query('SELECT * FROM cart WHERE username = $1', [username]);
        res.json({ message: 'Item added to cart successfully! ✅', cart: updatedCart.rows });
    } catch (err) {
        console.error('Cart POST error:', err.message);
        res.status(500).json({ error: 'Server error adding item to cart' });
    }
});

// ---------------- CHECKOUT ROUTE ----------------
router.post('/checkout', async (req, res) => {
    const { username, payment_method, delivery_address, user_coords, distance, eta } = req.body;

    if (!username || !payment_method || !delivery_address) {
        return res.status(400).json({ error: 'Missing required checkout information.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const cartItemsResult = await client.query('SELECT meal_id, name, price, quantity FROM cart WHERE username = $1', [username]);
        const cartItems = cartItemsResult.rows;

        if (cartItems.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Your cart is empty' });
        }

        const subtotal = cartItems.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
        const deliveryFee = 5.00; // Example delivery fee
        const total = subtotal + deliveryFee;

        const newOrderResult = await client.query(
            `INSERT INTO orders (username, items, subtotal, delivery_fee, total, payment_method, delivery_address, user_coords, distance, eta) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [
                username,
                JSON.stringify(cartItems),
                subtotal,
                deliveryFee,
                total,
                payment_method,
                delivery_address,
                user_coords, // Will be a JSONB object from the client
                distance,
                eta
            ]
        );
        const newOrderId = newOrderResult.rows[0].id;

        await client.query('DELETE FROM cart WHERE username = $1', [username]);

        await client.query('COMMIT');
        res.json({ message: 'Checkout successful! ✅', order_id: newOrderId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Checkout error:', err.stack);
        res.status(500).json({ error: 'Server error during checkout' });
    } finally {
        client.release();
    }
});

// ---------------- UPDATE CART ITEM QUANTITY ----------------
router.put('/:username/cart/:meal_id', async (req, res) => {
    const { username, meal_id } = req.params;
    const { quantity } = req.body;

    if (quantity < 0) return res.status(400).json({ error: 'Quantity cannot be negative' });

    try {
        if (quantity === 0) {
            await pool.query(
                'DELETE FROM cart WHERE username=$1 AND meal_id=$2',
                [username, meal_id]
            );
            return res.json({ message: 'Item removed from cart ✅' });
        }

        await pool.query(
            'UPDATE cart SET quantity=$1 WHERE username=$2 AND meal_id=$3',
            [quantity, username, meal_id]
        );

        res.json({ message: 'Cart updated successfully! ✅' });
    } catch (err) {
        console.error('Cart PUT error:', err.message);
        res.status(500).json({ error: 'Server error updating cart' });
    }
});

// ---------------- REMOVE ITEM FROM CART ----------------
router.delete('/:username/cart/:meal_id', async (req, res) => {
    const { username, meal_id } = req.params;

    try {
        await pool.query(
            'DELETE FROM cart WHERE username=$1 AND meal_id=$2',
            [username, meal_id]
        );
        res.json({ message: 'Item removed from cart ✅' });
    } catch (err) {
        console.error('Cart DELETE error:', err.message);
        res.status(500).json({ error: 'Server error removing item from cart' });
    }
});

export default router;