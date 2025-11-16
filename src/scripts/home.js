let selectedTasks = new Set();
let notificationModalOpen = false;

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/login';
        } else {
            document.getElementById('welcomeMessage').textContent =
                `Привіт, ${data.user.username}! Час перевірити свої справи...`;
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
            }).join('') : '<p class="text-muted text-center py-3">Немає завдань у цій категорії</p>';
            tasksList.querySelectorAll('.task-complete').forEach(cb => {
                cb.addEventListener('change', async () => {
                    const taskId = cb.closest('.task-item').dataset.taskId;
                    await fetch(`/api/tasks/${taskId}/complete`, {method: 'PUT'});
                    await loadTasksForCategory(card, categoryId);
                    await loadUnreadCount();
                });
            });
            tasksList.querySelectorAll('.task-priority').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const taskId = btn.closest('.task-item').dataset.taskId;
                    await fetch(`/api/tasks/${taskId}/priority`, {method: 'PUT'});
                    await loadTasksForCategory(card, categoryId);
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