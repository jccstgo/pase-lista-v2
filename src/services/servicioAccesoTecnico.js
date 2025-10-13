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
        return timestamp;
    }

    static validarFortalezaContrasena(password) {
        const errores = [];
        const valor = typeof password === 'string' ? password : String(password || '');

        if (!valor || valor.trim().length === 0) {
            errores.push('La contraseña no puede estar vacía');
        }

        if (valor.length < config.VALIDATION.MIN_PASSWORD_LENGTH) {
            errores.push(`Debe tener al menos ${config.VALIDATION.MIN_PASSWORD_LENGTH} caracteres`);
        }

        if (!/[A-Z]/.test(valor)) {
            errores.push('Debe contener al menos una letra mayúscula');
        }

        if (!/[a-z]/.test(valor)) {
            errores.push('Debe contener al menos una letra minúscula');
        }

        if (!/[0-9]/.test(valor)) {
            errores.push('Debe contener al menos un número');
        }

        if (config.NODE_ENV === 'production') {
            if (!/[!@#$%^&*(),.?":{}|<>]/.test(valor)) {
                errores.push('Debe incluir al menos un carácter especial');
            }

            if (valor.length < 8) {
                errores.push('Debe tener al menos 8 caracteres en producción');
            }
        }

        return {
            esValida: errores.length === 0,
            errores
        };
    }

    static async actualizarContrasena(contrasenaActual, nuevaContrasena) {
        if (!contrasenaActual || !nuevaContrasena) {
            throw new ErrorAplicacion('Contraseña actual y nueva son requeridas', 400, 'MISSING_TECH_PASSWORD_DATA');
        }

        const hashActual = await this.obtenerHashActual();
        const coincideActual = await bcrypt.compare(contrasenaActual, hashActual);

        if (!coincideActual) {
            throw new ErrorAplicacion('La contraseña técnica actual es incorrecta', 400, 'INVALID_CURRENT_TECH_PASSWORD');
        }

        const esMismaContrasena = await bcrypt.compare(nuevaContrasena, hashActual);
        if (esMismaContrasena) {
            throw new ErrorAplicacion('La nueva contraseña técnica debe ser diferente a la actual', 400, 'TECH_PASSWORD_UNCHANGED');
        }

        const validacion = this.validarFortalezaContrasena(nuevaContrasena);
        if (!validacion.esValida) {
            throw new ErrorAplicacion(
                `La nueva contraseña técnica no cumple los requisitos: ${validacion.errores.join(', ')}`,
                400,
                'WEAK_TECH_PASSWORD'
            );
        }

        const nuevoHash = await bcrypt.hash(nuevaContrasena, config.SECURITY.BCRYPT_ROUNDS);
        const updatedAt = await this.guardarHash(nuevoHash);

        return {
            updatedAt
        };
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
