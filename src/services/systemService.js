const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const Admin = require('../models/Admin');
const CSVService = require('./csvService');
const StudentService = require('./studentService');
const config = require('../config/server');
const ConfigService = require('./configService');
const AdminKeyService = require('./adminKeyService');
const DeviceService = require('./deviceService');
const { AppError } = require('../middleware/errorHandler');

class SystemService {
    /**
     * Inicializar el sistema completo
     */
    static async initializeSystem() {
        try {
            console.log('🔄 Iniciando proceso de inicialización del sistema...');

            // Crear directorio de datos
            await this.createDataDirectory();

            // Inicializar archivos CSV
            await this.initializeStorage();

            // Crear administrador por defecto si no existe
            await this.createDefaultAdmin();

            console.log('🎉 Sistema inicializado exitosamente');
            return true;
        } catch (error) {
            console.error('❌ Error fatal durante la inicialización:', error);
            throw new AppError('Error crítico en inicialización del sistema', 500, 'SYSTEM_INIT_ERROR');
        }
    }

    /**
     * Crear directorio de datos
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
     * Inicializar todos los archivos CSV necesarios
     */
    static async initializeStorage() {
        try {
            await this.initializeStudentsStorage();
            await this.initializeAttendanceFile();
            await this.initializeAdminFile();
            await this.initializeConfigFile();
            await this.initializeAdminKeysFile();
            await this.initializeDevicesFile();
            console.log('✅ Almacenamiento del sistema verificado');
        } catch (error) {
            console.error('❌ Error inicializando almacenamiento del sistema:', error);
            throw new AppError('Error inicializando almacenamiento del sistema', 500, 'STORAGE_INIT_ERROR');
        }
    }

    /**
     * Inicializar almacenamiento de estudiantes en base de datos
     */
    static async initializeStudentsStorage() {
        try {
            // Forzar inicialización de la base de datos de estudiantes
            await StudentService.validateDataIntegrity();
            console.log('✅ Base de datos de estudiantes verificada');
        } catch (error) {
            console.error('❌ Error inicializando base de datos de estudiantes:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('No se pudo inicializar la base de datos de estudiantes', 500, 'STUDENTS_DB_INIT_ERROR');
        }
    }

    /**
     * Inicializar archivo de asistencias
     */
    static async initializeAttendanceFile() {
        try {
            if (!(await CSVService.fileExists(config.FILES.ATTENDANCE))) {
                console.log('📝 Creando archivo de asistencias...');
                await CSVService.writeEmptyCSV(config.FILES.ATTENDANCE, config.CSV_HEADERS.ATTENDANCE);
                console.log('✅ Archivo attendance.csv creado');
            } else {
                console.log('✅ Archivo attendance.csv existe');

                // Verificar integridad del archivo
                await this.verifyFileIntegrity(config.FILES.ATTENDANCE, config.CSV_HEADERS.ATTENDANCE);
            }
        } catch (error) {
            console.error('❌ Error inicializando archivo de asistencias:', error);
            throw error;
        }
    }

    /**
     * Inicializar archivo de administradores
     */
    static async initializeAdminFile() {
        try {
            if (!(await CSVService.fileExists(config.FILES.ADMIN))) {
                console.log('🔐 Creando archivo de administradores...');
                await CSVService.writeEmptyCSV(config.FILES.ADMIN, config.CSV_HEADERS.ADMIN);
                console.log('✅ Archivo admin.csv creado');
            } else {
                console.log('✅ Archivo admin.csv existe');

                // Verificar integridad del archivo
                await this.verifyFileIntegrity(config.FILES.ADMIN, config.CSV_HEADERS.ADMIN);
            }
        } catch (error) {
            console.error('❌ Error inicializando archivo de administradores:', error);
            throw error instanceof AppError ? error : new AppError(error.message, 500, 'ADMIN_FILE_ERROR');
        }
    }

    /**
     * Inicializar archivo de configuración del sistema
     */
    static async initializeConfigFile() {
        try {
            await ConfigService.ensureInitialized();
            console.log('✅ Archivo system_config.csv verificado');
        } catch (error) {
            console.error('❌ Error inicializando archivo de configuración:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo inicializar el archivo de configuración', 500, 'CONFIG_FILE_ERROR');
        }
    }

    /**
     * Inicializar archivo de claves administrativas
     */
    static async initializeAdminKeysFile() {
        try {
            await AdminKeyService.ensureInitialized();
            console.log('✅ Archivo admin_keys.csv verificado');
        } catch (error) {
            console.error('❌ Error inicializando archivo de claves administrativas:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo inicializar el archivo de claves administrativas', 500, 'ADMIN_KEYS_FILE_ERROR');
        }
    }

    /**
     * Inicializar archivo de dispositivos registrados
     */
    static async initializeDevicesFile() {
        try {
            await DeviceService.ensureInitialized();
            console.log('✅ Archivo devices.csv verificado');
        } catch (error) {
            console.error('❌ Error inicializando archivo de dispositivos:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo inicializar el archivo de dispositivos', 500, 'DEVICES_FILE_ERROR');
        }
    }

    /**
     * Verificar integridad de un archivo CSV
     */
    static async verifyFileIntegrity(filePath, expectedHeaders) {
        try {
            const exists = await CSVService.fileExists(filePath);
            if (!exists) {
                throw new AppError(`Archivo no encontrado: ${filePath}`, 404, 'CSV_FILE_NOT_FOUND');
            }

            const content = await fsp.readFile(filePath, 'utf8');
            const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
            const expectedHeaderNames = expectedHeaders.map(header => (header.title || header.id).trim());
            let fixesApplied = false;

            if (lines.length === 0) {
                console.warn(`⚠️ Archivo vacío detectado en ${filePath}. Reescribiendo headers.`);
                await CSVService.writeEmptyCSV(filePath, expectedHeaders);
                return { valid: true, fixesApplied: true, records: 0 };
            }

            const headerLine = lines.shift();
            const actualHeaders = headerLine ? headerLine.split(',').map(h => h.trim()) : [];

            if (
                actualHeaders.length !== expectedHeaderNames.length ||
                actualHeaders.some((header, index) => header !== expectedHeaderNames[index])
            ) {
                console.warn(`⚠️ Headers inválidos en ${filePath}. Corrigiendo formato...`);
                const records = lines.map(line => {
                    const columns = line.split(',');
                    const record = {};
                    expectedHeaders.forEach((header, index) => {
                        const value = columns[index] !== undefined ? columns[index].trim() : '';
                        record[header.id || header.title] = value;
                    });
                    return record;
                });

                await CSVService.writeCSV(filePath, records, expectedHeaders);
                fixesApplied = true;
            } else {
                // Normalizar datos existentes eliminando columnas desconocidas
                const records = await CSVService.readCSV(filePath);
                const sanitized = records.map(record => {
                    const cleanRecord = {};
                    expectedHeaders.forEach(header => {
                        const key = header.id || header.title;
                        const value = record[key] ?? record[header.title] ?? '';
                        cleanRecord[key] = typeof value === 'string' ? value.trim() : value;
                    });
                    return cleanRecord;
                });

                await CSVService.writeCSV(filePath, sanitized, expectedHeaders);
            }

            console.log(`🔍 Integridad verificada para ${filePath}`);
            return { valid: true, fixesApplied, records: lines.length };
        } catch (error) {
            console.error(`❌ Error verificando integridad de ${filePath}:`, error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Error verificando integridad de ${filePath}`, 500, 'CSV_INTEGRITY_ERROR');
        }
    }

    /**
     * Crear administrador por defecto si no existe
     */
    static async createDefaultAdmin() {
        try {
            const adminExists = await CSVService.fileExists(config.FILES.ADMIN);
            if (!adminExists) {
                await this.initializeAdminFile();
            }

            const adminRecords = await CSVService.readCSV(config.FILES.ADMIN);
            const admins = adminRecords.map(record => Admin.fromCSV(record));
            const defaultAdmin = Admin.findByUsername(admins, 'admin');

            if (defaultAdmin) {
                console.log('✅ Administrador por defecto ya existe');
                return defaultAdmin;
            }

            console.log('👤 Creando administrador por defecto...');
            const newAdmin = await Admin.createDefault();
            const updatedAdmins = [...admins, newAdmin].map(admin => admin.toCSV());
            await CSVService.writeCSV(config.FILES.ADMIN, updatedAdmins, config.CSV_HEADERS.ADMIN);
            console.log('✅ Administrador por defecto creado');
            return newAdmin;
        } catch (error) {
            console.error('❌ Error creando administrador por defecto:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo crear administrador por defecto', 500, 'DEFAULT_ADMIN_ERROR');
        }
    }

    /**
     * Obtener estado general del sistema
     */
    static async getSystemStatus() {
        try {
            const [
                studentsStatus,
                attendanceStatus,
                adminStatus,
                configStatus,
                adminKeysStatus,
                devicesStatus
            ] = await Promise.all([
                this.getStudentsStorageStatus(),
                this.getFileStatus(config.FILES.ATTENDANCE, config.CSV_HEADERS.ATTENDANCE),
                this.getFileStatus(config.FILES.ADMIN, config.CSV_HEADERS.ADMIN),
                this.getFileStatus(config.FILES.CONFIG, config.CSV_HEADERS.CONFIG),
                this.getFileStatus(config.FILES.ADMIN_KEYS, config.CSV_HEADERS.ADMIN_KEYS),
                this.getFileStatus(config.FILES.DEVICES, config.CSV_HEADERS.DEVICES)
            ]);

            const adminInfo = await this.checkAdminExists();

            return {
                timestamp: new Date().toISOString(),
                environment: {
                    node: process.version,
                    mode: config.NODE_ENV,
                    hostname: os.hostname(),
                    dataDirectory: path.resolve(config.DATA_DIR)
                },
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                files: {
                    students: studentsStatus,
                    attendance: attendanceStatus,
                    admin: adminStatus,
                    configuration: configStatus,
                    adminKeys: adminKeysStatus,
                    devices: devicesStatus
                },
                admin: adminInfo
            };
        } catch (error) {
            console.error('❌ Error obteniendo estado del sistema:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo obtener estado del sistema', 500, 'SYSTEM_STATUS_ERROR');
        }
    }

    /**
     * Ejecutar diagnósticos del sistema
     */
    static async runSystemDiagnostics() {
        try {
            const status = await this.getSystemStatus();
            const dataDirectoryExists = await this.directoryExists(config.DATA_DIR);
            const issues = [];

            Object.entries(status.files).forEach(([name, fileStatus]) => {
                if (!fileStatus.exists) {
                    issues.push(`Archivo requerido no encontrado: ${fileStatus.path}`);
                }
            });

            if (!status.admin.defaultAdminExists) {
                issues.push('Administrador por defecto no encontrado');
            }

            return {
                timestamp: status.timestamp,
                environment: status.environment,
                uptime: status.uptime,
                memory: status.memory,
                files: status.files,
                admin: status.admin,
                diagnostics: {
                    dataDirectory: {
                        path: path.resolve(config.DATA_DIR),
                        exists: dataDirectoryExists
                    },
                    issues,
                    status: issues.length === 0 ? 'ok' : 'warning'
                }
            };
        } catch (error) {
            console.error('❌ Error ejecutando diagnósticos:', error);
            throw error instanceof AppError ? error : new AppError('No se pudieron ejecutar los diagnósticos', 500, 'SYSTEM_DIAGNOSTICS_ERROR');
        }
    }

    /**
     * Crear backup del sistema
     */
    static async createSystemBackup() {
        try {
            const backupDir = path.join(config.DATA_DIR, 'backups');
            await CSVService.ensureDirectory(backupDir);

            const [students, attendance, admins, systemConfig, adminKeys, devices] = await Promise.all([
                StudentService.getAllStudents().then(list => list.map(student => student.toJSON())),
                CSVService.readCSV(config.FILES.ATTENDANCE),
                CSVService.readCSV(config.FILES.ADMIN),
                ConfigService.getSystemConfig(),
                AdminKeyService.getAllKeys(),
                DeviceService.getAllDevices()
            ]);

            const backupData = {
                createdAt: new Date().toISOString(),
                environment: {
                    node: process.version,
                    mode: config.NODE_ENV
                },
                data: {
                    students,
                    attendance,
                    admins,
                    systemConfig,
                    adminKeys,
                    devices
                }
            };

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
            const backupJson = JSON.stringify(backupData, null, 2);

            await fsp.writeFile(backupFile, backupJson, 'utf8');
            console.log(`💾 Backup creado en ${backupFile}`);

            return {
                file: backupFile,
                size: Buffer.byteLength(backupJson, 'utf8'),
                records: {
                    students: students.length,
                    attendance: attendance.length,
                    admins: admins.length
                }
            };
        } catch (error) {
            console.error('❌ Error creando backup del sistema:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo crear el backup del sistema', 500, 'SYSTEM_BACKUP_ERROR');
        }
    }

    /**
     * Limpiar sistema (ej. backups antiguos)
     */
    static async cleanupSystem() {
        try {
            const backupDir = path.join(config.DATA_DIR, 'backups');
            if (!(await this.directoryExists(backupDir))) {
                return {
                    removedFiles: 0,
                    remainingFiles: 0,
                    message: 'No se encontraron backups para limpiar'
                };
            }

            const files = await fsp.readdir(backupDir);
            const now = Date.now();
            const removalResults = await Promise.all(
                files.map(async file => {
                    const filePath = path.join(backupDir, file);
                    const stats = await fsp.stat(filePath);
                    const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
                    if (ageInDays > 30) {
                        await fsp.unlink(filePath);
                        return 1;
                    }
                    return 0;
                })
            );

            const removed = removalResults.reduce((total, value) => total + value, 0);

            return {
                removedFiles: removed,
                remainingFiles: files.length - removed,
                message: removed > 0 ? 'Backups antiguos eliminados' : 'No se eliminaron archivos',
                backupDirectory: path.resolve(backupDir)
            };
        } catch (error) {
            console.error('❌ Error limpiando sistema:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo completar la limpieza del sistema', 500, 'SYSTEM_CLEANUP_ERROR');
        }
    }

    /**
     * Obtener información detallada de un archivo CSV
     */
    static async getFileStatus(filePath, headers) {
        const exists = await CSVService.fileExists(filePath);
        if (!exists) {
            return {
                path: path.resolve(filePath),
                exists: false,
                expectedHeaders: headers.map(header => header.title || header.id)
            };
        }

        const [stats, records] = await Promise.all([
            fsp.stat(filePath),
            CSVService.readCSV(filePath)
        ]);

        return {
            path: path.resolve(filePath),
            exists: true,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            records: records.length,
            headers: headers.map(header => header.title || header.id)
        };
    }

    /**
     * Obtener información del almacenamiento de estudiantes (base de datos)
     */
    static async getStudentsStorageStatus() {
        try {
            const stats = await fsp.stat(config.DATABASE.FILE);
            const studentStats = await StudentService.getStudentStats();

            return {
                path: path.resolve(config.DATABASE.FILE),
                exists: true,
                size: stats.size,
                lastModified: stats.mtime.toISOString(),
                records: studentStats.total,
                type: 'database'
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    path: path.resolve(config.DATABASE.FILE),
                    exists: false,
                    records: 0,
                    type: 'database'
                };
            }

            console.error('❌ Error obteniendo estado de la base de datos de estudiantes:', error);
            throw error instanceof AppError
                ? error
                : new AppError('No se pudo obtener el estado de la base de datos de estudiantes', 500, 'STUDENTS_DB_STATUS_ERROR');
        }
    }

    /**
     * Verificar existencia de administradores
     */
    static async checkAdminExists() {
        try {
            const records = await CSVService.readCSV(config.FILES.ADMIN);
            const admins = records.map(record => Admin.fromCSV(record));
            const defaultAdmin = Admin.findByUsername(admins, 'admin');

            return {
                total: admins.length,
                defaultAdminExists: Boolean(defaultAdmin),
                admins: admins.map(admin => admin.toJSON())
            };
        } catch (error) {
            console.error('❌ Error verificando administradores:', error);
            throw error instanceof AppError ? error : new AppError('No se pudo verificar administradores', 500, 'ADMIN_CHECK_ERROR');
        }
    }

    /**
     * Verificar existencia de un directorio
     */
    static async directoryExists(dirPath) {
        try {
            await fsp.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = SystemService;
