let originalData = {};
let isOAuthUser = false;
let hasAvatar = false;
let cropper = null;

// Елементи для кропера
const imageToCrop = document.getElementById('imageToCrop');
const cropModalElement = document.getElementById('cropModal');
// Перевірка на існування елементів, щоб уникнути помилок, якщо HTML ще не оновлено
const cropModal = cropModalElement ? new bootstrap.Modal(cropModalElement) : null;

async function loadAccountData() {
    try {
        const response = await fetch('/api/auth/account');
        const data = await response.json();

        if (data.success) {
            isOAuthUser = data.account.is_oauth || false;

            const passwordSection = document.getElementById('passwordSection');
            if (isOAuthUser && passwordSection) {
                passwordSection.style.display = 'none';
            }

            const usernameHint = document.getElementById('usernameHint');
            if (isOAuthUser && usernameHint) {
                usernameHint.style.display = 'none';
            }

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

            await updateUserInfoCard();
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

// --- Слухачі подій форми ---
document.getElementById('firstName').addEventListener('input', () => {
    checkForChanges();
    updateUserInfoCard();
});
document.getElementById('lastName').addEventListener('input', () => {
    checkForChanges();
    updateUserInfoCard();
});
document.getElementById('email').addEventListener('input', checkForChanges);
document.getElementById('dateOfBirth').addEventListener('input', checkForChanges);
document.getElementById('username').addEventListener('input', () => {
    checkForChanges();
    updateUserInfoCard();
});
if (!isOAuthUser) {
    document.getElementById('password').addEventListener('input', checkForChanges);
}

// --- Відправка форми оновлення даних ---
document.getElementById('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('email').value;
    const dateOfBirth = document.getElementById('dateOfBirth').value || null;
    const username = document.getElementById('username').value;
    const password = isOAuthUser ? '' : document.getElementById('password').value;

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

// --- Логіка виходу та видалення ---
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

// --- Показати/Сховати пароль ---
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

// --- Ініціалізація та утиліти ---
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

        if (data.success && data.avatar) {
            avatarImg.src = data.avatar;
            hasAvatar = true;
        } else {
            avatarImg.src = '/static/default.png';
            hasAvatar = false;
        }
    } catch (err) {
        console.error('Помилка завантаження аватара:', err);
        hasAvatar = false;
    }
}

async function updateUserInfoCard() {
    try {
        const firstName = document.getElementById('firstName').value || '';
        const username = document.getElementById('username').value || '';

        document.getElementById('userFullName').textContent = `${firstName}`.trim() || 'Ім\'я';
        document.getElementById('userUsernameDisplay').textContent = `@${username}`;
    } catch (err) {
        console.error('Помилка оновлення інформації користувача:', err);
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

// ==========================================
// ЛОГІКА АВАТАРА (ЗМІНЕНО ДЛЯ CROPPER.JS)
// ==========================================

// Відкриття модального вікна дій при кліку на аватар
document.getElementById('avatarWrapper').addEventListener('click', () => {
    const setBtn = document.getElementById('setAvatarBtn');
    const replaceBtn = document.getElementById('replaceAvatarBtn');
    const deleteBtn = document.getElementById('deleteAvatarBtnModal');
    const editBtn = document.getElementById('editAvatarBtn'); // Кнопка "Редагувати"

    // Якщо ми ще не додали кнопку в HTML, цей код не впаде, але кнопка не з'явиться
    if (hasAvatar) {
        setBtn.style.display = 'none';
        replaceBtn.style.display = 'block';
        deleteBtn.style.display = 'block';
        if (editBtn) editBtn.style.display = 'block';
    } else {
        setBtn.style.display = 'block';
        replaceBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
    }

    const avatarModal = new bootstrap.Modal(document.getElementById('avatarActionsModal'));
    avatarModal.show();
});

// Кнопки виклику input file
document.getElementById('setAvatarBtn').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
    bootstrap.Modal.getInstance(document.getElementById('avatarActionsModal')).hide();
});

document.getElementById('replaceAvatarBtn').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
    bootstrap.Modal.getInstance(document.getElementById('avatarActionsModal')).hide();
});

// Кнопка видалення аватара
document.getElementById('deleteAvatarBtnModal').addEventListener('click', () => {
    // Закриваємо модалку з діями
    bootstrap.Modal.getInstance(document.getElementById('avatarActionsModal')).hide();

    // Відкриваємо модалку підтвердження видалення
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteAvatarModal'));
    deleteModal.show();
});

// Кнопка редагування поточного
const editAvatarBtn = document.getElementById('editAvatarBtn');
if (editAvatarBtn) {
    editAvatarBtn.addEventListener('click', () => {
        const currentSrc = document.getElementById('avatarImage').src;
        bootstrap.Modal.getInstance(document.getElementById('avatarActionsModal')).hide();

        // Відкриваємо кропер з поточним зображенням
        imageToCrop.src = currentSrc;
        openCropModal();
    });
}

// Обробка вибору файлу
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
    reader.onload = (event) => {
        // Замість негайного завантаження, відкриваємо модалку кропу
        imageToCrop.src = event.target.result;
        openCropModal();
        e.target.value = ''; // Скидаємо input, щоб можна було обрати той самий файл
    };

    reader.onerror = () => {
        showError('Помилка читання файлу');
        e.target.value = '';
    };

    reader.readAsDataURL(file);
});

// Функція відкриття модалки кропу
function openCropModal() {
    if (!cropModal) return;
    cropModal.show();

    // Ініціалізація кропера тільки коли модалка показана (щоб коректно розрахувати розміри)
    cropModalElement.addEventListener('shown.bs.modal', initCropperOnce);
}

function initCropperOnce() {
    // Якщо кропер вже існує, знищуємо його перед створенням нового
    if (cropper) {
        cropper.destroy();
    }

    cropper = new Cropper(imageToCrop, {
        aspectRatio: 1, // Квадрат
        viewMode: 1,    // Обмежити рамку розмірами картинки
        dragMode: 'move',
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
    });

    // Видаляємо слухач, щоб він не спрацьовував багаторазово
    cropModalElement.removeEventListener('shown.bs.modal', initCropperOnce);
}

// Кнопка "Зберегти" в модалці кропу
const cropAndSaveBtn = document.getElementById('cropAndSaveBtn');
if (cropAndSaveBtn) {
    cropAndSaveBtn.addEventListener('click', async () => {
        if (!cropper) return;

        // Отримуємо обрізане зображення
        const canvas = cropper.getCroppedCanvas({
            width: 400,
            height: 400,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        if (!canvas) {
            showError('Не вдалося обробити зображення');
            return;
        }

        // Конвертуємо в Base64
        const base64Image = canvas.toDataURL('image/jpeg', 0.9);

        // Відправляємо на сервер
        await uploadAvatar(base64Image);

        // Закриваємо модалку
        cropModal.hide();
    });
}

// Очищення при закритті модалки
if (cropModalElement) {
    cropModalElement.addEventListener('hidden.bs.modal', () => {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        imageToCrop.src = '';
    });
}

// Функція завантаження на сервер (винесена окремо)
async function uploadAvatar(base64Data) {
    try {
        const response = await fetch('/api/auth/avatar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({avatar: base64Data})
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
}

// Видалення аватара (стандартна логіка)
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

// --- Анімація Blobs ---
document.addEventListener('DOMContentLoaded', () => {
    loadAvatar();
    updateUserInfoCard();

    const blobs = document.querySelectorAll('.blob');
    const container = document.querySelector('.animated-bg-container');

    if (!container) return;

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

// Виправлення для backdrop при закритті модалок
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('hidden.bs.modal', () => {
        // Видаляємо всі backdrop'и якщо немає відкритих модалок
        setTimeout(() => {
            if (!document.querySelector('.modal.show')) {
                document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
                    backdrop.remove();
                });
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }
        }, 100);
    });
});