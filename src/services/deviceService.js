const CSVService = require('./csvService');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');

class DeviceService {
    /**
     * Asegurar que el archivo de dispositivos exista
     */
    static async ensureInitialized() {
        try {
            const exists = await CSVService.fileExists(config.FILES.DEVICES);

            if (!exists) {
                await CSVService.writeEmptyCSV(config.FILES.DEVICES, config.CSV_HEADERS.DEVICES);
                return;
            }

            const records = await CSVService.readCSV(config.FILES.DEVICES);
            await CSVService.writeCSV(config.FILES.DEVICES, records, config.CSV_HEADERS.DEVICES);
        } catch (error) {
            console.error('❌ Error asegurando archivo de dispositivos:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo inicializar el registro de dispositivos', 500, 'DEVICES_INIT_ERROR');
        }
    }

    /**
     * Obtener todos los dispositivos registrados
     */
    static async getAllDevices() {
        try {
            await this.ensureInitialized();

            const records = await CSVService.readCSV(config.FILES.DEVICES);
            const devices = records.map(record => ({
                device_fingerprint: (record.device_fingerprint || '').trim(),
                matricula: (record.matricula || '').trim().toUpperCase(),
                first_registration: record.first_registration || '',
                last_used: record.last_used || record.first_registration || '',
                user_agent: record.user_agent || ''
            }));

            return devices.sort((a, b) => {
                const dateA = a.last_used ? new Date(a.last_used).getTime() : 0;
                const dateB = b.last_used ? new Date(b.last_used).getTime() : 0;
                return dateB - dateA;
            });
        } catch (error) {
            console.error('❌ Error obteniendo dispositivos registrados:', error);
            throw error instanceof AppError ? error : new AppError('No se pudieron obtener los dispositivos registrados', 500, 'DEVICES_LOAD_ERROR');
        }
    }

    /**
     * Registrar o actualizar el uso de un dispositivo
     */
    static async registerDeviceUsage({ matricula, deviceFingerprint, userAgent }) {
        try {
            await this.ensureInitialized();

            const fingerprint = (deviceFingerprint || '').toString().trim();
            if (!fingerprint) {
                return null;
            }

            const normalizedMatricula = (matricula || '').toString().trim().toUpperCase();
            const userAgentValue = (userAgent || '').toString().trim();
            const timestamp = new Date().toISOString();

            const existingDevices = await CSVService.readCSV(config.FILES.DEVICES);
            const existingDevice = existingDevices.find(device => device.device_fingerprint === fingerprint);

            if (existingDevice) {
                const updatedDevice = {
                    device_fingerprint: fingerprint,
                    matricula: normalizedMatricula || (existingDevice.matricula || ''),
                    first_registration: existingDevice.first_registration || timestamp,
                    last_used: timestamp,
                    user_agent: userAgentValue || existingDevice.user_agent || ''
                };

                await CSVService.updateInCSV(
                    config.FILES.DEVICES,
                    { device_fingerprint: fingerprint },
                    updatedDevice,
                    config.CSV_HEADERS.DEVICES
                );

                return updatedDevice;
            }

            const newDevice = {
                device_fingerprint: fingerprint,
                matricula: normalizedMatricula,
                first_registration: timestamp,
                last_used: timestamp,
                user_agent: userAgentValue
            };

            await CSVService.appendToCSV(config.FILES.DEVICES, newDevice, config.CSV_HEADERS.DEVICES);
            return newDevice;
        } catch (error) {
            console.error('❌ Error registrando dispositivo:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo registrar el dispositivo', 500, 'DEVICE_REGISTER_ERROR');
        }
    }

    /**
     * Limpiar el registro de dispositivos
     */
    static async clearAllDevices() {
        await CSVService.writeEmptyCSV(config.FILES.DEVICES, config.CSV_HEADERS.DEVICES);
    }
}

module.exports = DeviceService;

