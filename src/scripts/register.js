document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        dateOfBirth: document.getElementById('dateOfBirth').value || null,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
    };

    const errorDiv = document.getElementById('errorMessage');

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
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

initTheme();