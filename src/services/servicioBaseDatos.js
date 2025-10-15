const { Pool } = require('pg');

const config = require('../config/server');

class ServicioBaseDatos {
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

        this.listo = this.inicializar();
    }

    async inicializar() {
        try {
            await this.inicializarTablas();
            console.log('✅ Conexión a PostgreSQL verificada');
        } catch (error) {
            console.error('❌ Error inicializando la base de datos PostgreSQL:', error);
            throw error;
        }
    }

    async inicializarTablas() {
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
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                device_fingerprint TEXT,
                user_agent TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // Agregar columnas si no existen (migración)
        await this.pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_name='attendances' AND column_name='latitude') THEN
                    ALTER TABLE attendances ADD COLUMN latitude DECIMAL(10, 8);
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_name='attendances' AND column_name='longitude') THEN
                    ALTER TABLE attendances ADD COLUMN longitude DECIMAL(11, 8);
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_name='attendances' AND column_name='device_fingerprint') THEN
                    ALTER TABLE attendances ADD COLUMN device_fingerprint TEXT;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_name='attendances' AND column_name='user_agent') THEN
                    ALTER TABLE attendances ADD COLUMN user_agent TEXT;
                END IF;
            END $$;
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

    async consultar(texto, parametros = []) {
        await this.listo;
        return this.pool.query(texto, parametros);
    }

    async ejecutar(texto, parametros = []) {
        return this.consultar(texto, parametros);
    }

    async obtenerUno(texto, parametros = []) {
        const resultado = await this.consultar(texto, parametros);
        return resultado.rows[0] || null;
    }

    async obtenerTodos(texto, parametros = []) {
        const resultado = await this.consultar(texto, parametros);
        return resultado.rows;
    }

    async transaccion(fn) {
        await this.listo;
        const cliente = await this.pool.connect();
        try {
            await cliente.query('BEGIN');
            const resultado = await fn(cliente);
            await cliente.query('COMMIT');
            return resultado;
        } catch (error) {
            await cliente.query('ROLLBACK');
            throw error;
        } finally {
            cliente.release();
        }
    }

    async respaldarBaseDatos(label = 'backup') {
        console.warn(`⚠️ Respaldo manual no disponible para PostgreSQL (${label})`);
        return null;
    }

    async limpiarTabla(nombreTabla) {
        if (!this.allowedTables.has(nombreTabla)) {
            throw new Error(`Operación no permitida en la tabla ${nombreTabla}`);
        }

        return this.ejecutar(`DELETE FROM ${nombreTabla}`);
    }
}

module.exports = new ServicioBaseDatos();
