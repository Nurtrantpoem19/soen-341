CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND length(email) <= 254),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 100),
    last_name TEXT NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 100),
    phone TEXT NOT NULL CHECK (length(trim(phone)) BETWEEN 1 AND 50),
    location TEXT NOT NULL CHECK (length(trim(location)) BETWEEN 1 AND 200),
    headline TEXT NOT NULL CHECK (length(trim(headline)) BETWEEN 1 AND 200),
    summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS resumes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS resumes_user_id_idx ON resumes(user_id);
