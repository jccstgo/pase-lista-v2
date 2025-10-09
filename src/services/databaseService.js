const { Pool } = require('pg');

const config = require('../config/server');

class DatabaseService {
    constructor() {
        this.allowedTables = new Set([
            'students',
            'attendances',
            'admins',
            'system_config',
            'admin_keys',
            'devices'
        ]);
        this.pool = new Pool({
            connectionString: config.DATABASE.URL,
            ssl: config.DATABASE.SSL ? { rejectUnauthorized: false } : undefined,
            max: config.DATABASE.MAX_POOL_SIZE,
            idleTimeoutMillis: config.DATABASE.IDLE_TIMEOUT_MS,
            connectionTimeoutMillis: config.DATABASE.CONNECTION_TIMEOUT_MS
        });

        this.pool.on('error', (error) => {
            console.error('❌ Error inesperado en la conexión de PostgreSQL:', error);
        });

        this.ready = this.initialize();
    }

    async initialize() {
        try {
            await this.initializeTables();
            console.log('✅ Conexión a PostgreSQL verificada');
        } catch (error) {
            console.error('❌ Error inicializando la base de datos PostgreSQL:', error);
            throw error;
        }
    }

    async initializeTables() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS students (
                matricula TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                grupo TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
        `);

        await this.pool.query('CREATE INDEX IF NOT EXISTS idx_students_grupo ON students (grupo)');
        await this.pool.query('CREATE INDEX IF NOT EXISTS idx_students_nombre ON students (LOWER(nombre))');

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_login TIMESTAMPTZ,
                login_attempts INTEGER NOT NULL DEFAULT 0,
                lock_until TIMESTAMPTZ
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS attendances (
                id BIGSERIAL PRIMARY KEY,
                matricula TEXT NOT NULL,
                nombre TEXT NOT NULL,
                grupo TEXT NOT NULL,
                attendance_date DATE NOT NULL,
                recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status TEXT NOT NULL DEFAULT 'registered',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await this.pool.query('CREATE INDEX IF NOT EXISTS idx_attendances_matricula ON attendances (matricula)');
        await this.pool.query('CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances (attendance_date)');
        await this.pool.query('CREATE INDEX IF NOT EXISTS idx_attendances_group ON attendances (grupo)');
        await this.pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_daily ON attendances (matricula, attendance_date)');

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS admin_keys (
                key TEXT PRIMARY KEY,
                description TEXT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deactivated_at TIMESTAMPTZ
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS devices (
                device_fingerprint TEXT PRIMARY KEY,
                matricula TEXT,
                first_registration TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                user_agent TEXT
            )
        `);

        await this.pool.query('CREATE INDEX IF NOT EXISTS idx_devices_matricula ON devices (matricula)');
    }

    async query(text, params = []) {
        await this.ready;
        return this.pool.query(text, params);
    }

    async run(text, params = []) {
        return this.query(text, params);
    }

    async get(text, params = []) {
        const result = await this.query(text, params);
        return result.rows[0] || null;
    }

    async all(text, params = []) {
        const result = await this.query(text, params);
        return result.rows;
    }

    async transaction(fn) {
        await this.ready;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async backupDatabase(label = 'backup') {
        console.warn(`⚠️ Respaldo manual no disponible para PostgreSQL (${label})`);
        return null;
    }

    async clearTable(tableName) {
        if (!this.allowedTables.has(tableName)) {
            throw new Error(`Operación no permitida en la tabla ${tableName}`);
        }

        return this.run(`DELETE FROM ${tableName}`);
    }
}

module.exports = new DatabaseService();
