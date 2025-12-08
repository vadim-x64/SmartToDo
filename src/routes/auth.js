const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const {notifyLogin} = require('../utilities/notificationUtility');
const router = express.Router();

router.post('/register', async (req, res) => {
    const {firstName, lastName, dateOfBirth, username, password} = req.body;

    try {
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (userCheck.rows.length > 0) {
            return res.status(400).json({error: 'Користувач з таким іменем вже існує'});
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const customerResult = await pool.query(
            'INSERT INTO customers (first_name, last_name, date_of_birth) VALUES ($1, $2, $3) RETURNING id',
            [firstName, lastName, dateOfBirth || null]
        );

        const customerId = customerResult.rows[0].id;
        const userResult = await pool.query(
            'INSERT INTO users (customer_id, username, password) VALUES ($1, $2, $3) RETURNING id, username',
            [customerId, username, hashedPassword]
        );

        req.session.userId = userResult.rows[0].id;
        req.session.username = userResult.rows[0].username;

        await notifyLogin(userResult.rows[0].id, userResult.rows[0].username);

        res.json({
            success: true,
            message: 'Реєстрація успішна',
            user: {id: userResult.rows[0].id, username: userResult.rows[0].username}
        });
    } catch (err) {
        console.error('Помилка реєстрації: ', err);
        res.status(500).json({error: 'Помилка сервера при реєстрації'});
    }
});

router.post('/login', async (req, res) => {
    const {username, password} = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({error: 'Невірне ім\'я користувача або пароль'});
        }

        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({error: 'Невірне ім\'я користувача або пароль'});
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        await notifyLogin(user.id, user.username);

        res.json({
            success: true,
            message: 'Авторизація успішна',
            user: {id: user.id, username: user.username}
        });
    } catch (err) {
        console.error('Помилка авторизації: ', err);
        res.status(500).json({error: 'Помилка сервера при авторизації'});
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({error: 'Помилка виходу'});
        }
        res.json({success: true, message: 'Вихід успішний'});
    });
});

router.get('/check', (req, res) => {
    if (req.session.userId) {
        res.json({
            authenticated: true,
            user: {id: req.session.userId, username: req.session.username}
        });
    } else {
        res.json({authenticated: false});
    }
});

router.get('/account', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({authenticated: false});
    }

    try {
        const result = await pool.query(
            `SELECT c.first_name, c.last_name, c.date_of_birth, u.username
             FROM Users u
                      INNER JOIN Customers c ON u.customer_id = c.id
             WHERE u.id = $1`,
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({error: 'Акаунт не знайдено'});
        }

        res.json({
            success: true,
            account: result.rows[0]
        });
    } catch (err) {
        console.error('Помилка отримання даних акаунта: ', err);
        res.status(500).json({error: 'Помилка сервера'});
    }
});

router.put('/account', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({error: 'Не авторизовано'});
    }

    const {firstName, lastName, dateOfBirth, username, password} = req.body;

    try {
        const userResult = await pool.query(
            'SELECT customer_id, username FROM Users WHERE id = $1',
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({error: 'Користувач не знайдено'});
        }

        const customerId = userResult.rows[0].customer_id;
        const oldUsername = userResult.rows[0].username;

        if (username !== oldUsername) {
            const usernameCheck = await pool.query(
                'SELECT id FROM Users WHERE username = $1 AND id != $2',
                [username, req.session.userId]
            );

            if (usernameCheck.rows.length > 0) {
                return res.status(400).json({error: 'Це ім\'я користувача вже зайняте'});
            }
        }

        await pool.query(
            'UPDATE Customers SET first_name = $1, last_name = $2, date_of_birth = $3 WHERE id = $4',
            [firstName, lastName, dateOfBirth || null, customerId]
        );

        let requiresReauth = false;

        if (username !== oldUsername) {
            await pool.query(
                'UPDATE Users SET username = $1 WHERE id = $2',
                [username, req.session.userId]
            );
            requiresReauth = true;
        }

        if (password && password.length >= 8) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE Users SET password = $1 WHERE id = $2',
                [hashedPassword, req.session.userId]
            );
            requiresReauth = true;
        }

        if (requiresReauth) {
            req.session.destroy();
            return res.json({
                success: true,
                requiresReauth: true,
                message: 'Дані оновлено. Необхідна повторна авторизація'
            });
        }

        res.json({
            success: true,
            requiresReauth: false,
            message: 'Дані успішно оновлено'
        });
    } catch (err) {
        console.error('Помилка оновлення акаунта: ', err);
        res.status(500).json({error: 'Помилка сервера при оновленні'});
    }
});

router.delete('/account', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({error: 'Не авторизовано'});
    }

    const {password} = req.body;

    if (!password || password.trim().length === 0) {
        return res.status(400).json({error: 'Введіть пароль для підтвердження'});
    }

    try {
        const userResult = await pool.query(
            'SELECT customer_id, password FROM Users WHERE id = $1',
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({error: 'Користувач не знайдено'});
        }

        const user = userResult.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({error: 'Невірний пароль'});
        }

        const customerId = user.customer_id;

        await pool.query('DELETE FROM Users WHERE id = $1', [req.session.userId]);
        await pool.query('DELETE FROM Customers WHERE id = $1', [customerId]);

        req.session.destroy();
        res.json({
            success: true,
            message: 'Акаунт успішно видалено'
        });
    } catch (err) {
        console.error('Помилка видалення акаунта:', err);
        res.status(500).json({error: 'Помилка сервера при видаленні акаунта'});
    }
});

module.exports = router;