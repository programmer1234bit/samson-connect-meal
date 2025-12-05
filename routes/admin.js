import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve messages.html
router.get('/messages', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/messages.html'));
});

// You can add more admin pages here
router.get('/orders', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/orders.html'));
});

export default router;
