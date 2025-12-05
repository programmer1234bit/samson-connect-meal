// backend/routes/cart.js
import express from 'express';
import pool from '../db.js'; // PostgreSQL pool connection
const router = express.Router();

/* ---------- ADD TO CART ---------- */
router.post('/', async (req, res) => {
    const { username, meal_id, name, price, quantity } = req.body;

    if (!username || !meal_id || !name || !price || !quantity) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const mealIdInt = parseInt(meal_id);
        const quantityInt = parseInt(quantity);
        const priceFloat = parseFloat(price);

        // Check if item already exists
        const existing = await pool.query(
            'SELECT * FROM cart WHERE username=$1 AND meal_id=$2',
            [username, mealIdInt]
        );

        if (existing.rows.length > 0) {
            // Update quantity
            const newQty = existing.rows[0].quantity + quantityInt;
            await pool.query(
                'UPDATE cart SET quantity=$1 WHERE username=$2 AND meal_id=$3',
                [newQty, username, mealIdInt]
            );
        } else {
            // Insert new item with timestamp
            await pool.query(
                'INSERT INTO cart(username, meal_id, name, price, quantity, created_at) VALUES($1,$2,$3,$4,$5,NOW())',
                [username, mealIdInt, name, priceFloat, quantityInt]
            );
        }

        const updatedCart = await pool.query(
            'SELECT * FROM cart WHERE username=$1',
            [username]
        );

        res.json({ message: 'Item added to cart successfully!', cart: updatedCart.rows });
    } catch (err) {
        console.error('Cart POST error:', err.message);
        res.status(500).json({ error: 'Server error while adding to cart' });
    }
});

/* ---------- GET CART FOR USER ---------- */
router.get('/:username', async (req, res) => {
    const { username } = req.params;

    try {
        // Auto-delete items older than 48 hours
        await pool.query(
            "DELETE FROM cart WHERE username=$1 AND created_at < NOW() - INTERVAL '48 hours'",
            [username]
        );

        const result = await pool.query(
            'SELECT * FROM cart WHERE username=$1',
            [username]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Cart GET error:', err.message);
        res.status(500).json({ error: 'Server error while fetching cart' });
    }
});

/* ---------- REMOVE ITEM FROM CART ---------- */
router.delete('/item/:username/:meal_id', async (req, res) => {
    const { username, meal_id } = req.params;

    try {
        await pool.query(
            'DELETE FROM cart WHERE username=$1 AND meal_id=$2',
            [username, meal_id]
        );

        const updatedCart = await pool.query(
            'SELECT * FROM cart WHERE username=$1',
            [username]
        );

        res.json({ message: 'Item removed from cart', cart: updatedCart.rows });
    } catch (err) {
        console.error('Cart DELETE error:', err.message);
        res.status(500).json({ error: 'Server error while removing item' });
    }
});

/* ---------- PROCESS CHECKOUT ---------- */
router.post('/checkout/:username', async (req, res) => {
    const { username } = req.params;

    try {
        // Get cart items
        const cartItems = await pool.query(
            'SELECT * FROM cart WHERE username=$1',
            [username]
        );

        if (cartItems.rows.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Insert into orders table
        for (const item of cartItems.rows) {
            await pool.query(
                'INSERT INTO orders(username, meal_id, name, price, quantity, created_at, expires_at) VALUES($1,$2,$3,$4,$5,NOW(), NOW() + INTERVAL \'48 hours\')',
                [item.username, item.meal_id, item.name, item.price, item.quantity]
            );
        }

        // Clear cart
        await pool.query('DELETE FROM cart WHERE username=$1', [username]);

        res.json({ message: 'Checkout successful! Redirect to checkout.html' });
    } catch (err) {
        console.error('Checkout error:', err.message);
        res.status(500).json({ error: 'Server error during checkout' });
    }
});

/* ---------- CLEAR CART FOR USER ---------- */
router.delete('/:username', async (req, res) => {
    const { username } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM cart WHERE username=$1',
            [username]
        );
        res.json({ 
            message: 'Cart cleared successfully', 
            deletedItems: result.rowCount 
        });
    } catch (err) {
        console.error('Cart DELETE error:', err.message);
        res.status(500).json({ error: 'Server error while clearing cart' });
    }
});

export default router;
