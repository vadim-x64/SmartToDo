const pool = require('../config/db');
const { notifyDeadlineExpired } = require('./notificationUtility');

async function checkExpiredDeadlines() {
    try {
        const now = new Date();

        const expired = await pool.query(
            `SELECT t.id, t.user_id, t.title 
             FROM Tasks t 
             WHERE t.status = 'active' 
             AND t.deadline IS NOT NULL 
             AND t.deadline < $1`,
            [now]
        );

        for (const task of expired.rows) {
            await pool.query(
                'UPDATE Tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['completed', task.id]
            );

            const completedCat = await pool.query('SELECT id FROM Categories WHERE name = $1', ['Завершені']);
            if (completedCat.rows.length > 0) {
                await pool.query(
                    'INSERT INTO TaskCategories (task_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [task.id, completedCat.rows[0].id]
                );
            }

            await notifyDeadlineExpired(task.user_id, task.title, task.id, task.deadline);
        }

        if (expired.rows.length > 0) {
            console.log(`Автоматично завершено ${expired.rows.length} прострочених завдань`);
        }
    } catch (err) {
        console.error('Помилка перевірки прострочених завдань:', err);
    }
}

function startDeadlineChecker() {
    checkExpiredDeadlines();
    setInterval(checkExpiredDeadlines, 0);
}

module.exports = { startDeadlineChecker };