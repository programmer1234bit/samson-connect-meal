import express from 'express';
import pool from '../db.js'; // PostgreSQL pool connection

const router = express.Router();


// ---------------- GET ALL USERS (with optional role filter) ----------------
router.get('/', async (req, res) => {
  try {
    const { role } = req.query;

    // ✅ Updated SELECT statement to include all relevant user/supplier fields
    let query = 'SELECT id, username, email, role, status, last_active, restaurant_name, location, phone FROM users';
    let values = [];

    // Conditionally add a WHERE clause if a role is provided
    if (role) {
      query += ' WHERE role = $1';
      values.push(role);
    }

    query += ' ORDER BY id ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err.message);
    res.status(500).json({ error: 'Server error fetching users' });
  }
});
// ... (rest of the file is unchanged) ...

// ---------------- GET SINGLE USER ----------------
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching user:', err.message);
    res.status(500).json({ error: 'Server error fetching user' });
  }
});

// ---------------- DELETE USER ----------------
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM users WHERE id=$1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Error deleting user:', err.message);
    res.status(500).json({ error: 'Server error deleting user' });
  }
});

// ---------------- UPDATE USER ----------------
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { username, email, role, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET username=$1, email=$2, role=$3, status=$4, last_active=NOW()
       WHERE id=$5 RETURNING *`,
      [username, email, role, status, id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User updated successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Error updating user:', err.message);
    res.status(500).json({ error: 'Server error updating user' });
  }
});

// ---------------- PURGE INACTIVE USERS (30 days) ----------------
export const purgeInactiveUsers = async () => {
  try {
    const result = await pool.query(
      `DELETE FROM users 
       WHERE status='Inactive' 
       AND last_active < NOW() - INTERVAL '30 days'
       RETURNING id, username`
    );
    if (result.rowCount > 0) {
      console.log('Purged inactive users:', result.rows);
    }
  } catch (err) {
    console.error('Error purging inactive users:', err.message);
  }
};

export default router;