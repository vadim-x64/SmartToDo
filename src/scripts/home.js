let selectedTasks = new Set();
let notificationModalOpen = false;
let searchTimeout = null;
let sortTimeout = null;
let currentSort = '';
const notificationSound = new Audio('/static/notification.mp3');
let lastNotificationCount = 0;

async function loadUserAvatar() {
    try {
        const response = await fetch('/api/auth/avatar');
        const data = await response.json();
        const avatarImg = document.getElementById('userProfileAvatar');

        if (data.success && data.avatar) {
            avatarImg.src = data.avatar;
        } else {
            avatarImg.src = '/static/default.png';
        }
    } catch (err) {
        console.error('Помилка завантаження аватара:', err);
        document.getElementById('userProfileAvatar').src = '/static/default.png';
    }
}

document.getElementById('sortSelect').addEventListener('change', async (e) => {
    clearTimeout(sortTimeout);
    const sortValue = e.target.value;
    currentSort = sortValue;

    if (!sortValue) {
        hideSearchResults();
        return;
    }

    sortTimeout = setTimeout(() => {
        sortTasks(sortValue);
    }, 300);
});

async function sortTasks(sortValue) {
    try {
        const query = document.getElementById('searchInput').value.trim();
        const response = await fetch(`/api/tasks/sorted?sort=${encodeURIComponent(sortValue)}&q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.success) {
            await displaySearchResults(data.tasks, query, true);
        }
    } catch (err) {
        console.error('Помилка сортування: ', err);
    }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    if (query.length === 0) {
        hideSearchResults();
        return;
    }

    searchTimeout = setTimeout(() => {
        searchTasks(query);
    }, 300);
});

async function searchTasks(query) {
    try {
        const currentSort = document.getElementById('sortSelect').value;

        if (currentSort) {
            await sortTasks(currentSort);
        } else {
            const response = await fetch(`/api/tasks/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.success) {
                await displaySearchResults(data.tasks, query);
            }
        }
    } catch (err) {
        console.error('Помилка пошуку: ', err);
    }
}

async function displaySearchResults(tasks, query = '', isSorting = false) {
    const searchResults = document.getElementById('searchResults');
    const searchResultsList = document.getElementById('searchResultsList');
    const searchCount = document.getElementById('searchCount');

    searchCount.textContent = tasks.length;

    if (tasks.length === 0) {
        searchResultsList.innerHTML = '<div class="no-results">Нічого не знайдено</div>';
        searchResults.classList.remove('d-none');
        return;
    }

    const tasksWithCategories = await Promise.all(tasks.map(async (task) => {
        try {
            const response = await fetch(`/api/tasks/${task.id}/categories`);
            const data = await response.json();
            task.categories = data.success ? data.categories : [];
        } catch (err) {
            task.categories = [];
        }
        return task;
    }));

    searchResultsList.innerHTML = tasksWithCategories.map(task => {
        const isCompleted = task.status === 'completed';
        const strike = isCompleted ? 'text-decoration: line-through; color: #AAAAAA;' : '';
        const priorityStar = task.priority ? '★' : '☆';
        const deadlineIcon = task.deadline ? '⏱' : '';
        const created = new Date(task.created_at).toLocaleString('uk-UA');
        const updated = new Date(task.updated_at).toLocaleString('uk-UA');
        const deadlineInfo = task.deadline ? `<small class="text-muted d-block">Термін: ${new Date(task.deadline).toLocaleString('uk-UA')}</small>` : '';

        const categoryBadges = task.categories
            .map(cat => `<span class="badge me-1">${cat.name}</span>`)
            .join('');

        const titleText = isSorting ? task.title : highlightMatch(task.title, query);

        return `
            <div class="task-item d-flex align-items-center gap-3" data-task-id="${task.id}" data-task-title="${task.title}">
                <div class="task-select" data-task-id="${task.id}"></div>
                <input type="checkbox" class="form-check-input task-complete m-0" ${isCompleted ? 'checked' : ''}>
                <div class="flex-grow-1">
                    <span class="task-title d-block" style="${strike}">${titleText}</span>
                    <div class="mt-1">${categoryBadges}</div>
                    ${deadlineInfo}
                </div>
                ${deadlineIcon ? `<span class="task-deadline-icon">${deadlineIcon}</span>` : ''}
                <button class="task-pin" data-pinned="${task.pinned || false}">
                    <i class="bi ${task.pinned ? 'bi-pin-fill' : 'bi-pin'}"></i>
                </button>
                <button class="task-priority">${priorityStar}</button>
                <button class="task-delete">❌️</button>
                <div class="txt-muted">
                    <small class="text-muted">Створено: ${created}</small>
                    <small class="text-muted">Оновлено: ${updated}</small>
                </div>
            </div>
        `;
    }).join('');

    searchResults.classList.remove('d-none');
    attachSearchResultsHandlers();
}

function highlightMatch(text, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function hideSearchResults() {
    document.getElementById('searchResults').classList.add('d-none');
    document.getElementById('searchResultsList').innerHTML = '';
    document.getElementById('sortSelect').value = '';
    currentSort = '';
}

function attachSearchResultsHandlers() {
    const searchResultsList = document.getElementById('searchResultsList');

    searchResultsList.querySelectorAll('.task-select').forEach(selectBtn => {
        selectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = selectBtn.dataset.taskId;

            if (selectedTasks.has(taskId)) {
                selectedTasks.delete(taskId);
                selectBtn.classList.remove('selected');
            } else {
                selectedTasks.add(taskId);
                selectBtn.classList.add('selected');
            }

            updateSelectionToolbar();
        });
    });

    searchResultsList.querySelectorAll('.task-complete').forEach(cb => {
        cb.addEventListener('change', async () => {
            const taskId = cb.closest('.task-item').dataset.taskId;
            await fetch(`/api/tasks/${taskId}/complete`, {method: 'PUT'});
            const query = document.getElementById('searchInput').value.trim();
            await searchTasks(query);
            await loadPinnedTasks();
            await updateCategoryCounts();
            await loadUnreadCount();
        });
    });

    searchResultsList.querySelectorAll('.task-priority').forEach(btn => {
        btn.addEventListener('click', async () => {
            const taskId = btn.closest('.task-item').dataset.taskId;
            await fetch(`/api/tasks/${taskId}/priority`, {method: 'PUT'});
            const query = document.getElementById('searchInput').value.trim();
            await searchTasks(query);
            await loadPinnedTasks();
            await updateCategoryCounts();
            await loadUnreadCount();
        });
    });


    searchResultsList.querySelectorAll('.task-title').forEach(title => {
        title.addEventListener('click', async () => {
            const taskId = title.closest('.task-item').dataset.taskId;

            try {
                const resp = await fetch(`/api/tasks/${taskId}`);
                const d = await resp.json();

                if (d.success) {
                    document.getElementById('editTaskId').value = d.task.id;
                    document.getElementById('editTaskTitle').value = d.task.title;
                    document.getElementById('editTaskDescription').value = d.task.description || '';

                    if (d.task.deadline) {
                        let localDateTime = '';
                        if (d.task.deadline) {
                            const deadlineDate = new Date(d.task.deadline);
                            // Форматуємо для input type="datetime-local"
                            const year = deadlineDate.getFullYear();
                            const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
                            const day = String(deadlineDate.getDate()).padStart(2, '0');
                            const hours = String(deadlineDate.getHours()).padStart(2, '0');
                            const minutes = String(deadlineDate.getMinutes()).padStart(2, '0');
                            localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                        }
                        document.getElementById('editTaskDeadline').value = localDateTime;

                    } else {
                        document.getElementById('editTaskDeadline').value = '';
                    }

                    document.getElementById('editTaskPriority').checked = d.task.priority;

                    const editModal = new bootstrap.Modal(document.getElementById('taskDetailModal'));
                    editModal.show();
                }
            } catch (err) {
                console.error('Помилка завантаження деталей: ', err);
            }
        });
    });

    searchResultsList.querySelectorAll('.task-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const taskItem = btn.closest('.task-item');
            const taskId = taskItem.dataset.taskId;
            const taskTitle = taskItem.dataset.taskTitle;

            document.getElementById('deleteTaskTitle').textContent = taskTitle;

            const deleteModal = new bootstrap.Modal(document.getElementById('deleteTaskModal'));
            deleteModal.show();

            document.getElementById('confirmDeleteTask').onclick = async () => {
                try {
                    const response = await fetch(`/api/tasks/${taskId}`, {method: 'DELETE'});
                    const data = await response.json();

                    if (data.success) {
                        deleteModal.hide();

                        // Видаляємо колір стікера для видаленого завдання
                        let taskColors = JSON.parse(localStorage.getItem('taskStickerColors') || '{}');
                        delete taskColors[taskId];
                        localStorage.setItem('taskStickerColors', JSON.stringify(taskColors));

                        const query = document.getElementById('searchInput').value.trim();
                        await searchTasks(query);
                        await loadPinnedTasks();
                        await loadCategories();
                        await loadUnreadCount();
                    } else {
                        alert(data.error || 'ПомилкА видалення');
                    }
                } catch (err) {
                    console.error('Помилка видалення: ', err);
                    alert('Помилка з\'єднання');
                }
            };
        });
    });

    searchResultsList.querySelectorAll('.task-pin').forEach(btn => {
        btn.addEventListener('click', async () => {
            const taskId = btn.closest('.task-item').dataset.taskId;
            await fetch(`/api/tasks/${taskId}/pin`, {method: 'PUT'});
            const query = document.getElementById('searchInput').value.trim();
            await searchTasks(query);
            await loadPinnedTasks();
            await updateCategoryCounts();
            await loadUnreadCount();
        });
    });
}

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/login';
        } else {
            const username = data.user.username;

            document.getElementById('welcomeMessage').innerHTML =
                `Привіт, <span class="username-link">${username}</span>!`;

            // document.querySelector('.username-link').addEventListener('click', () => {
            //     window.location.href = '/account';
            // });

            await loadCategories();
            await loadPinnedTasks();
            await loadUnreadCount();
        }
    } catch (err) {
        window.location.href = '/login';
    }
}

async function loadCategories() {
    clearSelection();

    try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        const categoriesList = document.getElementById('categoriesList');

        if (data.success && data.categories.length > 0) {
            categoriesList.innerHTML = data.categories.map(category => `
                <div class="category-card" data-category-id="${category.id}">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">${category.name}</h5>
                        <span class="badge">${category.task_count}</span>
                    </div>
                    <div class="tasks-list d-none"></div>
                </div>
            `).join('');

            document.querySelectorAll('.category-card').forEach(card => {
                card.addEventListener('click', async (e) => {
                    if (e.target.closest('.task-complete, .task-priority, .task-title, .task-pin, .task-delete, .task-select')) return;

                    const tasksList = card.querySelector('.tasks-list');
                    const id = card.dataset.categoryId;

                    if (tasksList.classList.contains('d-none')) {
                        await loadTasksForCategory(card, id);
                        tasksList.classList.remove('d-none');
                    } else {
                        tasksList.classList.add('d-none');
                    }
                });
            });
        } else {
            categoriesList.innerHTML = '<p class="text-muted text-center">Категорії не знайдено</p>';
        }
    } catch (err) {
        console.error('Помилка завантаження категорій: ', err);
        document.getElementById('categoriesList').innerHTML = '<p class="text-danger text-center">Помилка завантаження категорій</p>';
    }
}

const stickerBackgrounds = [
    '/static/stickers/yellow.png',
    '/static/stickers/blue.png',
    '/static/stickers/green.png',
    '/static/stickers/pink.png',
];

let shuffledStickers = [];

function shuffle(array) {
    return array
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

function getRandomSticker() {
    if (shuffledStickers.length === 0) {
        shuffledStickers = shuffle([...stickerBackgrounds]);
    }

    return shuffledStickers.pop();
}

function calculateStickerPosition(index, totalCount) {
    const isLeft = index % 2 === 0;
    const verticalOffset = Math.floor(index / 2) * 250;

    const position = {
        left: isLeft ? '30px' : 'auto',
        right: isLeft ? 'auto' : '30px',
        top: `${verticalOffset}px`
    };

    // Повністю випадковий кут нахилу від -15 до +15 градусів
    const rotation = Math.random() * 30 - 15;

    return { position, rotation };
}

async function loadPinnedTasks() {
    try {
        const response = await fetch('/api/tasks?pinned=true');
        const data = await response.json();

        let pinnedContainer = document.getElementById('pinnedTasksContainer');

        if (!pinnedContainer) {
            pinnedContainer = document.createElement('div');
            pinnedContainer.id = 'pinnedTasksContainer';
            pinnedContainer.className = 'pinned-tasks-container';
            document.body.appendChild(pinnedContainer);
        }

        if (data.success && data.tasks.length > 0) {
            const pinnedTasks = data.tasks.filter(task => task.pinned);

            let taskColors = JSON.parse(localStorage.getItem('taskStickerColors') || '{}');

            pinnedContainer.innerHTML = pinnedTasks.map((task, index) => {
                const priorityStar = task.priority ? '⭐' : '';
                const deadlineIcon = task.deadline ? '⏱' : '';

                if (!taskColors[task.id]) {
                    taskColors[task.id] = getRandomSticker();
                }

                const randomBg = taskColors[task.id];
                const { position, rotation } = calculateStickerPosition(index, pinnedTasks.length);

                return `
                    <div class="pinned-task-note" 
                         data-task-id="${task.id}"
                         style="background-image: url('${randomBg}'); 
                                transform: rotate(${rotation}deg);
                                left: ${position.left};
                                right: ${position.right};
                                top: ${position.top};">
                        <div class="pinned-task-title">${task.title}</div>
                        <div class="pinned-task-meta">
                            ${priorityStar ? `<span class="badge">Важливі</span>` : ''}
                            ${deadlineIcon ? `<span class="badge">Заплановані</span>` : ''}
                        </div>
                        <div class="pinned-task-actions">
                            <button class="task-pin-remove" data-task-id="${task.id}" title="Відкріпити">
                                <i class="bi bi-pin-fill"></i>
                            </button>
                            <button class="task-delete-pinned" data-task-id="${task.id}" title="Видалити">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            localStorage.setItem('taskStickerColors', JSON.stringify(taskColors));
            attachPinnedTaskHandlers();
        } else {
            pinnedContainer.innerHTML = '';
        }
    } catch (err) {
        console.error('Помилка завантаження закріплених завдань: ', err);
    }
}

function attachPinnedTaskHandlers() {
    document.querySelectorAll('.pinned-task-note').forEach(note => {
        const taskId = note.dataset.taskId;

        note.addEventListener('click', async (e) => {
            if (e.target.closest('.task-pin-remove') || e.target.closest('.task-delete-pinned')) {
                return;
            }

            try {
                const resp = await fetch(`/api/tasks/${taskId}`);
                const d = await resp.json();

                if (d.success) {
                    document.getElementById('editTaskId').value = d.task.id;
                    document.getElementById('editTaskTitle').value = d.task.title;
                    document.getElementById('editTaskDescription').value = d.task.description || '';

                    if (d.task.deadline) {
                        let localDateTime = '';
                        if (d.task.deadline) {
                            const deadlineDate = new Date(d.task.deadline);
                            // Форматуємо для input type="datetime-local"
                            const year = deadlineDate.getFullYear();
                            const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
                            const day = String(deadlineDate.getDate()).padStart(2, '0');
                            const hours = String(deadlineDate.getHours()).padStart(2, '0');
                            const minutes = String(deadlineDate.getMinutes()).padStart(2, '0');
                            localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                        }
                        document.getElementById('editTaskDeadline').value = localDateTime;

                    } else {
                        document.getElementById('editTaskDeadline').value = '';
                    }

                    document.getElementById('editTaskPriority').checked = d.task.priority;

                    const editModal = new bootstrap.Modal(document.getElementById('taskDetailModal'));
                    editModal.show();
                }
            } catch (err) {
                console.error('Помилка завантаження деталей: ', err);
            }
        });
    });

    document.querySelectorAll('.task-pin-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.taskId;
            const noteElement = btn.closest('.pinned-task-note');

            // ОДРАЗУ ховаємо таску і запускаємо вибух
            explodeTask(noteElement);
            let taskColors = JSON.parse(localStorage.getItem('taskStickerColors') || '{}');
            delete taskColors[taskId];
            localStorage.setItem('taskStickerColors', JSON.stringify(taskColors));
            // Після анімації відкріплюємо завдання
            fetch(`/api/tasks/${taskId}/pin`, {method: 'PUT'})
                .then(() => {
                    // Оновлюємо тільки категорії, БЕЗ loadPinnedTasks()
                    loadCategories();
                });

            setTimeout(async () => {
                noteElement.remove();
            }, 0);
        });
    });

    document.querySelectorAll('.task-delete-pinned').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.taskId;

            const taskItem = document.querySelector(`.pinned-task-note[data-task-id="${taskId}"]`);
            const taskTitle = taskItem.querySelector('.pinned-task-title').textContent;

            document.getElementById('deleteTaskTitle').textContent = taskTitle;

            const deleteModal = new bootstrap.Modal(document.getElementById('deleteTaskModal'));
            deleteModal.show();

            document.getElementById('confirmDeleteTask').onclick = async () => {
                try {
                    const response = await fetch(`/api/tasks/${taskId}`, {method: 'DELETE'});
                    const data = await response.json();

                    if (data.success) {
                        deleteModal.hide();

                        explodeTask(taskItem);

                        let taskColors = JSON.parse(localStorage.getItem('taskStickerColors') || '{}');
                        delete taskColors[taskId];
                        localStorage.setItem('taskStickerColors', JSON.stringify(taskColors));

                        setTimeout(() => {
                            taskItem.remove();
                        }, 0);

                        await loadCategories();
                        await loadUnreadCount();
                    } else {
                        alert(data.error || 'Помилка видалення');
                    }
                } catch (err) {
                    console.error('Помилка видалення: ', err);
                    alert('Помилка з\'єднання');
                }
            };
        });
    });
}

function getStickerColor(backgroundImageUrl) {
    if (backgroundImageUrl.includes('yellow')) {
        return ['#FFE87C', '#FFD700', '#FFC107', '#FFEB3B', '#FFF59D'];
    } else if (backgroundImageUrl.includes('blue')) {
        return ['#81D4FA', '#4FC3F7', '#29B6F6', '#03A9F4', '#B3E5FC'];
    } else if (backgroundImageUrl.includes('green')) {
        return ['#A5D6A7', '#81C784', '#66BB6A', '#4CAF50', '#C8E6C9'];
    } else if (backgroundImageUrl.includes('pink')) {
        return ['#F48FB1', '#F06292', '#EC407A', '#E91E63', '#F8BBD0'];
    }
    return ['#FFE87C', '#FFD700', '#FFC107'];
}

function explodeTask(element) {
    const rect = element.getBoundingClientRect();
    const bgImage = window.getComputedStyle(element).backgroundImage;
    const colors = getStickerColor(bgImage);

    // Відтворюємо звук вибуху
    const explosionSound = new Audio('/static/pop.mp3');
    explosionSound.volume = 0.3;
    explosionSound.play().catch(err => console.log('Звук не відтворився:', err));

    // ОДРАЗУ ховаємо оригінальну таску
    element.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out';
    element.style.opacity = '0';
    element.style.transform = 'scale(0.8)';

    const particleCount = 120; // Більше частинок для круцього ефекту
    const gridSize = Math.ceil(Math.sqrt(particleCount));
    const cellWidth = rect.width / gridSize;
    const cellHeight = rect.height / gridSize;

    // Розбиваємо таску на сітку шматків
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const particle = document.createElement('div');
            particle.className = 'dissolve-particle';

            // Розмір шматка
            const size = Math.random() * 12 + 6;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;

            // Колір з палітри стікера
            const color = colors[Math.floor(Math.random() * colors.length)];
            particle.style.backgroundColor = color;

            // Позиція шматка = позиція в сітці оригінальної таски
            const startX = rect.left + col * cellWidth + cellWidth / 2;
            const startY = rect.top + row * cellHeight + cellHeight / 2;

            particle.style.left = `${startX}px`;
            particle.style.top = `${startY}px`;

            // Вектор вибуху від центру таски
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const dx = startX - centerX;
            const dy = startY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Нормалізуємо і додаємо випадковість + гравітацію
            const explosionForce = 250 + Math.random() * 200;
            const tx = (dx / (distance || 1)) * explosionForce + (Math.random() - 0.5) * 80;
            const ty = (dy / (distance || 1)) * explosionForce + (Math.random() - 0.5) * 80 + Math.random() * 120;

            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);
            particle.style.setProperty('--rotation', `${Math.random() * 1080 - 540}deg`);

            // Без затримки - всі частинки летять одночасно
            particle.style.animationDelay = '0ms';
            particle.style.animationDuration = `${0.8 + Math.random() * 0.4}s`; // Різна тривалість для природності

            document.body.appendChild(particle);

            // Видаляємо частинку після анімації
            setTimeout(() => {
                particle.remove();
            }, 2000);
        }
    }
}

async function updateCategoryCounts() {
    try {
        const response = await fetch('/api/categories');
        const data = await response.json();

        if (data.success && data.categories.length > 0) {
            data.categories.forEach(category => {
                const card = document.querySelector(`.category-card[data-category-id="${category.id}"]`);

                if (card) {
                    const badge = card.querySelector('.badge');

                    if (badge) {
                        badge.textContent = category.task_count;
                    }
                }
            });
        }
    } catch (err) {
        console.error('Помилка оновлення лічильників: ', err);
    }
}

async function loadTasksForCategory(card, categoryId) {
    const tasksList = card.querySelector('.tasks-list');

    try {
        const response = await fetch(`/api/tasks?category_id=${categoryId}`);
        const data = await response.json();

        if (data.success) {
            tasksList.innerHTML = data.tasks.length > 0 ? data.tasks.map(task => {
                const isCompleted = task.status === 'completed';
                const strike = isCompleted ? 'text-decoration: line-through; color: #AAAAAA;' : '';
                const priorityStar = task.priority ? '★' : '☆';
                const deadlineIcon = task.deadline ? '⏱' : '';
                const created = new Date(task.created_at).toLocaleString('uk-UA');
                const updated = new Date(task.updated_at).toLocaleString('uk-UA');
                return `
    <div class="task-item d-flex align-items-center gap-3 py-3" data-task-id="${task.id}" data-task-title="${task.title}">
        <div class="task-select" data-task-id="${task.id}"></div>
        <input type="checkbox" class="form-check-input task-complete m-0" ${isCompleted ? 'checked' : ''}>
        <span class="task-title flex-grow-1" style="${strike}">${task.title}</span>
        ${deadlineIcon ? `<span class="task-deadline-icon">${deadlineIcon}</span>` : ''}
        <button class="task-pin" data-pinned="${task.pinned || false}">
            <i class="bi ${task.pinned ? 'bi-pin-fill' : 'bi-pin'}"></i>
        </button>
        <button class="task-priority">${priorityStar}</button>
        <button class="task-delete">❌️</button>
        <div class="txt-muted">
            <small class="text-muted ms-auto">Створено: ${created}</small>
            <small class="text-muted ms-auto">Оновлено: ${updated}</small>
        </div>
    </div>
`;;;}).join('') : '<p class="text-muted text-center py-3">Немає завдань у цій категорії.</p>';

            tasksList.querySelectorAll('.task-complete').forEach(cb => {
                cb.addEventListener('change', async () => {
                    const taskId = cb.closest('.task-item').dataset.taskId;
                    await fetch(`/api/tasks/${taskId}/complete`, {method: 'PUT'});
                    await loadTasksForCategory(card, categoryId);
                    await loadPinnedTasks();
                    await updateCategoryCounts();
                    await loadUnreadCount();
                });
            });

            tasksList.querySelectorAll('.task-priority').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.closest('.task-item').dataset.taskId;
                    await fetch(`/api/tasks/${taskId}/priority`, {method: 'PUT'});
                    await loadTasksForCategory(card, categoryId);
                    await loadPinnedTasks();
                    await updateCategoryCounts();
                    await loadUnreadCount();
                });
            });

            tasksList.querySelectorAll('.task-pin').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.closest('.task-item').dataset.taskId;
                    await fetch(`/api/tasks/${taskId}/pin`, {method: 'PUT'});
                    await loadTasksForCategory(card, categoryId);
                    await loadPinnedTasks();
                    await updateCategoryCounts();
                    await loadUnreadCount();
                });
            });

            tasksList.querySelectorAll('.task-title').forEach(title => {
                title.addEventListener('click', async () => {
                    const taskId = title.closest('.task-item').dataset.taskId;

                    try {
                        const resp = await fetch(`/api/tasks/${taskId}`);
                        const d = await resp.json();

                        if (d.success) {
                            document.getElementById('editTaskId').value = d.task.id;
                            document.getElementById('editTaskTitle').value = d.task.title;
                            document.getElementById('editTaskDescription').value = d.task.description || '';

                            if (d.task.deadline) {
                                let localDateTime = '';
                                if (d.task.deadline) {
                                    const deadlineDate = new Date(d.task.deadline);
                                    // Форматуємо для input type="datetime-local"
                                    const year = deadlineDate.getFullYear();
                                    const month = String(deadlineDate.getMonth() + 1).padStart(2, '0');
                                    const day = String(deadlineDate.getDate()).padStart(2, '0');
                                    const hours = String(deadlineDate.getHours()).padStart(2, '0');
                                    const minutes = String(deadlineDate.getMinutes()).padStart(2, '0');
                                    localDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                                }

                                document.getElementById('editTaskDeadline').value = localDateTime;
                            } else {
                                document.getElementById('editTaskDeadline').value = '';
                            }

                            document.getElementById('editTaskPriority').checked = d.task.priority;

                            const editModal = new bootstrap.Modal(document.getElementById('taskDetailModal'));
                            editModal.show();
                        }
                    } catch (err) {
                        console.error('Помилка завантаження деталей: ', err);
                    }
                });
            });

            tasksList.querySelectorAll('.task-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const taskItem = btn.closest('.task-item');
                    const taskId = taskItem.dataset.taskId;
                    const taskTitle = taskItem.dataset.taskTitle;

                    document.getElementById('deleteTaskTitle').textContent = taskTitle;

                    const deleteModal = new bootstrap.Modal(document.getElementById('deleteTaskModal'));
                    deleteModal.show();

                    document.getElementById('confirmDeleteTask').onclick = async () => {
                        try {
                            const response = await fetch(`/api/tasks/${taskId}`, {method: 'DELETE'});
                            const data = await response.json();

                            if (data.success) {
                                deleteModal.hide();
                                let taskColors = JSON.parse(localStorage.getItem('taskStickerColors') || '{}');
                                delete taskColors[taskId];
                                localStorage.setItem('taskStickerColors', JSON.stringify(taskColors));

                                await loadTasksForCategory(card, categoryId);
                                await loadPinnedTasks();
                                await updateCategoryCounts();
                                await loadUnreadCount();
                            } else {
                                alert(data.error || 'Помилка видалення');
                            }
                        } catch (err) {
                            console.error('Помилка видалення: ', err);
                            alert('Помилка з\'єднання');
                        }
                    };

                });
            });

            tasksList.querySelectorAll('.task-select').forEach(selectBtn => {
                selectBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const taskId = selectBtn.dataset.taskId;

                    if (selectedTasks.has(taskId)) {
                        selectedTasks.delete(taskId);
                        selectBtn.classList.remove('selected');
                    } else {
                        selectedTasks.add(taskId);
                        selectBtn.classList.add('selected');
                    }

                    updateSelectionToolbar();
                });
            });
        }
    } catch (err) {
        console.error('Помилка завантаження завдань: ', err);
        tasksList.innerHTML = '<p class="text-danger text-center py-3">Помилка завантаження завдань</p>';
    }
}

async function loadUnreadCount() {
    try {
        const response = await fetch('/api/notifications/unread-count');
        const data = await response.json();
        const badge = document.getElementById('notificationBadge');

        if (data.success && data.count > 0) {
            badge.textContent = data.count;
            badge.classList.remove('d-none');

            if (data.count > lastNotificationCount && lastNotificationCount !== 0) {
                notificationSound.play().catch(err => {
                    console.log('Не вдалось відтворити звук:', err);
                });
            }

            lastNotificationCount = data.count;
        } else {
            badge.classList.add('d-none');
            lastNotificationCount = 0;
        }
    } catch (err) {
        console.error('Помилка завантаження кількості сповіщень: ', err);
    }
}

checkAuth().then(async () => {
    await loadUserAvatar();

    const response = await fetch('/api/notifications/unread-count');
    const data = await response.json();
    const badge = document.getElementById('notificationBadge');

    if (data.success && data.count > 0) {
        badge.textContent = data.count;
        badge.classList.remove('d-none');
        lastNotificationCount = data.count;
    } else {
        badge.classList.add('d-none');
        lastNotificationCount = 0;
    }
});

async function deleteAllNotifications() {
    try {
        const response = await fetch('/api/notifications', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            await loadNotifications();
            await loadUnreadCount();

            document.getElementById('deleteAllNotificationsBtn').classList.add('d-none');
        }
    } catch (err) {
        console.error('Помилка видалення всіх сповіщень: ', err);
    }
}

async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications');
        const data = await response.json();
        const body = document.getElementById('notificationBody');
        const deleteBtn = document.getElementById('deleteAllNotificationsBtn');

        if (data.success && data.notifications.length > 0) {
            deleteBtn.classList.remove('d-none');

            body.innerHTML = data.notifications.map(notif => {
                const date = new Date(notif.created_at);
                const timeAgo = formatTimeAgo(date);

                return `
                        <div class="notification-item ${!notif.is_read ? 'unread' : ''}"
                             data-id="${notif.id}"
                             data-read="${notif.is_read}">
                            ${!notif.is_read ? '<div class="notification-dot"></div>' : '<div></div>'}
                            <div class="notification-content">
                                <p class="notification-message">${notif.message}</p>
                                <div class="notification-time">${timeAgo}</div>
                            </div>
                        </div>
                    `;
            }).join('');

            document.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.id;
                    const isRead = item.dataset.read === 'true';

                    if (!isRead) {
                        await markAsRead(id);
                        item.classList.remove('unread');
                        item.querySelector('.notification-dot')?.remove();
                        item.dataset.read = 'true';
                        await loadUnreadCount();
                    }
                });
            });
        } else {
            deleteBtn.classList.add('d-none');

            body.innerHTML = `
                    <div class="empty-notifications">
                        <div>📭</div>
                        <p>Немає сповіщень</p>
                    </div>
                `;
        }
    } catch (err) {
        console.error('Помилка завантаження сповіщень: ', err);
        document.getElementById('notificationBody').innerHTML =
            '<p class="text-danger text-center p-3">Помилка завантаження сповіщень</p>';
    }
}

document.getElementById('deleteAllNotificationsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const modal = new bootstrap.Modal(document.getElementById('deleteAllNotificationsModal'));
    modal.show();
});

document.getElementById('confirmDeleteAllNotifications').addEventListener('click', async () => {
    await deleteAllNotifications();
    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteAllNotificationsModal'));
    if (modal) modal.hide();
});

async function markAsRead(id) {
    try {
        await fetch(`/api/notifications/${id}/read`, {
            method: 'PUT'
        });
    } catch (err) {
        console.error('Помилка позначення як прочитане: ', err);
    }
}

async function markAllAsRead() {
    try {
        await fetch('/api/notifications/mark-all-read', {
            method: 'PUT'
        });
        await loadNotifications();
        await loadUnreadCount();
    } catch (err) {
        console.error('Помилка позначення всіх як прочитані: ', err);
    }
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Щойно';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} хв тому`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} год тому`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} дн тому`;

    return date.toLocaleDateString('uk-UA');
}

document.getElementById('notificationBtn').addEventListener('click', () => {
    const modal = document.getElementById('notificationModal');
    notificationModalOpen = !notificationModalOpen;

    if (notificationModalOpen) {
        modal.classList.add('show');
        loadNotifications();
    } else {
        modal.classList.remove('show');
    }
});

document.getElementById('markAllRead').addEventListener('click', (e) => {
    e.stopPropagation();
    markAllAsRead();
});

document.addEventListener('click', (e) => {
    const modal = document.getElementById('notificationModal');
    const btn = document.getElementById('notificationBtn');

    if (notificationModalOpen && !modal.contains(e.target) && !btn.contains(e.target)) {
        modal.classList.remove('show');
        notificationModalOpen = false;
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
        const logoutModal = bootstrap.Modal.getInstance(document.getElementById('logoutModal'));
        if (logoutModal) logoutModal.hide();
        alert('Помилка з\'єднання');
    }
});

checkAuth();
setInterval(loadUnreadCount, 30000);

document.getElementById('createTaskBtn').addEventListener('click', () => {
    const createModal = new bootstrap.Modal(document.getElementById('createTaskModal'));
    createModal.show();
});

document.getElementById('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const deadline = document.getElementById('taskDeadline').value;
    const priority = document.getElementById('taskPriority').checked;

    if (!title) return alert('Назва обов\'язкова');

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, description, deadline, priority})
        });

        const data = await response.json();

        if (data.success) {
            const createModal = bootstrap.Modal.getInstance(document.getElementById('createTaskModal'));
            createModal.hide();
            document.getElementById('createTaskForm').reset();
            await loadCategories();
            await loadPinnedTasks();
            await loadUnreadCount();
        } else {
            alert(data.error || 'Помилка створення');
        }
    } catch (err) {
        console.error('Помилка створення: ', err);
        alert('Помилка з\'єднання');
    }
});

document.getElementById('deleteAllBtn').addEventListener('click', () => {
    const deleteAllModal = new bootstrap.Modal(document.getElementById('deleteAllTasksModal'));
    deleteAllModal.show();
});

document.getElementById('confirmDeleteAll').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/tasks', {method: 'DELETE'});
        const data = await response.json();

        if (data.success) {
            const deleteAllModal = bootstrap.Modal.getInstance(document.getElementById('deleteAllTasksModal'));
            deleteAllModal.hide();

            await loadCategories();
            await loadPinnedTasks();
            await loadUnreadCount();
        } else {
            alert(data.error || 'Помилка видалення');
        }
    } catch (err) {
        console.error('Помилка видалення всіх завдань: ', err);
        alert('Помилка з\'єднання');
    }
});

function updateSelectionToolbar() {
    const toolbar = document.getElementById('selectionToolbar');
    const countSpan = document.getElementById('selectedCount');

    countSpan.textContent = selectedTasks.size;

    if (selectedTasks.size > 0) {
        toolbar.classList.add('show');
    } else {
        toolbar.classList.remove('show');
    }
}

function clearSelection() {
    selectedTasks.clear();
    document.querySelectorAll('.task-select.selected').forEach(sel => {
        sel.classList.remove('selected');
    });
    updateSelectionToolbar();
}

document.getElementById('cancelSelectionBtn').addEventListener('click', () => {
    clearSelection();
});

document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
    if (selectedTasks.size === 0) return;

    document.getElementById('deleteSelectedCount').textContent = selectedTasks.size;
    const deleteSelectedModal = new bootstrap.Modal(document.getElementById('deleteSelectedModal'));
    deleteSelectedModal.show();
});

document.getElementById('confirmDeleteSelected').addEventListener('click', async () => {
    try {
        const taskIds = Array.from(selectedTasks);

        const response = await fetch('/api/tasks/delete-selected', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({taskIds})
        });

        const data = await response.json();

        if (data.success) {
            const deleteSelectedModal = bootstrap.Modal.getInstance(document.getElementById('deleteSelectedModal'));
            deleteSelectedModal.hide();

            clearSelection();

            await loadCategories();
            await loadPinnedTasks();
            await loadUnreadCount();
        } else {
            alert(data.error || 'Помилка видалення');
        }
    } catch (err) {
        console.error('Помилка видалення вибраних завдань: ', err);
        alert('Помилка з\'єднання');
    }
});

const originalEditTaskFormHandler = document.getElementById('editTaskForm').onsubmit;

document.getElementById('editTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const taskId = document.getElementById('editTaskId').value;
    const title = document.getElementById('editTaskTitle').value;
    const description = document.getElementById('editTaskDescription').value;
    const deadline = document.getElementById('editTaskDeadline').value;
    const priority = document.getElementById('editTaskPriority').checked;

    if (!title) return alert('Назва обов\'язкова');

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, description, deadline, priority})
        });

        const data = await response.json();

        if (data.success) {
            const editModal = bootstrap.Modal.getInstance(document.getElementById('taskDetailModal'));
            editModal.hide();
            document.getElementById('editTaskForm').reset();

            const query = document.getElementById('searchInput').value.trim();

            if (query.length > 0) {
                await searchTasks(query);
            }

            await loadCategories();
            await loadPinnedTasks();
            await loadUnreadCount();
        } else {
            alert(data.error || 'Помилка оновлення');
        }
    } catch (err) {
        console.error('Помилка оновлення: ', err);
        alert('Помилка з\'єднання');
    }
});

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

function initTheme() {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

document.getElementById('themeToggleBtn').addEventListener('click', () => {
    toggleTheme();
});

initTheme();

document.getElementById('exportBtn').addEventListener('click', async () => {
    const exportModal = new bootstrap.Modal(document.getElementById('exportFormatModal'));
    exportModal.show();
});

document.querySelectorAll('.export-option').forEach(option => {
    option.addEventListener('click', async function() {
        const format = this.dataset.format;
        const exportModal = bootstrap.Modal.getInstance(document.getElementById('exportFormatModal'));
        exportModal.hide();

        await exportTasks(format);
    });
});

async function exportTasks(format) {
    try {
        const response = await fetch(`/api/tasks/export?format=${format}`);

        if (!response.ok) {
            return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const date = new Date().toISOString().split('T')[0];
        a.download = format === 'json'
            ? `tasks_${date}.json`
            : `tasks_${date}.html`;

        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        await loadUnreadCount();
    } catch (err) {
        console.error('Помилка експорту: ', err);
    }
}

document.getElementById('importBtn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];

        if (!file) return;

        try {
            const text = await file.text();
            const tasks = JSON.parse(text);

            const response = await fetch('/api/tasks/import', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({tasks})
            });

            const data = await response.json();

            if (data.success) {
                await loadCategories();
                await loadPinnedTasks();
                await loadUnreadCount();
            } else {
                alert(data.error || 'Помилка імпорту');
            }
        } catch (err) {
            console.error('Помилка імпорту: ', err);
        }
    };

    input.click();
});

function setMinDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const minDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

    document.getElementById('taskDeadline').setAttribute('min', minDateTime);
    document.getElementById('editTaskDeadline').setAttribute('min', minDateTime);
}

document.getElementById('selectAllBtn').addEventListener('click', () => {
    const allTaskSelectors = document.querySelectorAll('.task-select');

    allTaskSelectors.forEach(selector => {
        const taskId = selector.dataset.taskId;
        if (!selectedTasks.has(taskId)) {
            selectedTasks.add(taskId);
            selector.classList.add('selected');
        }
    });

    updateSelectionToolbar();
});

document.getElementById('completeAllSelectedBtn').addEventListener('click', async () => {
    if (selectedTasks.size === 0) return;

    try {
        const taskIds = Array.from(selectedTasks);

        const promises = taskIds.map(taskId =>
            fetch(`/api/tasks/${taskId}/complete`, {method: 'PUT'})
        );

        await Promise.all(promises);
        clearSelection();

        const query = document.getElementById('searchInput').value.trim();

        if (query.length > 0) {
            await searchTasks(query);
        }

        await loadCategories();
        await loadPinnedTasks();
        await loadUnreadCount();
    } catch (err) {
        console.error('Помилка позначення завдань як виконаних: ', err);
        alert('Помилка з\'єднання');
    }
});

setMinDateTime();
setInterval(setMinDateTime, 60000);

let currentPhraseIndex = 0;
let phrases = [];
let typingTimeout;
let phraseTimeout;

async function loadPhrases() {
    try {
        const response = await fetch('/static/phrases.json');
        const data = await response.json();
        phrases = data.phrases;
        phrases = phrases.sort(() => Math.random() - 0.5);

        setTimeout(() => {
            typePhrase();
        }, 1000);
    } catch (err) {
        console.error('Помилка завантаження фраз: ', err);
    }
}

function typePhrase() {
    const element = document.querySelector('h4');
    const phrase = phrases[currentPhraseIndex];
    let charIndex = 0;
    element.textContent = '';

    function typeChar() {
        if (charIndex < phrase.length) {
            element.textContent += phrase[charIndex];
            charIndex++;
            typingTimeout = setTimeout(typeChar, 50);
        } else {
            phraseTimeout = setTimeout(() => {
                erasePhrase();
            }, 2000);
        }
    }

    typeChar();
}

function erasePhrase() {
    const element = document.querySelector('h4');
    let text = element.textContent;

    function eraseChar() {
        if (text.length > 0) {
            text = text.slice(0, -1);
            element.textContent = text;
            typingTimeout = setTimeout(eraseChar, 30);
        } else {
            currentPhraseIndex = (currentPhraseIndex + 1) % phrases.length;
            phraseTimeout = setTimeout(() => {
                typePhrase();
            }, 1000);
        }
    }

    eraseChar();
}

loadPhrases();