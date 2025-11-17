const pool = require('../config/db');

async function createNotification(userId, type, message, taskId = null) {
    try {
        await pool.query(
            'INSERT INTO Notifications (user_id, task_id, type, message) VALUES ($1, $2, $3, $4)',
            [userId, taskId, type, message]
        );
    } catch (err) {
        console.error('Помилка створення сповіщення: ', err);
    }
}

async function notifyLogin(userId, username) {
    const message = `Ви увійшли в систему як ${username}.`;
    await createNotification(userId, 'user_login', message);
}

async function notifyTaskCreated(userId, taskTitle, taskId) {
    const message = `Створено нове завдання: "${taskTitle}".`;
    await createNotification(userId, 'task_created', message, taskId);
}

async function notifyTaskDeleted(userId, taskTitle) {
    const message = `Завдання "${taskTitle}" було видалено.`;
    await createNotification(userId, 'task_deleted', message);
}

async function notifyTaskUpdated(userId, taskTitle, taskId) {
    const message = `Завдання "${taskTitle}" було оновлено.`;
    await createNotification(userId, 'task_updated', message, taskId);
}

async function notifyTaskCompleted(userId, taskTitle, taskId) {
    const message = `Завдання "${taskTitle}" виконано.`;
    await createNotification(userId, 'task_completed', message, taskId);
}

async function notifyDeadlineApproaching(userId, taskTitle, taskId, hoursLeft) {
    const message = `Увага! До завершення "${taskTitle}" залишилось ${hoursLeft} год.`;
    await createNotification(userId, 'deadline_approaching', message, taskId);
}

async function notifyDeadlineExpired(userId, taskTitle, taskId, deadline) {
    const deadlineDate = new Date(deadline);
    const formattedDate = deadlineDate.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const message = `Завдання ${taskTitle} автоматично завершено.`;
    await createNotification(userId, 'deadline_expired', message, taskId);
}

module.exports = {
    createNotification,
    notifyLogin,
    notifyTaskCreated,
    notifyTaskDeleted,
    notifyTaskUpdated,
    notifyTaskCompleted,
    notifyDeadlineApproaching,
    notifyDeadlineExpired
};