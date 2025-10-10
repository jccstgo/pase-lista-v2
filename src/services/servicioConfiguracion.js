const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

class ServicioConfiguracion {
    static async ensureInitialized() {
        try {
            const rows = await servicioBaseDatos.all('SELECT key FROM system_config');
            const existingKeys = new Set(rows.map(row => row.key));
            const timestamp = new Date().toISOString();

            const operations = [];
            Object.entries(config.DEFAULT_SYSTEM_CONFIG).forEach(([key, value]) => {
                if (!existingKeys.has(key)) {
                    operations.push(
                        servicioBaseDatos.run(
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

    static async getSystemConfig() {
        try {
            await this.ensureInitialized();

            const rows = await servicioBaseDatos.all('SELECT key, value, updated_at FROM system_config');
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

    static async saveSystemConfig(newConfig = {}) {
        try {
            await this.ensureInitialized();

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

            sanitizedConfig.location_restriction_enabled = this.normalizeBoolean(sanitizedConfig.location_restriction_enabled);
            sanitizedConfig.device_restriction_enabled = this.normalizeBoolean(sanitizedConfig.device_restriction_enabled);
            sanitizedConfig.admin_key_bypass_enabled = this.normalizeBoolean(sanitizedConfig.admin_key_bypass_enabled);

            const radius = parseFloat(sanitizedConfig.location_radius_km);
            if (Number.isNaN(radius) || radius <= 0) {
                sanitizedConfig.location_radius_km = config.DEFAULT_SYSTEM_CONFIG.location_radius_km;
            } else {
                sanitizedConfig.location_radius_km = radius.toString();
            }

            const timestamp = new Date().toISOString();

            await servicioBaseDatos.transaction(async (client) => {
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

    static async getPublicConfig() {
        const configData = await this.getSystemConfig();

        return {
            location_restriction_enabled: configData.location_restriction_enabled === 'true',
            device_restriction_enabled: configData.device_restriction_enabled === 'true',
            admin_key_bypass_enabled: configData.admin_key_bypass_enabled === 'true',
            location_name: configData.location_name || '',
            location_latitude: configData.location_latitude || '',
            location_longitude: configData.location_longitude || '',
            location_radius_km: configData.location_radius_km || config.DEFAULT_SYSTEM_CONFIG.location_radius_km,
            updated_at: configData.updated_at || new Date().toISOString()
        };
    }

    static normalizeBoolean(value) {
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }

        const normalized = value ? value.toString().trim().toLowerCase() : 'false';
        return ['true', '1', 'yes', 'on'].includes(normalized) ? 'true' : 'false';
    }
}

module.exports = ServicioConfiguracion;
