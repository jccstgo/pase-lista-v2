const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');
const ServicioClavesAdministrativas = require('./servicioClavesAdministrativas');

class ServicioConfiguracion {
    static async asegurarInicializacion() {
        try {
            const rows = await servicioBaseDatos.obtenerTodos('SELECT key FROM system_config');
            const existingKeys = new Set(rows.map(row => row.key));
            const timestamp = new Date().toISOString();

            const operations = [];
            Object.entries(config.DEFAULT_SYSTEM_CONFIG).forEach(([key, value]) => {
                if (!existingKeys.has(key)) {
                    operations.push(
                        servicioBaseDatos.ejecutar(
                            `INSERT INTO system_config (key, value, updated_at)
                             VALUES ($1, $2, $3)
                             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
                            [key, value, timestamp]
                        )
                    );
                }
            });

            await Promise.all(operations);
        } catch (error) {
            console.error('❌ Error asegurando configuración del sistema:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo inicializar la configuración', 500, 'CONFIG_INIT_ERROR');
        }
    }

    static async obtenerConfiguracionSistema() {
        try {
            await this.asegurarInicializacion();

            const rows = await servicioBaseDatos.obtenerTodos('SELECT key, value, updated_at FROM system_config');
            const baseConfig = { ...config.DEFAULT_SYSTEM_CONFIG };
            let updatedAt = null;

            rows.forEach(row => {
                if (!row.key) return;
                const key = row.key.trim();
                const value = row.value ?? '';
                baseConfig[key] = value;

                if (row.updated_at) {
                    const rowDate = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;
                    if (!updatedAt || new Date(rowDate) > new Date(updatedAt)) {
                        updatedAt = rowDate;
                    }
                }
            });

            if (updatedAt) {
                baseConfig.updated_at = updatedAt;
            }

            return baseConfig;
        } catch (error) {
            console.error('❌ Error obteniendo configuración del sistema:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo obtener la configuración del sistema', 500, 'CONFIG_LOAD_ERROR');
        }
    }

    static async guardarConfiguracionSistema(newConfig = {}) {
        try {
            await this.asegurarInicializacion();

            const sanitizedConfig = { ...config.DEFAULT_SYSTEM_CONFIG };
            const allowedKeys = new Set(Object.keys(config.DEFAULT_SYSTEM_CONFIG));

            Object.entries(newConfig || {}).forEach(([key, value]) => {
                if (typeof value === 'undefined' || value === null) {
                    return;
                }

                const cleanKey = key.toString().trim();
                if (!allowedKeys.has(cleanKey)) {
                    return;
                }

                const cleanValue = value.toString().trim();
                sanitizedConfig[cleanKey] = cleanValue;
            });

            sanitizedConfig.location_restriction_enabled = this.normalizarBooleano(sanitizedConfig.location_restriction_enabled);
            sanitizedConfig.device_restriction_enabled = this.normalizarBooleano(sanitizedConfig.device_restriction_enabled);
            sanitizedConfig.admin_key_bypass_enabled = this.normalizarBooleano(sanitizedConfig.admin_key_bypass_enabled);

            const radius = parseFloat(sanitizedConfig.location_radius_km);
            if (Number.isNaN(radius) || radius <= 0) {
                sanitizedConfig.location_radius_km = config.DEFAULT_SYSTEM_CONFIG.location_radius_km;
            } else {
                sanitizedConfig.location_radius_km = radius.toString();
            }

            const timestamp = new Date().toISOString();

            await servicioBaseDatos.transaccion(async (client) => {
                for (const [key, value] of Object.entries(sanitizedConfig)) {
                    await client.query(
                        `INSERT INTO system_config (key, value, updated_at)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
                        [key, value == null ? '' : value.toString(), timestamp]
                    );
                }
            });

            return { ...sanitizedConfig, updated_at: timestamp };
        } catch (error) {
            console.error('❌ Error guardando configuración del sistema:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo guardar la configuración del sistema', 500, 'CONFIG_SAVE_ERROR');
        }
    }

    static async obtenerConfiguracionPublica() {
        const [configData, totalClavesActivas] = await Promise.all([
            this.obtenerConfiguracionSistema(),
            ServicioClavesAdministrativas.contarClavesActivas().catch(error => {
                console.error('⚠️ No se pudo obtener el conteo de claves activas:', error);
                return 0;
            })
        ]);

        return {
            location_restriction_enabled: configData.location_restriction_enabled === 'true',
            device_restriction_enabled: configData.device_restriction_enabled === 'true',
            admin_key_bypass_enabled: configData.admin_key_bypass_enabled === 'true',
            has_active_admin_keys: totalClavesActivas > 0,
            active_admin_keys: totalClavesActivas,
            location_name: configData.location_name || '',
            location_latitude: configData.location_latitude || '',
            location_longitude: configData.location_longitude || '',
            location_radius_km: configData.location_radius_km || config.DEFAULT_SYSTEM_CONFIG.location_radius_km,
            updated_at: configData.updated_at || new Date().toISOString()
        };
    }

    static normalizarBooleano(value) {
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }

        const normalized = value ? value.toString().trim().toLowerCase() : 'false';
        return ['true', '1', 'yes', 'on'].includes(normalized) ? 'true' : 'false';
    }
}

module.exports = ServicioConfiguracion;
