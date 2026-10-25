-- SQLite schema for the internship API. Applied automatically on start-up (safe to run repeatedly).
CREATE TABLE IF NOT EXISTS internships (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  domain            TEXT NOT NULL,
  mode              TEXT NOT NULL CHECK (mode IN ('Remote', 'Hybrid', 'On-site')),
  location          TEXT NOT NULL,
  skills            TEXT NOT NULL,                 -- JSON array of strings
  openings          INTEGER NOT NULL CHECK (openings >= 0),
  duration_weeks    INTEGER CHECK (duration_weeks IS NULL OR duration_weeks > 0),
  applications_open INTEGER NOT NULL DEFAULT 1 CHECK (applications_open IN (0, 1)),
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  internship_id   TEXT NOT NULL,
  applicant_name  TEXT NOT NULL,
  applicant_email TEXT NOT NULL,                   -- stored lower-case
  portfolio_url   TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (internship_id, applicant_email),
  FOREIGN KEY (internship_id) REFERENCES internships(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_internships_domain ON internships(domain);
CREATE INDEX IF NOT EXISTS idx_internships_mode ON internships(mode);
