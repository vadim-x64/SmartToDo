const pool = require('../config/db');
const { notifyDeadlineExpired, notifyDeadlineApproaching } = require('./notificationUtility');

async function checkExpiredDeadlines() {
    try {
        const now = new Date();
        const expired = await pool.query(
            `SELECT t.id, t.user_id, t.title, t.deadline
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

        const thresholds = [24, 12, 6, 3, 1];

        for (const hours of thresholds) {
            const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
            const pastTime = new Date(now.getTime() + (hours - 0.5) * 60 * 60 * 1000);

            const approaching = await pool.query(
                `SELECT DISTINCT t.id, t.user_id, t.title, t.deadline
                 FROM Tasks t 
                 WHERE t.status = 'active' 
                 AND t.deadline IS NOT NULL 
                 AND t.deadline > $1
                 AND t.deadline <= $2
                 AND NOT EXISTS (
                     SELECT 1 FROM Notifications n
                     WHERE n.task_id = t.id 
                     AND n.type = 'deadline_approaching'
                     AND n.message LIKE '%' || $3 || ' год%'
                 )`,
                [pastTime, futureTime, hours]
            );

            for (const task of approaching.rows) {
                await notifyDeadlineApproaching(task.user_id, task.title, task.id, hours);
            }
        }
    } catch (err) {
        console.error('Помилка перевірки прострочених завдань: ', err);
    }
}

function startDeadlineChecker() {
    checkExpiredDeadlines();
    setInterval(checkExpiredDeadlines, 60000);
}

module.exports = { startDeadlineChecker };