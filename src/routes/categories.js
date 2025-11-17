const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const userId = req.session.userId;
        const result = await pool.query(
            `SELECT c.id,
                    c.name,
                    COUNT(DISTINCT CASE
                                       WHEN c.name = 'Завершені' THEN
                                           CASE WHEN t.status = 'completed' THEN tc.task_id END
                                       ELSE
                                           CASE WHEN t.status = 'active' THEN tc.task_id END
                        END) as task_count
             FROM Categories c
                      LEFT JOIN TaskCategories tc ON c.id = tc.category_id
                      LEFT JOIN Tasks t ON tc.task_id = t.id AND t.user_id = $1
             GROUP BY c.id, c.name
             ORDER BY c.id`,
            [userId]
        );

        res.json({
            success: true,
            categories: result.rows
        });
    } catch (err) {
        console.error('Помилка отримання категорій: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

module.exports = router;