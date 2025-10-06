const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const config = require('../config/server');

class DatabaseService {
    constructor() {
        this.dbPath = config.DATABASE.FILE;
        this.allowedTables = new Set(['students']);
        this.ensureDirectories();
        this.db = new Database(this.dbPath);
        this.configure();
        this.initializeTables();
    }

    ensureDirectories() {
        const dataDir = path.dirname(this.dbPath);
        fs.mkdirSync(dataDir, { recursive: true });

        if (config.DATABASE.BACKUP_DIR) {
            fs.mkdirSync(config.DATABASE.BACKUP_DIR, { recursive: true });
        }
    }

    configure() {
        const pragmas = {
            journal_mode: 'WAL',
            synchronous: 'NORMAL',
            cache_size: -16000,
            foreign_keys: 'ON',
            ...config.DATABASE.PRAGMA
        };

        Object.entries(pragmas).forEach(([key, value]) => {
            this.db.pragma(`${key} = ${value}`);
        });
    }

    initializeTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS students (
                matricula TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                grupo TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_students_grupo ON students (grupo);
            CREATE INDEX IF NOT EXISTS idx_students_nombre ON students (nombre);
        `);
    }

    prepare(sql) {
        return this.db.prepare(sql);
    }

    run(sql, params = {}) {
        return this.prepare(sql).run(params);
    }

    get(sql, params = {}) {
        return this.prepare(sql).get(params);
    }

    all(sql, params = {}) {
        return this.prepare(sql).all(params);
    }

    transaction(fn) {
        return this.db.transaction(fn);
    }

    backupDatabase(label = 'backup') {
        if (!config.DATABASE.BACKUP_DIR) {
            return null;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_');
        const backupFile = path.join(
            config.DATABASE.BACKUP_DIR,
            `${sanitizedLabel}-${timestamp}.sqlite`
        );

        fs.copyFileSync(this.dbPath, backupFile);
        return backupFile;
    }

    clearTable(tableName) {
        if (!this.allowedTables.has(tableName)) {
            throw new Error(`Operación no permitida en la tabla ${tableName}`);
        }

        return this.run(`DELETE FROM ${tableName}`);
    }
}

module.exports = new DatabaseService();
