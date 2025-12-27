CREATE TABLE Customers
(
    id            SERIAL PRIMARY KEY,
    first_name    VARCHAR(50) NOT NULL,
    last_name     VARCHAR(50) NOT NULL,
    date_of_birth DATE
);

CREATE TABLE Users
(
    id          SERIAL PRIMARY KEY,
    customer_id INTEGER      NOT NULL UNIQUE,
    username    VARCHAR(50)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES Customers (id) ON DELETE CASCADE
);

CREATE TYPE task_status AS ENUM ('active', 'completed');

CREATE TABLE Tasks
(
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER                      NOT NULL,
    title       VARCHAR(50)                  NOT NULL,
    description TEXT,
    deadline    TIMESTAMP,
    priority    BOOLEAN     DEFAULT FALSE,
    status      task_status DEFAULT 'active' NOT NULL,
    created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE
);

CREATE TABLE Categories
(
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE TaskCategories
(
    task_id     INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, category_id),
    FOREIGN KEY (task_id) REFERENCES Tasks (id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES Categories (id) ON DELETE CASCADE
);

CREATE TYPE notification_type AS ENUM ('task_created', 'task_deleted', 'task_updated', 'deadline_approaching', 'task_completed', 'user_login', 'deadline_expired');

CREATE TABLE Notifications
(
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER           NOT NULL,
    task_id    INTEGER,
    type       notification_type NOT NULL,
    message    VARCHAR(255)      NOT NULL,
    is_read    BOOLEAN   DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES Tasks (id) ON DELETE SET NULL
);

INSERT INTO Categories (name)
VALUES ('Мої'),
       ('Важливі'),
       ('Заплановані'),
       ('Завершені')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE Customers ADD COLUMN avatar BYTEA;