const CSVService = require('./csvService');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');

class AdminKeyService {
    /**
     * Asegurar que el archivo de claves exista y tenga el formato correcto
     */
    static async ensureInitialized() {
        try {
            const exists = await CSVService.fileExists(config.FILES.ADMIN_KEYS);

            if (!exists) {
                await CSVService.writeEmptyCSV(config.FILES.ADMIN_KEYS, config.CSV_HEADERS.ADMIN_KEYS);
                return;
            }

            const keys = await CSVService.readCSV(config.FILES.ADMIN_KEYS);
            await CSVService.writeCSV(config.FILES.ADMIN_KEYS, keys, config.CSV_HEADERS.ADMIN_KEYS);
        } catch (error) {
            console.error('❌ Error asegurando archivo de claves administrativas:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo inicializar las claves administrativas', 500, 'ADMIN_KEYS_INIT_ERROR');
        }
    }

    /**
     * Obtener todas las claves administrativas
     */
    static async getAllKeys() {
        try {
            await this.ensureInitialized();

            const records = await CSVService.readCSV(config.FILES.ADMIN_KEYS);
            return records.map(record => ({
                key: (record.key || '').trim().toUpperCase(),
                description: (record.description || '').trim(),
                is_active: record.is_active === 'false' ? 'false' : 'true',
                created_at: record.created_at || '',
                deactivated_at: record.deactivated_at || ''
            }));
        } catch (error) {
            console.error('❌ Error obteniendo claves administrativas:', error);
            throw error instanceof AppError ? error : new AppError('No se pudieron obtener las claves administrativas', 500, 'ADMIN_KEYS_LOAD_ERROR');
        }
    }

    /**
     * Crear una nueva clave administrativa
     */
    static async createKey(key, description) {
        try {
            const normalizedKey = this.normalizeKey(key);
            const cleanDescription = (description || '').toString().trim();

            if (!normalizedKey) {
                throw new AppError('La clave es requerida', 400, 'ADMIN_KEY_REQUIRED');
            }

            if (normalizedKey.length < 4) {
                throw new AppError('La clave debe tener al menos 4 caracteres', 400, 'ADMIN_KEY_TOO_SHORT');
            }

            if (!cleanDescription) {
                throw new AppError('La descripción es requerida', 400, 'ADMIN_KEY_DESCRIPTION_REQUIRED');
            }

            const existingKeys = await this.getAllKeys();
            if (existingKeys.some(record => record.key === normalizedKey && record.is_active === 'true')) {
                throw new AppError('Ya existe una clave activa con ese nombre', 409, 'ADMIN_KEY_DUPLICATED');
            }

            const timestamp = new Date().toISOString();
            const newKey = {
                key: normalizedKey,
                description: cleanDescription,
                is_active: 'true',
                created_at: timestamp,
                deactivated_at: ''
            };

            await CSVService.appendToCSV(config.FILES.ADMIN_KEYS, newKey, config.CSV_HEADERS.ADMIN_KEYS);

            console.log(`🔑 Nueva clave administrativa creada: ${normalizedKey}`);
            return newKey;
        } catch (error) {
            console.error('❌ Error creando clave administrativa:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo crear la clave administrativa', 500, 'ADMIN_KEY_CREATE_ERROR');
        }
    }

    /**
     * Desactivar una clave administrativa existente
     */
    static async deactivateKey(key) {
        try {
            const normalizedKey = this.normalizeKey(key);

            if (!normalizedKey) {
                throw new AppError('La clave es requerida', 400, 'ADMIN_KEY_REQUIRED');
            }

            const keys = await this.getAllKeys();
            const existing = keys.find(record => record.key === normalizedKey);

            if (!existing) {
                throw new AppError('Clave administrativa no encontrada', 404, 'ADMIN_KEY_NOT_FOUND');
            }

            if (existing.is_active === 'false') {
                return existing;
            }

            const updatedKey = {
                ...existing,
                is_active: 'false',
                deactivated_at: new Date().toISOString()
            };

            const updated = await CSVService.updateInCSV(
                config.FILES.ADMIN_KEYS,
                { key: normalizedKey },
                updatedKey,
                config.CSV_HEADERS.ADMIN_KEYS
            );

            if (!updated) {
                throw new AppError('No se pudo desactivar la clave administrativa', 500, 'ADMIN_KEY_DEACTIVATE_ERROR');
            }

            console.log(`🗝️ Clave administrativa desactivada: ${normalizedKey}`);
            return updatedKey;
        } catch (error) {
            console.error('❌ Error desactivando clave administrativa:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo desactivar la clave administrativa', 500, 'ADMIN_KEY_DEACTIVATE_ERROR');
        }
    }

    /**
     * Eliminar todas las claves (utilizado en pruebas o reinicios)
     */
    static async clearAll() {
        await CSVService.writeEmptyCSV(config.FILES.ADMIN_KEYS, config.CSV_HEADERS.ADMIN_KEYS);
    }

    /**
     * Normalizar formato de clave
     */
    static normalizeKey(key) {
        if (!key) return '';
        return key.toString().trim().toUpperCase();
    }
}

module.exports = AdminKeyService;

