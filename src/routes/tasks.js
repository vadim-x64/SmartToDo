const express = require('express');
const pool = require('../config/db');
const { notifyTaskCreated, notifyTaskUpdated, notifyTaskCompleted } = require('../utilities/notificationUtility');

const router = express.Router();

async function getCategoryId(name) {
    const res = await pool.query('SELECT id FROM Categories WHERE name = $1', [name]);
    if (res.rows.length === 0) throw new Error(`Категорія ${name} не знайдена`);
    return res.rows[0].id;
}

async function assignCategory(taskId, catId) {
    await pool.query(
        'INSERT INTO TaskCategories (task_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [taskId, catId]
    );
}

async function removeCategory(taskId, catId) {
    await pool.query(
        'DELETE FROM TaskCategories WHERE task_id = $1 AND category_id = $2',
        [taskId, catId]
    );
}

router.get('/', async (req, res) => {
    const userId = req.session.userId;
    const categoryId = req.query.category_id;
    try {
        let query = 'SELECT t.* FROM Tasks t';
        let params = [userId];
        if (categoryId) {
            const catCheck = await pool.query('SELECT name FROM Categories WHERE id = $1', [categoryId]);
            const isCompletedCategory = catCheck.rows[0]?.name === 'Завершені';

            if (isCompletedCategory) {
                query += ' INNER JOIN TaskCategories tc ON t.id = tc.task_id WHERE tc.category_id = $2 AND t.user_id = $1 AND t.status = \'completed\'';
            } else {
                query += ' INNER JOIN TaskCategories tc ON t.id = tc.task_id WHERE tc.category_id = $2 AND t.user_id = $1 AND t.status = \'active\'';
            }
            params = [userId, categoryId];
        } else {
            query += ' WHERE t.user_id = $1';
        }
        query += ' ORDER BY t.priority DESC, t.created_at DESC';
        const result = await pool.query(query, params);
        res.json({ success: true, tasks: result.rows });
    } catch (err) {
        console.error('Помилка отримання завдань: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.get('/:id', async (req, res) => {
    const userId = req.session.userId;
    const taskId = req.params.id;
    try {
        const result = await pool.query(
            'SELECT * FROM Tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Завдання не знайдено' });
        res.json({ success: true, task: result.rows[0] });
    } catch (err) {
        console.error('Помилка отримання завдання: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.post('/', async (req, res) => {
    const { title, description, deadline, priority } = req.body;
    const userId = req.session.userId;
    try {
        const result = await pool.query(
            'INSERT INTO Tasks (user_id, title, description, deadline, priority) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [userId, title, description || null, deadline ? new Date(deadline) : null, !!priority]
        );
        const task = result.rows[0];
        const myCatId = await getCategoryId('Мої');
        await assignCategory(task.id, myCatId);
        if (deadline) {
            const plannedCatId = await getCategoryId('Заплановані');
            await assignCategory(task.id, plannedCatId);
        }
        if (priority) {
            const importantCatId = await getCategoryId('Важливі');
            await assignCategory(task.id, importantCatId);
        }
        await notifyTaskCreated(userId, title, task.id);
        res.json({ success: true, task });
    } catch (err) {
        console.error('Помилка створення завдання: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.put('/:id/complete', async (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.userId;
    try {
        const currentRes = await pool.query(
            'SELECT status, title FROM Tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );
        if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Завдання не знайдено' });
        const currentStatus = currentRes.rows[0].status;
        const newStatus = currentStatus === 'active' ? 'completed' : 'active';
        await pool.query(
            'UPDATE Tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newStatus, taskId]
        );
        const completedCatId = await getCategoryId('Завершені');
        if (newStatus === 'completed') {
            await assignCategory(taskId, completedCatId);
            await notifyTaskCompleted(userId, currentRes.rows[0].title, taskId);
        } else {
            await removeCategory(taskId, completedCatId);
            await notifyTaskUpdated(userId, currentRes.rows[0].title, taskId);
        }
        res.json({ success: true, newStatus });
    } catch (err) {
        console.error('Помилка оновлення статусу: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

router.put('/:id/priority', async (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.userId;
    try {
        const currentRes = await pool.query(
            'SELECT priority, title FROM Tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );
        if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Завдання не знайдено' });
        const newPriority = !currentRes.rows[0].priority;
        await pool.query(
            'UPDATE Tasks SET priority = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPriority, taskId]
        );
        const importantCatId = await getCategoryId('Важливі');
        if (newPriority) {
            await assignCategory(taskId, importantCatId);
        } else {
            await removeCategory(taskId, importantCatId);
        }
        await notifyTaskUpdated(userId, currentRes.rows[0].title, taskId);
        res.json({ success: true, newPriority });
    } catch (err) {
        console.error('Помилка оновлення пріоритету: ', err);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

module.exports = router;