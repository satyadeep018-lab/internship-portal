'use strict';

// All SQL lives here and every value is passed as a bound parameter (no string-built queries from input).

const COLUMNS = ['title', 'domain', 'mode', 'location', 'skills', 'openings', 'duration_weeks', 'applications_open'];

const toIso = (s) => s.replace(' ', 'T') + 'Z';

function toApi(r) {
  return {
    id: r.id,
    title: r.title,
    domain: r.domain,
    mode: r.mode,
    location: r.location,
    skills: JSON.parse(r.skills),
    openings: r.openings,
    duration_weeks: r.duration_weeks,
    applications_open: r.applications_open === 1,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at)
  };
}

function toDb(key, value) {
  if (key === 'skills') return JSON.stringify(value);
  if (key === 'applications_open') return value ? 1 : 0;
  return value;
}

const isUniqueViolation = (e) => /UNIQUE constraint failed|PRIMARY KEY/i.test(String(e && e.message));

function createRepository(db) {
  const get = (id) => {
    const r = db.prepare('SELECT * FROM internships WHERE id = ?').get(id);
    return r ? toApi(r) : null;
  };

  const insert = (rec, ignore) => {
    const verb = ignore ? 'INSERT OR IGNORE' : 'INSERT';
    return db.prepare(
      `${verb} INTO internships (id, title, domain, mode, location, skills, openings, duration_weeks, applications_open)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(rec.id, rec.title, rec.domain, rec.mode, rec.location, JSON.stringify(rec.skills),
      rec.openings, rec.duration_weeks ?? null, rec.applications_open === false ? 0 : 1);
  };

  const repo = {
    get,
    isUniqueViolation,

    list({ page, limit, q, domain, mode, open }) {
      const where = [];
      const params = [];
      if (q) {
        const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
        where.push("(title LIKE ? ESCAPE '\\' OR domain LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR skills LIKE ? ESCAPE '\\')");
        params.push(like, like, like, like);
      }
      if (domain) { where.push('domain = ? COLLATE NOCASE'); params.push(domain); }
      if (mode) { where.push('mode = ?'); params.push(mode); }
      if (open !== undefined) { where.push('applications_open = ?'); params.push(open ? 1 : 0); }
      const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

      const total = db.prepare(`SELECT COUNT(*) AS n FROM internships ${clause}`).get(...params).n;
      const rows = db.prepare(`SELECT * FROM internships ${clause} ORDER BY id LIMIT ? OFFSET ?`)
        .all(...params, limit, (page - 1) * limit);
      return { rows: rows.map(toApi), total };
    },

    nextId() {
      const r = db.prepare('SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS n FROM internships').get();
      return 'INT-' + String((r.n || 0) + 1).padStart(3, '0');
    },

    create(data) {
      const rec = { ...data, id: data.id || repo.nextId() };
      insert(rec, false);
      return get(rec.id);
    },

    update(id, fields) {
      const keys = Object.keys(fields).filter((k) => COLUMNS.includes(k));
      if (keys.length) {
        const sets = keys.map((k) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE internships SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(...keys.map((k) => toDb(k, fields[k])), id);
      }
      return get(id);
    },

    remove(id) {
      return db.prepare('DELETE FROM internships WHERE id = ?').run(id).changes > 0;
    },

    hasApplied(internshipId, email) {
      return !!db.prepare('SELECT 1 FROM applications WHERE internship_id = ? AND applicant_email = ?').get(internshipId, email);
    },

    addApplication(internshipId, { name, email, portfolio_url }) {
      const res = db.prepare(
        'INSERT INTO applications (internship_id, applicant_name, applicant_email, portfolio_url) VALUES (?, ?, ?, ?)'
      ).run(internshipId, name, email, portfolio_url);
      const row = db.prepare('SELECT id, internship_id, created_at FROM applications WHERE id = ?').get(res.lastInsertRowid);
      return { id: row.id, internship_id: row.internship_id, created_at: toIso(row.created_at) };
    },

    seedMany(records) {
      let inserted = 0;
      db.exec('BEGIN');
      try {
        for (const r of records) inserted += Number(insert(r, true).changes);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return inserted;
    }
  };
  return repo;
}

module.exports = { createRepository };
