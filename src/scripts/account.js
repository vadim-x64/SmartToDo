let originalData = {};

async function loadAccountData() {
    try {
        const response = await fetch('/api/auth/account');
        const data = await response.json();

        if (data.success) {
            originalData = {
                firstName: data.account.first_name,
                lastName: data.account.last_name,
                dateOfBirth: data.account.date_of_birth || '',
                username: data.account.username
            };

            document.getElementById('firstName').value = originalData.firstName;
            document.getElementById('lastName').value = originalData.lastName;
            document.getElementById('dateOfBirth').value = originalData.dateOfBirth;
            document.getElementById('username').value = originalData.username;
        } else {
            window.location.href = '/login';
        }
    } catch (err) {
        console.error('Помилка завантаження даних акаунта: ', err);
        window.location.href = '/login';
    }
}

function checkForChanges() {
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const hasChanges =
        firstName !== originalData.firstName ||
        lastName !== originalData.lastName ||
        dateOfBirth !== originalData.dateOfBirth ||
        username !== originalData.username ||
        password.length > 0;

    document.getElementById('saveBtn').disabled = !hasChanges;
}

document.getElementById('firstName').addEventListener('input', checkForChanges);
document.getElementById('lastName').addEventListener('input', checkForChanges);
document.getElementById('dateOfBirth').addEventListener('input', checkForChanges);
document.getElementById('username').addEventListener('input', checkForChanges);
document.getElementById('password').addEventListener('input', checkForChanges);
document.getElementById('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value || null;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    errorDiv.classList.add('d-none');
    successDiv.classList.add('d-none');

    try {
        const response = await fetch('/api/auth/account', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({firstName, lastName, dateOfBirth, username, password})
        });

        const data = await response.json();

        if (data.success) {
            if (data.requiresReauth) {
                successDiv.textContent = 'Дані успішно оновлено. Вас буде перенаправлено на сторінку входу...';
                successDiv.classList.remove('d-none');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 3000);
            } else {
                successDiv.textContent = 'Дані успішно оновлено';
                successDiv.classList.remove('d-none');
                await loadAccountData();
                document.getElementById('password').value = '';
                document.getElementById('saveBtn').disabled = true;
            }
        } else {
            errorDiv.textContent = data.error || 'Помилка оновлення даних';
            errorDiv.classList.remove('d-none');
        }
    } catch (err) {
        console.error('Помилка оновлення акаунта: ', err);
        errorDiv.textContent = 'Помилка з\'єднання з сервером';
        errorDiv.classList.remove('d-none');
    }
});
document.getElementById('logoutBtn').addEventListener('click', () => {
    const logoutModal = new bootstrap.Modal(document.getElementById('logoutModal'));
    logoutModal.show();
});
document.getElementById('confirmLogout').addEventListener('click', async () => {
    try {
        await fetch('/api/auth/logout', {method: 'POST'});
        window.location.href = '/login';
    } catch (err) {
        console.error('Помилка виходу: ', err);
        alert('Помилка з\'єднання');
    }
});
document.getElementById('deleteAccountBtn').addEventListener('click', () => {
    document.getElementById('deletePasswordConfirm').value = '';
    document.getElementById('deletePasswordError').classList.add('d-none');
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteAccountModal'));
    deleteModal.show();
});
document.getElementById('confirmDeleteAccount').addEventListener('click', async () => {
    const password = document.getElementById('deletePasswordConfirm').value;
    const errorDiv = document.getElementById('deletePasswordError');

    errorDiv.classList.add('d-none');

    if (!password || password.trim().length === 0) {
        errorDiv.textContent = 'Будь ласка, введіть пароль';
        errorDiv.classList.remove('d-none');
        return;
    }

    try {
        const response = await fetch('/api/auth/account', {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({password})
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = '/login';
        } else {
            errorDiv.textContent = data.error || 'Помилка видалення акаунта';
            errorDiv.classList.remove('d-none');
        }
    } catch (err) {
        console.error('Помилка видалення акаунта: ', err);
        errorDiv.textContent = 'Помилка з\'єднання';
        errorDiv.classList.remove('d-none');
    }
});
document.getElementById('toggleDeletePassword').addEventListener('click', function () {
    const passwordInput = document.getElementById('deletePasswordConfirm');
    const eyeIcon = document.getElementById('deleteEyeIcon');
    const eyeSlashIcon = document.getElementById('deleteEyeSlashIcon');

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

document.addEventListener('DOMContentLoaded', () => {
    const blobs = document.querySelectorAll('.blob');
    const container = document.querySelector('.animated-bg-container');

    function getRandom(min, max) {
        return Math.random() * (max - min) + min;
    }

    function generateTransform() {
        const scale = getRandom(1, 2);
        const x = getRandom(-100, container.offsetWidth - 100);
        const y = getRandom(-100, container.offsetHeight - 100);
        const rotate = getRandom(0, 360);
        return `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`;
    }

    blobs.forEach(blob => {
        const size = getRandom(150, 300);
        blob.style.setProperty('--size', `${size}px`);

        const duration = getRandom(10, 20);
        blob.style.setProperty('--duration', `${duration}s`);

        const direction = Math.random() > 0.5 ? 'alternate' : 'alternate-reverse';
        blob.style.setProperty('--direction', direction);
        blob.style.setProperty('--transform-start', generateTransform());
        blob.style.setProperty('--transform-end', generateTransform());
    });
});

initTheme();
loadAccountData();