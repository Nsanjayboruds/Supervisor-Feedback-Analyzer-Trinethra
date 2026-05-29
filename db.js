// SQLite database module for persisting analyses
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Initialize SQLite database (creates if not exists)
const dbPath = path.join(__dirname, 'analyses.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open SQLite DB:', err);
  } else {
    console.log('Connected to SQLite DB at', dbPath);
  }
});

// Ensure analyses table exists
const initSql = `
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  analysis TEXT NOT NULL
);
`;

db.exec(initSql, (err) => {
  if (err) console.error('Failed to create analyses table:', err);
});

/**
 * Save an analysis JSON object for a given user.
 * @param {number} userId - ID of the authenticated user.
 * @param {object} analysis - The analysis object to store.
 * @returns {Promise<{id:number}>} Resolves with the inserted row ID.
 */
function saveAnalysis(userId, analysis) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    const sql = `INSERT INTO analyses (user_id, timestamp, analysis) VALUES (?, ?, ?)`;
    db.run(sql, [userId, timestamp, JSON.stringify(analysis)], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID });
    });
  });
}

module.exports = { saveAnalysis };
