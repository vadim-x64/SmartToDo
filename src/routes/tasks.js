const express = require('express');
const pool = require('../config/db');
const {
    notifyTaskCreated,
    notifyTaskUpdated,
    notifyTaskCompleted,
    notifyTaskDeleted,
    createNotification,
    notifyTasksExported,
    notifyTasksImported
} = require('../utilities/notificationUtility');

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
    const pinnedOnly = req.query.pinned === 'true';

    try {
        let query = 'SELECT t.* FROM Tasks t';
        let params = [userId];

        if (pinnedOnly) {
            query += ' WHERE t.user_id = $1 AND t.pinned = true AND t.status = \'active\'';
        } else if (categoryId) {
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

        query += ' ORDER BY t.pinned DESC, t.priority DESC, t.created_at DESC';

        const result = await pool.query(query, params);

        res.json({success: true, tasks: result.rows});
    } catch (err) {
        console.error('Помилка отримання завдань: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.get('/export', async (req, res) => {
    const userId = req.session.userId;

    try {
        const result = await pool.query(
            'SELECT title, description, deadline, priority, status FROM Tasks WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({error: 'Немає завдань для експорту'});
        }

        await notifyTasksExported(userId, result.rows.length);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=exportedTasks.json');
        res.json(result.rows);
    } catch (err) {
        console.error('Помилка експорту: ', err);
        res.status(500).json({error: 'Помилка експорту'});
    }
});

router.post('/import', async (req, res) => {
    const userId = req.session.userId;
    const {tasks} = req.body;

    try {
        if (!Array.isArray(tasks) || tasks.length === 0) {
            return res.status(400).json({error: 'Невірний формат файлу'});
        }

        let imported = 0;
        const myCatId = await getCategoryId('Мої');

        for (const task of tasks) {
            if (!task.title) continue;

            const result = await pool.query(
                'INSERT INTO Tasks (user_id, title, description, deadline, priority, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [
                    userId,
                    task.title,
                    task.description || null,
                    task.deadline ? new Date(task.deadline) : null,
                    !!task.priority,
                    task.status || 'active'
                ]
            );

            await assignCategory(result.rows[0].id, myCatId);

            if (task.deadline) {
                const plannedCatId = await getCategoryId('Заплановані');
                await assignCategory(result.rows[0].id, plannedCatId);
            }

            if (task.priority) {
                const importantCatId = await getCategoryId('Важливі');
                await assignCategory(result.rows[0].id, importantCatId);
            }

            if (task.status === 'completed') {
                const completedCatId = await getCategoryId('Завершені');
                await assignCategory(result.rows[0].id, completedCatId);
            }

            imported++;
        }

        await notifyTasksImported(userId, imported);

        res.json({success: true, imported});
    } catch (err) {
        console.error('Помилка імпорту: ', err);
        res.status(500).json({error: 'Помилка імпорту'});
    }
});

router.get('/search', async (req, res) => {
    const userId = req.session.userId;
    const query = req.query.q;

    try {
        if (!query || query.trim().length === 0) {
            return res.json({success: true, tasks: []});
        }

        const result = await pool.query(
            `SELECT *
             FROM Tasks
             WHERE user_id = $1
               AND (title ILIKE $2 OR description ILIKE $2)
             ORDER BY priority DESC, created_at DESC`,
            [userId, `%${query}%`]
        );

        res.json({success: true, tasks: result.rows});
    } catch (err) {
        console.error('Помилка пошуку завдань: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.get('/sorted', async (req, res) => {
    const userId = req.session.userId;
    const sortValue = req.query.sort;
    const query = req.query.q || '';

    try {
        if (!sortValue) {
            return res.json({success: true, tasks: []});
        }

        let whereClause = 't.user_id = $1';
        let params = [userId];
        let paramIndex = 2;

        if (query.trim().length > 0) {
            whereClause += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
            params.push(`%${query}%`);
            paramIndex++;
        }

        let orderBy = '';

        switch (sortValue) {
            case 'created_desc':
                orderBy = 'ORDER BY t.created_at DESC';
                break;
            case 'created_asc':
                orderBy = 'ORDER BY t.created_at ASC';
                break;
            case 'deadline_asc':
                whereClause += ' AND t.deadline IS NOT NULL';
                orderBy = 'ORDER BY t.deadline ASC NULLS LAST';
                break;
            case 'deadline_desc':
                whereClause += ' AND t.deadline IS NOT NULL';
                orderBy = 'ORDER BY t.deadline DESC NULLS LAST';
                break;
            case 'priority_desc':
                whereClause += ' AND t.priority = true';
                orderBy = 'ORDER BY t.created_at DESC';
                break;
            case 'priority_asc':
                whereClause += ' AND t.priority = false';
                orderBy = 'ORDER BY t.created_at DESC';
                break;
            case 'status_active':
                whereClause += " AND t.status = 'active'";
                orderBy = 'ORDER BY t.created_at DESC';
                break;
            case 'status_completed':
                whereClause += " AND t.status = 'completed'";
                orderBy = 'ORDER BY t.created_at DESC';
                break;
            default:
                orderBy = 'ORDER BY t.created_at DESC';
        }

        const sqlQuery = `SELECT t.* FROM Tasks t WHERE ${whereClause} ${orderBy}`;
        const result = await pool.query(sqlQuery, params);

        res.json({success: true, tasks: result.rows});
    } catch (err) {
        console.error('Помилка сортування завдань: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.get('/:id/categories', async (req, res) => {
    const userId = req.session.userId;
    const taskId = req.params.id;

    try {
        const result = await pool.query(
            `SELECT c.id, c.name
             FROM Categories c
                      INNER JOIN TaskCategories tc ON c.id = tc.category_id
                      INNER JOIN Tasks t ON tc.task_id = t.id
             WHERE t.id = $1
               AND t.user_id = $2
             ORDER BY c.id`,
            [taskId, userId]
        );

        res.json({success: true, categories: result.rows});
    } catch (err) {
        console.error('Помилка отримання категорій завдання: ', err);
        res.status(500).json({error: 'Помилка сервера'});
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

        if (result.rows.length === 0) return res.status(404).json({error: 'Завдання не знайдено'});

        res.json({success: true, task: result.rows[0]});
    } catch (err) {
        console.error('Помилка отримання завдання: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.post('/', async (req, res) => {
    const {title, description, deadline, priority} = req.body;
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

        res.json({success: true, task});
    } catch (err) {
        console.error('Помилка створення завдання: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.put('/:id', async (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.userId;
    const {title, description, deadline, priority} = req.body;

    try {
        const taskRes = await pool.query(
            'SELECT * FROM Tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );

        if (taskRes.rows.length === 0) {
            return res.status(404).json({error: 'Завдання не знайдено'});
        }

        const oldTask = taskRes.rows[0];

        await pool.query(
            'UPDATE Tasks SET title = $1, description = $2, deadline = $3, priority = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
            [title, description || null, deadline ? new Date(deadline) : null, !!priority, taskId]
        );

        const plannedCatId = await getCategoryId('Заплановані');
        const importantCatId = await getCategoryId('Важливі');

        if (deadline && !oldTask.deadline) {
            await assignCategory(taskId, plannedCatId);
        } else if (!deadline && oldTask.deadline) {
            await removeCategory(taskId, plannedCatId);
        }

        if (priority && !oldTask.priority) {
            await assignCategory(taskId, importantCatId);
        } else if (!priority && oldTask.priority) {
            await removeCategory(taskId, importantCatId);
        }

        await notifyTaskUpdated(userId, title, taskId);

        res.json({success: true, message: 'Завдання оновлено'});
    } catch (err) {
        console.error('Помилка оновлення завдання: ', err);
        res.status(500).json({error: 'Помилка сервера'});
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

        if (currentRes.rows.length === 0) return res.status(404).json({error: 'Завдання не знайдено'});

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

        res.json({success: true, newStatus});
    } catch (err) {
        console.error('Помилка оновлення статусу: ', err);
        res.status(500).json({error: 'Помилка сервера'});
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

        if (currentRes.rows.length === 0) return res.status(404).json({error: 'Завдання не знайдено'});

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

        res.json({success: true, newPriority});
    } catch (err) {
        console.error('Помилка оновлення пріоритету: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.delete('/:id', async (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.userId;

    try {
        const taskRes = await pool.query(
            'SELECT title FROM Tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );

        if (taskRes.rows.length === 0) {
            return res.status(404).json({error: 'Завдання не знайдено'});
        }

        const taskTitle = taskRes.rows[0].title;

        await pool.query(
            'DELETE FROM Tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );

        await notifyTaskDeleted(userId, taskTitle);

        res.json({success: true, message: 'Завдання видалено'});
    } catch (err) {
        console.error('Помилка видалення завдання: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.delete('/', async (req, res) => {
    const userId = req.session.userId;

    try {
        const countRes = await pool.query(
            'SELECT COUNT(*) as count FROM Tasks WHERE user_id = $1',
            [userId]
        );

        const count = parseInt(countRes.rows[0].count);

        if (count === 0) {
            return res.json({success: true, message: 'Немає завдань для видалення', count: 0});
        }

        await pool.query(
            'DELETE FROM Tasks WHERE user_id = $1',
            [userId]
        );

        await createNotification(userId, 'task_deleted', `Видалено всі ${count} завдань.`);

        res.json({success: true, message: 'Всі завдання видалено', count});
    } catch (err) {
        console.error('Помилка видалення всіх завдань: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.post('/delete-selected', async (req, res) => {
    const {taskIds} = req.body;
    const userId = req.session.userId;

    try {
        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({error: 'Не вибрано завдань'});
        }

        const verifyRes = await pool.query(
            'SELECT id FROM Tasks WHERE id = ANY($1) AND user_id = $2',
            [taskIds, userId]
        );

        const validIds = verifyRes.rows.map(row => row.id);

        if (validIds.length === 0) {
            return res.status(404).json({error: 'Завдання не знайдено'});
        }

        await pool.query(
            'DELETE FROM Tasks WHERE id = ANY($1) AND user_id = $2',
            [validIds, userId]
        );

        await createNotification(userId, 'task_deleted', `Видалено вибрані ${validIds.length} завдань.`);

        res.json({
            success: true,
            message: 'Вибрані завдання видалено',
            count: validIds.length
        });
    } catch (err) {
        console.error('Помилка видалення вибраних завдань: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.put('/:id/pin', async (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.userId;

    try {
        const currentRes = await pool.query(
            'SELECT pinned, title FROM Tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );

        if (currentRes.rows.length === 0) return res.status(404).json({error: 'Завдання не знайдено'});

        const newPinned = !currentRes.rows[0].pinned;

        await pool.query(
            'UPDATE Tasks SET pinned = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPinned, taskId]
        );

        res.json({success: true, newPinned});
    } catch (err) {
        console.error('Помилка оновлення закріплення: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

module.exports = router;