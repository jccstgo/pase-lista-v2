const servicioBaseDatos = require('./servicioBaseDatos');
const { AppError } = require('../middleware/errorHandler');

class ServicioDispositivos {
    static async ensureInitialized() {
        return true;
    }

    static async getAllDevices() {
        try {
            const rows = await servicioBaseDatos.all(
                `SELECT device_fingerprint, matricula, first_registration, last_used, user_agent
                 FROM devices
                 ORDER BY last_used DESC`
            );

            return rows.map(record => ({
                device_fingerprint: (record.device_fingerprint || '').trim(),
                matricula: (record.matricula || '').trim().toUpperCase(),
                first_registration: record.first_registration instanceof Date ? record.first_registration.toISOString() : record.first_registration,
                last_used: record.last_used instanceof Date ? record.last_used.toISOString() : record.last_used,
                user_agent: record.user_agent || ''
            }));
        } catch (error) {
            console.error('❌ Error obteniendo dispositivos registrados:', error);
            throw error instanceof AppError ? error : new AppError('No se pudieron obtener los dispositivos registrados', 500, 'DEVICES_LOAD_ERROR');
        }
    }

    static async registerDeviceUsage({ matricula, deviceFingerprint, userAgent }) {
        try {
            const fingerprint = (deviceFingerprint || '').toString().trim();
            if (!fingerprint) {
                return null;
            }

            const normalizedMatricula = (matricula || '').toString().trim().toUpperCase();
            const userAgentValue = (userAgent || '').toString().trim();
            const timestamp = new Date().toISOString();

            const row = await servicioBaseDatos.get(
                `INSERT INTO devices (device_fingerprint, matricula, first_registration, last_used, user_agent)
                 VALUES ($1, $2, $3, $3, $4)
                 ON CONFLICT (device_fingerprint) DO UPDATE SET
                    matricula = CASE WHEN EXCLUDED.matricula = '' THEN devices.matricula ELSE EXCLUDED.matricula END,
                    last_used = EXCLUDED.last_used,
                    user_agent = CASE WHEN EXCLUDED.user_agent = '' THEN devices.user_agent ELSE EXCLUDED.user_agent END
                 RETURNING device_fingerprint, matricula, first_registration, last_used, user_agent`,
                [fingerprint, normalizedMatricula, timestamp, userAgentValue]
            );

            return {
                device_fingerprint: row.device_fingerprint,
                matricula: row.matricula,
                first_registration: row.first_registration instanceof Date ? row.first_registration.toISOString() : row.first_registration,
                last_used: row.last_used instanceof Date ? row.last_used.toISOString() : row.last_used,
                user_agent: row.user_agent || ''
            };
        } catch (error) {
            console.error('❌ Error registrando dispositivo:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo registrar el dispositivo', 500, 'DEVICE_REGISTER_ERROR');
        }
    }

    static async clearAllDevices() {
        await servicioBaseDatos.run('DELETE FROM devices');
    }
}

module.exports = ServicioDispositivos;
