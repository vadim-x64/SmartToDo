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
        const email = profile.emails[0].value;

        // Перевіряємо чи є користувач з таким Google ID
        const existingGoogleUser = await pool.query(
            'SELECT u.* FROM users u INNER JOIN customers c ON u.customer_id = c.id WHERE c.google_id = $1',
            [profile.id]
        );

        if (existingGoogleUser.rows.length > 0) {
            // Користувач вже авторизовувався через Google
            return done(null, existingGoogleUser.rows[0]);
        }

        // Перевіряємо чи є користувач з такою поштою (базова реєстрація)
        const existingEmailUser = await pool.query(
            'SELECT u.*, c.id as customer_id FROM users u INNER JOIN customers c ON u.customer_id = c.id WHERE c.email = $1',
            [email]
        );

        if (existingEmailUser.rows.length > 0) {
            // Користувач з такою поштою вже існує - прив'язуємо Google ID
            const customerId = existingEmailUser.rows[0].customer_id;

            await pool.query(
                'UPDATE customers SET google_id = $1 WHERE id = $2',
                [profile.id, customerId]
            );

            // Оновлюємо прапорець is_oauth (тепер користувач може логінитись обома способами)
            await pool.query(
                'UPDATE users SET is_oauth = true WHERE id = $1',
                [existingEmailUser.rows[0].id]
            );

            return done(null, existingEmailUser.rows[0]);
        }

        // Створюємо нового користувача (вперше логіниться через Google)
        const names = profile.displayName.split(' ');
        const firstName = names[0] || 'User';
        const lastName = names.slice(1).join(' ') || '';

        const customerResult = await pool.query(
            'INSERT INTO customers (first_name, last_name, google_id, email) VALUES ($1, $2, $3, $4) RETURNING id',
            [firstName, lastName, profile.id, email]
        );

        const customerId = customerResult.rows[0].id;

        // Генеруємо унікальний username з email
        let username = email.split('@')[0];
        const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);

        if (usernameCheck.rows.length > 0) {
            username = `${username}_${Date.now()}`;
        }

        const userResult = await pool.query(
            'INSERT INTO users (customer_id, username, password, is_oauth) VALUES ($1, $2, $3, $4) RETURNING *',
            [customerId, username, 'google_oauth', true]
        );

        done(null, userResult.rows[0]);
    } catch (err) {
        done(err, null);
    }
}));

module.exports = passport;