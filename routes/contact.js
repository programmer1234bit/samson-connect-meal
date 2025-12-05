import express from 'express';
import pool from '../db.js'; // your db connection

const router = express.Router();

// ---------------- POST CONTACT MESSAGE ----------------
router.post('/', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message)
        return res.status(400).json({ error: 'All fields are required!' });

    try {
        const result = await pool.query(
            'INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3) RETURNING *',
            [name, email, message]
        );
        res.json({ message: 'Message received successfully! 🙌', data: result.rows[0] });
    } catch (err) {
        console.error('Contact POST error:', err.message);
        res.status(500).json({ error: 'Server error saving message' });
    }
});

// ---------------- GET ALL MESSAGES ----------------
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Contact GET error:', err.message);
        res.status(500).json({ error: 'Server error fetching messages' });
    }
});

// ---------------- MARK AS READ ----------------
router.put('/:id/read', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE contact_messages SET read = TRUE WHERE id=$1', [id]);
        res.json({ message: 'Message marked as read!' });
    } catch (err) {
        console.error('Mark as Read error:', err.message);
        res.status(500).json({ error: 'Server error updating message' });
    }
});

// ---------------- DELETE MESSAGE ----------------
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM contact_messages WHERE id=$1', [id]);
        res.json({ message: 'Message removed successfully!' });
    } catch (err) {
        console.error('Delete message error:', err.message);
        res.status(500).json({ error: 'Server error deleting message' });
    }
});

// ---------------- CLEAN MESSAGES OLDER THAN 30 DAYS ----------------
async function cleanOldMessages() {
    try {
        await pool.query('DELETE FROM contact_messages WHERE created_at < NOW() - INTERVAL \'30 days\'');
        console.log('Old messages cleaned ✅');
    } catch (err) {
        console.error('Cleaning old messages error:', err.message);
    }
}

// Run cleanup every 24 hours
setInterval(cleanOldMessages, 24 * 60 * 60 * 1000);

export default router;
