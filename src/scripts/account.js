let originalData = {};
let isOAuthUser = false;

async function loadAccountData() {
    try {
        const response = await fetch('/api/auth/account');
        const data = await response.json();

        if (data.success) {
            isOAuthUser = data.account.is_oauth || false; // Зберігаємо статус OAuth

            // Ховаємо поле пароля для OAuth користувачів
            const passwordSection = document.getElementById('passwordSection');
            if (isOAuthUser && passwordSection) {
                passwordSection.style.display = 'none';
            }

            // Форматуємо дату для input type="date"
            let formattedDate = '';
            if (data.account.date_of_birth) {
                const date = new Date(data.account.date_of_birth);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                formattedDate = `${year}-${month}-${day}`;
            }

            originalData = {
                firstName: data.account.first_name,
                lastName: data.account.last_name,
                email: data.account.email || '',
                dateOfBirth: formattedDate,
                username: data.account.username
            };

            document.getElementById('firstName').value = originalData.firstName;
            document.getElementById('lastName').value = originalData.lastName;
            document.getElementById('email').value = originalData.email;
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
    const email = document.getElementById('email').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value;
    const username = document.getElementById('username').value;
    const password = isOAuthUser ? '' : document.getElementById('password').value;

    const hasChanges =
        firstName !== originalData.firstName ||
        lastName !== originalData.lastName ||
        email !== originalData.email ||
        dateOfBirth !== originalData.dateOfBirth ||
        username !== originalData.username ||
        password.length > 0;

    document.getElementById('saveBtn').disabled = !hasChanges;
}

document.getElementById('firstName').addEventListener('input', checkForChanges);
document.getElementById('lastName').addEventListener('input', checkForChanges);
document.getElementById('email').addEventListener('input', checkForChanges);
document.getElementById('dateOfBirth').addEventListener('input', checkForChanges);
document.getElementById('username').addEventListener('input', checkForChanges);
document.getElementById('password').addEventListener('input', checkForChanges);

document.getElementById('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('email').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value || null;
    const username = document.getElementById('username').value;
    const password = isOAuthUser ? '' : document.getElementById('password').value; // Не відправляємо пароль для OAuth

    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    errorDiv.classList.add('d-none');
    successDiv.classList.add('d-none');

    try {
        const response = await fetch('/api/auth/account', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({firstName, lastName, email, dateOfBirth, username, password})
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
                if (!isOAuthUser) {
                    document.getElementById('password').value = '';
                }
                document.getElementById('saveBtn').disabled = true;

                try {
                    const notificationSound = new Audio('/static/notification.mp3');
                    await notificationSound.play();
                } catch (err) {
                    console.log('Не вдалося відтворити звук:', err);
                }
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

    // Ховаємо секцію пароля для OAuth користувачів
    const deletePasswordSection = document.getElementById('deletePasswordSection');
    if (isOAuthUser && deletePasswordSection) {
        deletePasswordSection.style.display = 'none';
    } else if (deletePasswordSection) {
        deletePasswordSection.style.display = 'block';
    }

    const deleteModal = new bootstrap.Modal(document.getElementById('deleteAccountModal'));
    deleteModal.show();
});

document.getElementById('confirmDeleteAccount').addEventListener('click', async () => {
    const errorDiv = document.getElementById('deletePasswordError');
    errorDiv.classList.add('d-none');

    let password = '';

    // Для не-OAuth користувачів вимагаємо пароль
    if (!isOAuthUser) {
        password = document.getElementById('deletePasswordConfirm').value;

        if (!password || password.trim().length === 0) {
            errorDiv.textContent = 'Будь ласка, введіть пароль';
            errorDiv.classList.remove('d-none');
            return;
        }
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

document.getElementById('togglePassword').addEventListener('click', function () {
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

async function loadAvatar() {
    try {
        const response = await fetch('/api/auth/avatar');
        const data = await response.json();
        const avatarImg = document.getElementById('avatarImage');
        const plusIcon = document.getElementById('avatarPlusIcon');
        const updateIcon = document.getElementById('avatarUpdateIcon');
        const deleteBtn = document.getElementById('deleteAvatarBtn');

        if (data.success && data.avatar) {
            avatarImg.src = data.avatar;
            plusIcon.classList.add('d-none');
            updateIcon.classList.remove('d-none');
            deleteBtn.disabled = false;
        } else {
            avatarImg.src = '/static/default.png';
            plusIcon.classList.remove('d-none');
            updateIcon.classList.add('d-none');
            deleteBtn.disabled = true;
        }
    } catch (err) {
        console.error('Помилка завантаження аватара:', err);
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    successDiv.classList.add('d-none');
    errorDiv.textContent = message;
    errorDiv.classList.remove('d-none');

    setTimeout(() => {
        errorDiv.classList.add('d-none');
    }, 5000);
}

function showSuccess(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');
    errorDiv.classList.add('d-none');
    successDiv.textContent = message;
    successDiv.classList.remove('d-none');

    setTimeout(() => {
        successDiv.classList.add('d-none');
    }, 5000);
}

document.querySelector('.avatar-wrapper').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
});

document.getElementById('avatarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/jfif'];
    const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.jfif'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
        showError('Невірний формат файлу! Підтримуються тільки: PNG, JPG, JPEG, JFIF, GIF');
        e.target.value = '';
        return;
    }

    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        showError('Відео та аудіо файли не підтримуються! Завантажуйте тільки зображення.');
        e.target.value = '';
        return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        showError(`Файл занадто великий (${fileSizeMB}MB). Максимальний розмір: 10MB`);
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const response = await fetch('/api/auth/avatar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({avatar: event.target.result})
            });

            const data = await response.json();

            if (data.success) {
                showSuccess('Аватар успішно оновлено');
                await loadAvatar();

                try {
                    const notificationSound = new Audio('/static/notification.mp3');
                    await notificationSound.play();
                } catch (err) {
                    console.log('Не вдалося відтворити звук:', err);
                }
            } else {
                showError(data.error || 'Помилка оновлення аватара');
            }
        } catch (err) {
            console.error('Помилка завантаження аватара:', err);
            showError('Помилка з\'єднання з сервером');
        }

        e.target.value = '';
    };

    reader.onerror = () => {
        showError('Помилка читання файлу');
        e.target.value = '';
    };

    reader.readAsDataURL(file);
});

document.getElementById('deleteAvatarBtn').addEventListener('click', () => {
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteAvatarModal'));
    deleteModal.show();
});

document.getElementById('confirmDeleteAvatar').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/auth/avatar', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Аватар успішно видалено');
            await loadAvatar();

            const modal = bootstrap.Modal.getInstance(document.getElementById('deleteAvatarModal'));
            modal.hide();

            try {
                const notificationSound = new Audio('/static/notification.mp3');
                await notificationSound.play();
            } catch (err) {
                console.log('Не вдалося відтворити звук:', err);
            }
        } else {
            showError(data.error || 'Помилка видалення аватара');
        }
    } catch (err) {
        console.error('Помилка видалення аватара:', err);
        showError('Помилка з\'єднання');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadAvatar();

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

initTheme();
loadAccountData();