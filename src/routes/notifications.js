const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const userId = req.session.userId;

        const result = await pool.query(
            `SELECT id, type, message, is_read, created_at 
             FROM Notifications 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [userId]
        );

        res.json({
            success: true,
            notifications: result.rows
        });
    } catch (err) {
        console.error('Помилка отримання сповіщень: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.get('/unread-count', async (req, res) => {
    try {
        const userId = req.session.userId;

        const result = await pool.query(
            'SELECT COUNT(*) as count FROM Notifications WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );

        res.json({
            success: true,
            count: parseInt(result.rows[0].count)
        });
    } catch (err) {
        console.error('Помилка підрахунку сповіщень: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.put('/:id/read', async (req, res) => {
    try {
        const userId = req.session.userId;
        const notificationId = req.params.id;

        await pool.query(
            'UPDATE Notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Помилка оновлення сповіщення: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.put('/mark-all-read', async (req, res) => {
    try {
        const userId = req.session.userId;

        await pool.query(
            'UPDATE Notifications SET is_read = TRUE WHERE user_id = $1',
            [userId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Помилка оновлення сповіщень: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

module.exports = router;