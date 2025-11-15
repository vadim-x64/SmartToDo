const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const router = express.Router();

router.post('/register', async (req, res) => {
    const { firstName, lastName, dateOfBirth, username, password } = req.body;

    try {
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Користувач з таким іменем вже існує' });
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

        res.json({
            success: true,
            message: 'Реєстрація успішна',
            user: { id: userResult.rows[0].id, username: userResult.rows[0].username }
        });

    } catch (err) {
        console.error('Помилка реєстрації: ', err);
        res.status(500).json({ error: 'Помилка сервера при реєстрації' });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Невірне ім\'я користувача або пароль' });
        }

        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Невірне ім\'я користувача або пароль' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            message: 'Авторизація успішна',
            user: { id: user.id, username: user.username }
        });

    } catch (err) {
        console.error('Помилка авторизації: ', err);
        res.status(500).json({ error: 'Помилка сервера при авторизації' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка виходу' });
        }
        res.json({ success: true, message: 'Вихід успішний' });
    });
});

router.get('/check', (req, res) => {
    if (req.session.userId) {
        res.json({
            authenticated: true,
            user: { id: req.session.userId, username: req.session.username }
        });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;