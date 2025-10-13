const servicioBaseDatos = require('./servicioBaseDatos');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

class ServicioClavesAdministrativas {
    static async asegurarInicializacion() {
        return true;
    }

    static async obtenerTodasLasClaves() {
        try {
            const rows = await servicioBaseDatos.obtenerTodos(
                `SELECT key, description, is_active, created_at, deactivated_at
                 FROM admin_keys
                 ORDER BY created_at DESC`
            );

            return rows.map(record => ({
                key: (record.key || '').trim().toUpperCase(),
                description: (record.description || '').trim(),
                is_active: record.is_active === false ? 'false' : 'true',
                created_at: record.created_at instanceof Date ? record.created_at.toISOString() : record.created_at,
                deactivated_at: record.deactivated_at instanceof Date ? record.deactivated_at.toISOString() : record.deactivated_at
            }));
        } catch (error) {
            console.error('❌ Error obteniendo claves administrativas:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudieron obtener las claves administrativas', 500, 'ADMIN_KEYS_LOAD_ERROR');
        }
    }

    static async crearClave(key, description) {
        try {
            const normalizedKey = this.normalizarClave(key);
            const cleanDescription = (description || '').toString().trim();

            if (!normalizedKey) {
                throw new ErrorAplicacion('La clave es requerida', 400, 'ADMIN_KEY_REQUIRED');
            }

            if (normalizedKey.length < 4) {
                throw new ErrorAplicacion('La clave debe tener al menos 4 caracteres', 400, 'ADMIN_KEY_TOO_SHORT');
            }

            if (!cleanDescription) {
                throw new ErrorAplicacion('La descripción es requerida', 400, 'ADMIN_KEY_DESCRIPTION_REQUIRED');
            }

            const existing = await servicioBaseDatos.obtenerUno(
                `SELECT key FROM admin_keys WHERE key = $1 AND is_active = TRUE`,
                [normalizedKey]
            );

            if (existing) {
                throw new ErrorAplicacion('Ya existe una clave activa con ese nombre', 409, 'ADMIN_KEY_DUPLICATED');
            }

            const timestamp = new Date().toISOString();
            const row = await servicioBaseDatos.obtenerUno(
                `INSERT INTO admin_keys (key, description, is_active, created_at)
                 VALUES ($1, $2, TRUE, $3)
                 RETURNING key, description, is_active, created_at, deactivated_at`,
                [normalizedKey, cleanDescription, timestamp]
            );

            console.log(`🔑 Nueva clave administrativa creada: ${normalizedKey}`);

            return {
                key: row.key,
                description: row.description,
                is_active: row.is_active === false ? 'false' : 'true',
                created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
                deactivated_at: row.deactivated_at instanceof Date ? row.deactivated_at.toISOString() : row.deactivated_at
            };
        } catch (error) {
            console.error('❌ Error creando clave administrativa:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo crear la clave administrativa', 500, 'ADMIN_KEY_CREATE_ERROR');
        }
    }

    static async desactivarClave(key) {
        try {
            const normalizedKey = this.normalizarClave(key);

            if (!normalizedKey) {
                throw new ErrorAplicacion('La clave es requerida', 400, 'ADMIN_KEY_REQUIRED');
            }

            const existing = await servicioBaseDatos.obtenerUno(
                `SELECT key, description, is_active, created_at, deactivated_at
                 FROM admin_keys
                 WHERE key = $1`,
                [normalizedKey]
            );

            if (!existing) {
                throw new ErrorAplicacion('Clave administrativa no encontrada', 404, 'ADMIN_KEY_NOT_FOUND');
            }

            if (existing.is_active === false) {
                return {
                    key: existing.key,
                    description: existing.description,
                    is_active: 'false',
                    created_at: existing.created_at instanceof Date ? existing.created_at.toISOString() : existing.created_at,
                    deactivated_at: existing.deactivated_at instanceof Date ? existing.deactivated_at.toISOString() : existing.deactivated_at
                };
            }

            const result = await servicioBaseDatos.obtenerUno(
                `UPDATE admin_keys
                 SET is_active = FALSE,
                     deactivated_at = $2
                 WHERE key = $1
                 RETURNING key, description, is_active, created_at, deactivated_at`,
                [normalizedKey, new Date().toISOString()]
            );

            console.log(`🗝️ Clave administrativa desactivada: ${normalizedKey}`);

            return {
                key: result.key,
                description: result.description,
                is_active: result.is_active === false ? 'false' : 'true',
                created_at: result.created_at instanceof Date ? result.created_at.toISOString() : result.created_at,
                deactivated_at: result.deactivated_at instanceof Date ? result.deactivated_at.toISOString() : result.deactivated_at
            };
        } catch (error) {
            console.error('❌ Error desactivando clave administrativa:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo desactivar la clave administrativa', 500, 'ADMIN_KEY_DEACTIVATE_ERROR');
        }
    }

    static async limpiarTodasLasClaves() {
        await servicioBaseDatos.ejecutar('DELETE FROM admin_keys');
    }

    static normalizarClave(key) {
        if (!key) return '';
        return key.toString().trim().toUpperCase();
    }
}

module.exports = ServicioClavesAdministrativas;
