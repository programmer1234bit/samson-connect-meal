// Example authentication routes file (auth.js)
import express from 'express';
import pool from '../db.js'; // PostgreSQL pool connection
import bcrypt from 'bcrypt'; // for hashing passwords
// NOTE: Make sure your server.js uses app.use(session(...)) for req.session to work
// We assume 'express-session' is imported and configured in server.js.

const router = express.Router();

// ⭐️ SIGNUP - SIMPLIFIED (no geolocation required during signup)
router.post('/signup', async (req, res) => {
    const { 
        firstName, 
        lastName, 
        email, 
        phone, 
        username, 
        password, 
        role
    } = req.body;

    // Standard input validation - only basic fields required
    if (!firstName || !lastName || !email || !phone || !username || !password || !role) {
        return res.status(400).json({ message: 'All fields are required!' });
    }

    try {
        // Check if username or email exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE username=$1 OR email=$2',
            [username, email]
        );
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'Username or email already taken' });
        }

        // Hash password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        let redirectUrl;
        let newUser;
        
        if (role === 'meal_supplier') {
            // ⭐️ Insert supplier and RETURN the user ID
            const result = await pool.query(
                `INSERT INTO users(
                    first_name, last_name, email, phone, username, password, role, created_at
                ) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
                RETURNING id, first_name, last_name, email, phone, username, role`,
                [firstName, lastName, email, phone, username, hashedPassword, role]
            );
            newUser = result.rows[0];
            console.log('✅ New supplier created:', newUser); // ⭐️ DEBUG LOG
            redirectUrl = '/supplier/sup-profile.html';
            
        } else {
            // Insert normal customer and RETURN the user ID
            const result = await pool.query(
                `INSERT INTO users(
                    first_name, last_name, email, phone, username, password, role, created_at
                ) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
                RETURNING id, first_name, last_name, email, phone, username, role`,
                [firstName, lastName, email, phone, username, hashedPassword, role]
            );
            newUser = result.rows[0];
            console.log('✅ New customer created:', newUser); // ⭐️ DEBUG LOG
            redirectUrl = '/menu.html';
        }
        
        // ⭐️ Final success response with userId
        return res.status(201).json({ 
            message: 'Signup successful!', 
            userId: newUser.id, // ⭐️ CRITICAL: Send the user ID
            redirectUrl: redirectUrl 
        });

    } catch (err) {
        console.error('Signup POST error:', err.message);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

// ---------------- ADMIN LOGIN (Database Check) ----------------
router.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. Fetch user AND explicitly check for the 'admin' role
        const result = await pool.query(
            'SELECT * FROM users WHERE username=$1 AND role=$2',
            [username, 'admin'] 
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid Admin Credentials' });
        }

        const user = result.rows[0];

        // 2. Compare password hash
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ message: 'Invalid Admin Credentials' }); 

        // 3. SUCCESS: ESTABLISH SESSION
        req.session.userId = user.id; // Store user ID
        req.session.isAdmin = true;   // Set admin flag
        
        // 4. Send Success Response
        res.json({ 
            message: 'Admin login successful!', 
            username: user.username, 
            role: user.role
        });
    } catch (err) {
        console.error('Admin Login POST error:', err.message);
        res.status(500).json({ message: 'Server error during admin login.' });
    }
});

// ---------------- LOGIN (UPDATED for Role Check and Session) ----------------
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username=$1',
            [username]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = result.rows[0];

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ message: 'Incorrect password' }); 

        // 1. ESTABLISH SESSION
        req.session.userId = user.id;
        req.session.role = user.role; // Store role in session for middleware checks

        // 2. DETERMINE REDIRECTION URL
        let redirectUrl;

        if (user.role === 'meal_supplier') {
            // ⭐️ CORRECTED PATH for supplier after fixing 404
            redirectUrl = '/supplier/sup-dashboard.html';
        } else if (user.role === 'customer') {
            redirectUrl = '/menu.html';
        } else if (user.role === 'admin') {
            // Failsafe for admin login via the general route
            redirectUrl = '/admin/admin.html';
        } else {
            // Default fallback for any other role
            redirectUrl = '/menu.html'; 
        }

        // 3. Final Success Response with the Redirect URL
        res.json({ 
            message: 'Login successful!', 
			userId: user.id, // ⭐️ ADDED: This is the critical piece of data
            username: user.username, 
            role: user.role,
            redirectUrl: redirectUrl // This directs the frontend
        });
    } catch (err) {
        console.error('Login POST error:', err.message);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// ---------------- RESET PASSWORD ----------------
router.post('/reset', async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: 'All fields required' });

    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
        if (userResult.rows.length === 0) return res.status(404).json({ message: 'Email not found' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password=$1 WHERE email=$2', [hashedPassword, email]);

        res.json({ message: 'Password reset successful! 🎉' });
    } catch (err) {
        console.error('Reset POST error:', err.message);
        res.status(500).json({ message: 'Server error during password reset' });
    }
});

export default router;