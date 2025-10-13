const bcrypt = require('bcryptjs');

const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

const TECH_PASSWORD_KEY = 'technical_access_password_hash';

class ServicioAccesoTecnico {
    static async obtenerHashActual() {
        const row = await servicioBaseDatos.obtenerUno(
            'SELECT value FROM system_config WHERE key = $1',
            [TECH_PASSWORD_KEY]
        );

        if (row?.value) {
            return row.value;
        }

        return this.establecerContrasenaPorDefecto();
    }

    static async establecerContrasenaPorDefecto() {
        const contrasenaPorDefecto = process.env.TECH_ADMIN_PASSWORD || 'tecnico123';
        const hash = await bcrypt.hash(contrasenaPorDefecto, config.SECURITY.BCRYPT_ROUNDS);
        await this.guardarHash(hash);
        return hash;
    }

    static async guardarHash(hash) {
        const timestamp = new Date().toISOString();
        await servicioBaseDatos.ejecutar(
            `INSERT INTO system_config (key, value, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
            [TECH_PASSWORD_KEY, hash, timestamp]
        );
    }

    static async verificarContrasena(contrasena) {
        if (!contrasena) {
            throw new ErrorAplicacion('Contraseña técnica requerida', 400, 'MISSING_TECH_PASSWORD');
        }

        const hash = await this.obtenerHashActual();
        const esValida = await bcrypt.compare(contrasena, hash);

        if (!esValida) {
            throw new ErrorAplicacion('Contraseña técnica inválida', 401, 'INVALID_TECH_PASSWORD');
        }

        return true;
    }
}

module.exports = ServicioAccesoTecnico;
