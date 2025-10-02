const Admin = require('../models/Admin');
const CSVService = require('./csvService');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');

class SystemService {
    /**
     * Ejecuta todas las tareas necesarias para que el sistema pueda arrancar.
     */
    static async initializeSystem() {
        try {
            console.log('🔄 Iniciando proceso de inicialización del sistema...');

            await SystemService.createDataDirectory();
            await SystemService.initializeCSVFiles();
            await SystemService.createDefaultAdmin();

            console.log('🎉 Sistema inicializado exitosamente');
            return true;
        } catch (error) {
            console.error('❌ Error fatal durante la inicialización:', error);
            throw new AppError('Error crítico en inicialización del sistema', 500, 'SYSTEM_INIT_ERROR');
        }
    }

    /**
     * Crea el directorio de datos definido en la configuración si aún no existe.
     */
    static async createDataDirectory() {
        try {
            await CSVService.ensureDirectory(config.DATA_DIR);
            console.log('✅ Directorio de datos verificado/creado');
        } catch (error) {
            console.error('❌ Error creando directorio de datos:', error);
            throw new AppError('No se pudo crear directorio de datos', 500, 'DATA_DIR_ERROR');
        }
    }

    /**
     * Inicializa todos los archivos CSV requeridos por el sistema.
     */
    static async initializeCSVFiles() {
        try {
            await SystemService.initializeStudentsFile();
            await SystemService.initializeAttendanceFile();
            await SystemService.initializeAdminFile();
            console.log('✅ Archivos CSV inicializados');
        } catch (error) {
            console.error('❌ Error inicializando archivos CSV:', error);
            throw new AppError('Error inicializando archivos del sistema', 500, 'CSV_INIT_ERROR');
        }
    }

    static async initializeStudentsFile() {
        await SystemService.initializeFile(config.FILES.STUDENTS, config.CSV_HEADERS.STUDENTS, 'students.csv');
    }

    static async initializeAttendanceFile() {
        await SystemService.initializeFile(config.FILES.ATTENDANCE, config.CSV_HEADERS.ATTENDANCE, 'attendance.csv');
    }

    static async initializeAdminFile() {
        await SystemService.initializeFile(config.FILES.ADMIN, config.CSV_HEADERS.ADMIN, 'admin.csv');
    }

    /**
     * Inicializa un archivo CSV genérico y verifica su integridad si ya existe.
     */
    static async initializeFile(filePath, headers, fileName) {
        try {
            if (!(await CSVService.fileExists(filePath))) {
                console.log(`📁 Creando archivo ${fileName}...`);
                await CSVService.writeEmptyCSV(filePath, headers);
                console.log(`✅ Archivo ${fileName} creado`);
            } else {
                console.log(`✅ Archivo ${fileName} existe`);
                await SystemService.verifyFileIntegrity(filePath, headers);
            }
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Error inicializando ${fileName}`, 500, 'CSV_INIT_ERROR');
        }
    }

    /**
     * Realiza validaciones básicas sobre un archivo CSV existente.
     */
    static async verifyFileIntegrity(filePath, headers) {
        try {
            const records = await CSVService.readCSV(filePath);
            const requiredFields = headers.map(header => header.id);

            const invalidRecords = records.filter(record =>
                requiredFields.some(field => !(field in record))
            );

            if (invalidRecords.length > 0) {
                console.warn(`⚠️ Registros inválidos encontrados en ${filePath}: ${invalidRecords.length}`);
            }

            return true;
        } catch (error) {
            console.error(`❌ Error verificando integridad de ${filePath}:`, error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error verificando integridad de archivos', 500, 'CSV_INTEGRITY_ERROR');
        }
    }

    /**
     * Crea un administrador por defecto (admin/admin123) si no existe.
     */
    static async createDefaultAdmin() {
        try {
            const csvData = await CSVService.readCSV(config.FILES.ADMIN);
            const admins = Admin.fromCSVArray(csvData);
            const existingAdmin = Admin.findByUsername(admins, 'admin');

            if (existingAdmin) {
                console.log('✅ Administrador por defecto existente');
                return existingAdmin;
            }

            const defaultAdmin = await Admin.createDefault();
            await CSVService.writeCSV(
                config.FILES.ADMIN,
                [defaultAdmin.toCSV(), ...csvData],
                config.CSV_HEADERS.ADMIN
            );

            console.log('✅ Administrador por defecto creado: admin/admin123');
            return defaultAdmin;
        } catch (error) {
            console.error('❌ Error creando administrador por defecto:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al crear administrador por defecto', 500, 'DEFAULT_ADMIN_ERROR');
        }
    }
}

module.exports = SystemService;

