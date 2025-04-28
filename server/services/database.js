import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

class DatabaseService {
	constructor() {
		this.db = null;
		this.initialize();
	}

	initialize() {
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = path.dirname(__filename);

		this.db = new sqlite3.Database(
			path.join(__dirname, "../../data/database.sqlite"),
			(err) => {
				if (err) {
					console.error("Error opening database:", err);
				} else {
					console.log("Connected to the SQLite database.");
					this.createTables();
				}
			}
		);
	}

	createTables() {
		this.db.serialize(() => {
			this.db.run(`
        CREATE TABLE IF NOT EXISTS drawings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL UNIQUE,
          file_path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
		});
	}

	// Generic query methods
	async query(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.db.all(sql, params, (err, rows) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	}

	async getOne(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.db.get(sql, params, (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	}

	async run(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.db.run(sql, params, function (err) {
				if (err) reject(err);
				else resolve({ id: this.lastID, changes: this.changes });
			});
		});
	}

	// Drawing-specific methods
	async createDrawing(title, filePath) {
		try {
			return await this.run(
				"INSERT INTO drawings (title, file_path) VALUES (?, ?)",
				[title, filePath]
			);
		} catch (err) {
			if (err.message.includes("UNIQUE constraint failed")) {
				throw new Error(
					`A drawing with title "${title}" already exists`
				);
			}
			throw err;
		}
	}

	async getDrawingByTitle(title) {
		return this.getOne("SELECT * FROM drawings WHERE title = ?", [title]);
	}

	async getDrawingById(id) {
		return this.getOne("SELECT * FROM drawings WHERE id = ?", [id]);
	}

	async getAllDrawings() {
		return this.query("SELECT * FROM drawings ORDER BY created_at DESC");
	}

	async updateDrawingByTitle(title, newTitle, filePath) {
		try {
			return this.run(
				"UPDATE drawings SET title = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE title = ?",
				[newTitle, filePath, title]
			);
		} catch (err) {
			if (err.message.includes("UNIQUE constraint failed")) {
				throw new Error(
					`A drawing with title "${newTitle}" already exists`
				);
			}
			throw err;
		}
	}

	async deleteDrawingByTitle(title) {
		return this.run("DELETE FROM drawings WHERE title = ?", [title]);
	}
}

// Create a singleton instance
const databaseService = new DatabaseService();
export default databaseService;
