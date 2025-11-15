const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./src/routes/auth');
const categoryRoutes = require('./src/routes/categories');
const notificationRoutes = require('./src/routes/notifications');
const taskRoutes = require('./src/routes/tasks');
const { requireAuth } = require('./src/middleware/authMiddleware');
const { startDeadlineChecker } = require('./src/utilities/deadlineChecker');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tasks', taskRoutes);

app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/home');
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    if (req.session.userId) {
        res.redirect('/home');
    } else {
        res.sendFile(path.join(__dirname, 'src/views/login.html'));
    }
});

app.get('/register', (req, res) => {
    if (req.session.userId) {
        res.redirect('/home');
    } else {
        res.sendFile(path.join(__dirname, 'src/views/register.html'));
    }
});

app.get('/home', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'src/views/home.html'));
});

startDeadlineChecker();

app.listen(PORT, () => {
    console.log(`Сервер запущено на http://localhost:${PORT}`);
});