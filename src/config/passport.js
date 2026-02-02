const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        done(null, result.rows[0]);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Перевіряємо чи користувач вже існує
        const existingUser = await pool.query(
            'SELECT u.* FROM users u INNER JOIN customers c ON u.customer_id = c.id WHERE c.google_id = $1',
            [profile.id]
        );

        if (existingUser.rows.length > 0) {
            // Користувач вже існує
            return done(null, existingUser.rows[0]);
        }

        // Створюємо нового користувача
        const names = profile.displayName.split(' ');
        const firstName = names[0] || 'User';
        const lastName = names.slice(1).join(' ') || '';

        const customerResult = await pool.query(
            'INSERT INTO customers (first_name, last_name, google_id, email) VALUES ($1, $2, $3, $4) RETURNING id',
            [firstName, lastName, profile.id, profile.emails[0].value]
        );

        const customerId = customerResult.rows[0].id;

        // Генеруємо унікальний username з email
        let username = profile.emails[0].value.split('@')[0];
        const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);

        if (usernameCheck.rows.length > 0) {
            username = `${username}_${Date.now()}`;
        }

        const userResult = await pool.query(
            'INSERT INTO users (customer_id, username, password) VALUES ($1, $2, $3) RETURNING *',
            [customerId, username, 'google_oauth'] // Пароль не потрібен для OAuth
        );

        done(null, userResult.rows[0]);
    } catch (err) {
        done(err, null);
    }
}));

module.exports = passport;