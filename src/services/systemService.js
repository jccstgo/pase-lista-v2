const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const Admin = require('../models/Admin');
const CSVService = require('./csvService');
const config = require('../config/server');
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
            await this.initializeCSVFiles();

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
    static async initializeCSVFiles() {
        try {
            await this.initializeStudentsFile();
            await this.initializeAttendanceFile();
            await this.initializeAdminFile();
            console.log('✅ Archivos CSV inicializados');
        } catch (error) {
            console.error('❌ Error inicializando archivos CSV:', error);
            throw new AppError('Error inicializando archivos del sistema', 500, 'CSV_INIT_ERROR');
        }
    }

    /**
     * Inicializar archivo de estudiantes
     */
    static async initializeStudentsFile() {
        try {
            if (!(await CSVService.fileExists(config.FILES.STUDENTS))) {
                console.log('📁 Creando archivo de estudiantes...');
                await CSVService.writeEmptyCSV(config.FILES.STUDENTS, config.CSV_HEADERS.STUDENTS);
                console.log('✅ Archivo students.csv creado con formato: matricula, nombre, grupo');
            } else {
                console.log('✅ Archivo students.csv existe');

                // Verificar integridad del archivo
                await this.verifyFileIntegrity(config.FILES.STUDENTS, config.CSV_HEADERS.STUDENTS);
            }
        } catch (error) {
            console.error('❌ Error inicializando archivo de estudiantes:', error);
            throw error;
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
            const [studentsStatus, attendanceStatus, adminStatus] = await Promise.all([
                this.getFileStatus(config.FILES.STUDENTS, config.CSV_HEADERS.STUDENTS),
                this.getFileStatus(config.FILES.ATTENDANCE, config.CSV_HEADERS.ATTENDANCE),
                this.getFileStatus(config.FILES.ADMIN, config.CSV_HEADERS.ADMIN)
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
                    admin: adminStatus
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

            const [students, attendance, admins] = await Promise.all([
                CSVService.readCSV(config.FILES.STUDENTS),
                CSVService.readCSV(config.FILES.ATTENDANCE),
                CSVService.readCSV(config.FILES.ADMIN)
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
                    admins
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
