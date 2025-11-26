document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const errorDiv = document.getElementById('errorMessage');

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
                localStorage.setItem('rememberMe', 'true');
            } else {
                localStorage.removeItem('rememberedUsername');
                localStorage.removeItem('rememberedPassword');
                localStorage.removeItem('rememberMe');
            }

            window.location.href = '/home';
        } else {
            errorDiv.textContent = data.error;
            errorDiv.classList.remove('d-none');
        }
    } catch (err) {
        errorDiv.textContent = 'Помилка з\'єднання з сервером';
        errorDiv.classList.remove('d-none');
    }
});

document.getElementById('rememberMe').addEventListener('change', function() {
    if (this.checked) {
        localStorage.setItem('rememberMeChecked', 'true');
    } else {
        localStorage.setItem('rememberMeChecked', 'false');
    }
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

function loadRememberedCredentials() {
    const rememberMeChecked = localStorage.getItem('rememberMeChecked');

    if (rememberMeChecked === 'true') {
        document.getElementById('rememberMe').checked = true;

        const username = localStorage.getItem('rememberedUsername');
        const password = localStorage.getItem('rememberedPassword');

        if (username && password) {
            document.getElementById('username').value = username;
            document.getElementById('password').value = password;
        }
    } else {
        document.getElementById('rememberMe').checked = false;
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
}

initTheme();
loadRememberedCredentials();