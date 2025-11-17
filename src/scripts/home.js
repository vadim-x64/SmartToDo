let selectedTasks = new Set();
let notificationModalOpen = false;
let searchTimeout = null;

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
        const response = await fetch(`/api/tasks/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.success) {
            await displaySearchResults(data.tasks, query);
        }
    } catch (err) {
        console.error('Помилка пошуку: ', err);
    }
}

async function displaySearchResults(tasks, query) {
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
        const created = new Date(task.created_at).toLocaleString('uk-UA');
        const updated = new Date(task.updated_at).toLocaleString('uk-UA');

        const categoryBadges = task.categories
            .map(cat => `<span class="badge me-1">${cat.name}</span>`)
            .join('');

        return `
            <div class="task-item d-flex align-items-center gap-3" data-task-id="${task.id}" data-task-title="${task.title}">
                <div class="task-select" data-task-id="${task.id}"></div>
                <input type="checkbox" class="form-check-input task-complete m-0" ${isCompleted ? 'checked' : ''}>
                <div class="flex-grow-1">
                    <span class="task-title d-block" style="${strike}">${highlightMatch(task.title, query)}</span>
                    <div class="mt-1">${categoryBadges}</div>
                </div>
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
                        const deadlineDate = new Date(d.task.deadline);
                        const localDateTime = new Date(deadlineDate.getTime() - deadlineDate.getTimezoneOffset() * 60000)
                            .toISOString()
                            .slice(0, 16);
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
                        const query = document.getElementById('searchInput').value.trim();
                        await searchTasks(query);
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

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/login';
        } else {
            document.getElementById('welcomeMessage').textContent =
                `Привіт, ${data.user.username}! Настав момент організувати свій день.`;
            await loadCategories();
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
                    if (e.target.closest('.task-complete, .task-priority, .task-title')) return;
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
                const created = new Date(task.created_at).toLocaleString('uk-UA');
                const updated = new Date(task.updated_at).toLocaleString('uk-UA');
                return `
        <div class="task-item d-flex align-items-center gap-3 py-3" data-task-id="${task.id}" data-task-title="${task.title}">
            <div class="task-select" data-task-id="${task.id}"></div>
            <input type="checkbox" class="form-check-input task-complete m-0" ${isCompleted ? 'checked' : ''}>
            <span class="task-title flex-grow-1" style="${strike}">${task.title}</span>
            <button class="task-priority">${priorityStar}</button>
            <button class="task-delete">❌️</button>
            <div class="txt-muted">
                <small class="text-muted ms-auto">Створено: ${created}</small>
                <small class="text-muted ms-auto">Оновлено: ${updated}</small>
            </div>
        </div>
    `;
            }).join('') : '<p class="text-muted text-center py-3">Немає завдань у цій категорії.</p>';
            tasksList.querySelectorAll('.task-complete').forEach(cb => {
                cb.addEventListener('change', async () => {
                    const taskId = cb.closest('.task-item').dataset.taskId;
                    await fetch(`/api/tasks/${taskId}/complete`, {method: 'PUT'});
                    await loadTasksForCategory(card, categoryId);
                    await updateCategoryCounts();
                    await loadUnreadCount();
                });
            });
            tasksList.querySelectorAll('.task-priority').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.closest('.task-item').dataset.taskId;
                    await fetch(`/api/tasks/${taskId}/priority`, {method: 'PUT'});
                    await loadTasksForCategory(card, categoryId);
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
                                const deadlineDate = new Date(d.task.deadline);
                                const localDateTime = new Date(deadlineDate.getTime() - deadlineDate.getTimezoneOffset() * 60000)
                                    .toISOString()
                                    .slice(0, 16);
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
                                await loadTasksForCategory(card, categoryId);
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
        } else {
            badge.classList.add('d-none');
        }
    } catch (err) {
        console.error('Помилка завантаження кількості сповіщень: ', err);
    }
}

async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications');
        const data = await response.json();
        const body = document.getElementById('notificationBody');

        if (data.success && data.notifications.length > 0) {
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
    try {
        const response = await fetch('/api/tasks/export');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tasks_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        await loadUnreadCount();
    } catch (err) {
        console.error('Помилка експорту: ', err);
    }
});

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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks })
            });

            const data = await response.json();

            if (data.success) {
                await loadCategories();
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

setMinDateTime();
setInterval(setMinDateTime, 60000);