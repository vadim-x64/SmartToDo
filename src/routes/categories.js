const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name FROM Categories ORDER BY id'
        );

        res.json({
            success: true,
            categories: result.rows
        });
    } catch (err) {
        console.error('Помилка отримання категорій: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

module.exports = router;