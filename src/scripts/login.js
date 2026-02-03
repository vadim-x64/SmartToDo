document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            if (rememberMe) {
                localStorage.setItem('rememberedUsername', username);
                localStorage.setItem('rememberedPassword', password);
            } else {
                localStorage.removeItem('rememberedUsername');
                localStorage.removeItem('rememberedPassword');
            }

            window.location.href = '/home';
        } else {
            showError(data.error);
        }
    } catch (err) {
        showError('Помилка з\'єднання з сервером');
    }
});

// Логика чекбокса — при снятии сразу чистим данные и поля
document.getElementById('rememberMe').addEventListener('change', function() {
    if (!this.checked) {
        localStorage.removeItem('rememberedUsername');
        localStorage.removeItem('rememberedPassword');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
    // При постановке чекбокса ничего не делаем — данные сохранятся только после submit
});

document.getElementById('togglePassword').addEventListener('click', function() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');
    const eyeSlashIcon = document.getElementById('eyeSlashIcon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.classList.add('d-none');
        eyeSlashIcon.classList.remove('d-none');
    } else {
        passwordInput.type = 'password';
        eyeIcon.classList.remove('d-none');
        eyeSlashIcon.classList.add('d-none');
    }
});

function initTheme() {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

// При загрузке страницы — если есть сохраненные данные, подставляем их и ставим чекбокс
function loadRememberedCredentials() {
    const username = localStorage.getItem('rememberedUsername');
    const password = localStorage.getItem('rememberedPassword');

    if (username && password) {
        document.getElementById('username').value = username;
        document.getElementById('password').value = password;
        document.getElementById('rememberMe').checked = true;
    } else {
        document.getElementById('rememberMe').checked = false;
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.remove('d-none');

    setTimeout(() => {
        errorDiv.classList.add('d-none');
    }, 5000);
}

initTheme();
loadRememberedCredentials();