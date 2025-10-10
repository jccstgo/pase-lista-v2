const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const Administrador = require('../models/Administrador');
const ServicioEstudiantes = require('./servicioEstudiantes');
const ServicioAdministracion = require('./servicioAdministracion');
const ServicioAsistencias = require('./servicioAsistencias');
const ServicioConfiguracion = require('./servicioConfiguracion');
const ServicioClavesAdministrativas = require('./servicioClavesAdministrativas');
const ServicioDispositivos = require('./servicioDispositivos');
const config = require('../config/server');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

class ServicioSistema {
    static async initializeSystem() {
        try {
            console.log('🔄 Iniciando proceso de inicialización del sistema...');

            await this.createDataDirectory();
            await this.initializeDatabaseResources();
            await this.createDefaultAdmin();

            console.log('🎉 Sistema inicializado exitosamente');
            return true;
        } catch (error) {
            console.error('❌ Error fatal durante la inicialización:', error);
            throw new ErrorAplicacion('Error crítico en inicialización del sistema', 500, 'SYSTEM_INIT_ERROR');
        }
    }

    static async createDataDirectory() {
        try {
            await fsp.mkdir(config.DATA_DIR, { recursive: true });
            console.log('✅ Directorio de datos verificado/creado');
        } catch (error) {
            console.error('❌ Error creando directorio de datos:', error);
            throw new ErrorAplicacion('No se pudo crear directorio de datos', 500, 'DATA_DIR_ERROR');
        }
    }

    static async initializeDatabaseResources() {
        try {
            await Promise.all([
                ServicioEstudiantes.validateDataIntegrity().catch(() => ServicioEstudiantes.getStudentStats()),
                ServicioConfiguracion.ensureInitialized(),
                ServicioClavesAdministrativas.ensureInitialized(),
                ServicioDispositivos.ensureInitialized()
            ]);
            console.log('✅ Recursos de base de datos verificados');
        } catch (error) {
            console.error('❌ Error inicializando recursos de base de datos:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('Error inicializando recursos del sistema', 500, 'DB_INIT_ERROR');
        }
    }

    static async createDefaultAdmin() {
        try {
            const defaultAdmin = await ServicioAdministracion.findByUsername('admin');
            if (defaultAdmin) {
                console.log('✅ Administrador por defecto ya existe');
                return defaultAdmin;
            }

            console.log('👤 Creando administrador por defecto...');
            const newAdmin = await Administrador.createDefault();
            await ServicioAdministracion.createAdmin({
                username: newAdmin.username,
                password: newAdmin.password,
                createdAt: newAdmin.createdAt,
                updatedAt: newAdmin.updatedAt,
                lastLogin: newAdmin.lastLogin,
                loginAttempts: newAdmin.loginAttempts,
                lockUntil: newAdmin.lockUntil
            });
            console.log('✅ Administrador por defecto creado');
            return newAdmin;
        } catch (error) {
            console.error('❌ Error creando administrador por defecto:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo crear administrador por defecto', 500, 'DEFAULT_ADMIN_ERROR');
        }
    }

    static async getSystemStatus() {
        try {
            const [studentStats, adminStats, configData, adminKeys, devices, adminInfo] = await Promise.all([
                ServicioEstudiantes.getStudentStats(),
                ServicioAdministracion.getAdminStats(),
                ServicioConfiguracion.getSystemConfig(),
                ServicioClavesAdministrativas.getAllKeys(),
                ServicioDispositivos.getAllDevices(),
                this.checkAdminExists()
            ]);

            const dataDirectory = path.resolve(config.DATA_DIR);
            const backupsDirectory = path.join(dataDirectory, 'backups');
            const backupsExists = await this.directoryExists(backupsDirectory);

            return {
                timestamp: new Date().toISOString(),
                environment: {
                    node: process.version,
                    mode: config.NODE_ENV,
                    hostname: os.hostname(),
                    dataDirectory,
                    database: config.DATABASE.SUMMARY
                },
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                storage: {
                    database: {
                        summary: config.DATABASE.SUMMARY,
                        students: studentStats.total,
                        admins: adminStats.totalAdmins,
                        adminKeys: adminKeys.length,
                        devices: devices.length
                    },
                    dataDirectory: {
                        path: dataDirectory,
                        exists: true
                    },
                    backups: {
                        path: backupsDirectory,
                        exists: backupsExists
                    }
                },
                admin: adminInfo,
                configuration: configData
            };
        } catch (error) {
            console.error('❌ Error obteniendo estado del sistema:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo obtener estado del sistema', 500, 'SYSTEM_STATUS_ERROR');
        }
    }

    static async runSystemDiagnostics() {
        try {
            const status = await this.getSystemStatus();
            const issues = [];

            if (!status.admin.defaultAdminExists) {
                issues.push('Administrador por defecto no encontrado');
            }

            if (!status.storage.backups.exists) {
                issues.push('Directorio de respaldos no encontrado');
            }

            return {
                timestamp: status.timestamp,
                environment: status.environment,
                uptime: status.uptime,
                memory: status.memory,
                storage: status.storage,
                admin: status.admin,
                diagnostics: {
                    issues,
                    status: issues.length === 0 ? 'ok' : 'warning'
                }
            };
        } catch (error) {
            console.error('❌ Error ejecutando diagnósticos:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudieron ejecutar los diagnósticos', 500, 'SYSTEM_DIAGNOSTICS_ERROR');
        }
    }

    static async createSystemBackup() {
        try {
            const backupDir = path.join(config.DATA_DIR, 'backups');
            await fsp.mkdir(backupDir, { recursive: true });

            const [students, attendances, admins, systemConfig, adminKeys, devices] = await Promise.all([
                ServicioEstudiantes.getAllStudents().then(list => list.map(student => student.toJSON())),
                ServicioAsistencias.obtenerTodasLasAsistencias().then(list => list.map(asistencia => asistencia.toJSON())),
                ServicioAdministracion.getAllAdmins().then(list => list.map(admin => admin.toJSON())),
                ServicioConfiguracion.getSystemConfig(),
                ServicioClavesAdministrativas.getAllKeys(),
                ServicioDispositivos.getAllDevices()
            ]);

            const backupData = {
                createdAt: new Date().toISOString(),
                environment: {
                    node: process.version,
                    mode: config.NODE_ENV
                },
                data: {
                    students,
                    attendance: attendances,
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
                    attendance: attendances.length,
                    admins: admins.length
                }
            };
        } catch (error) {
            console.error('❌ Error creando backup del sistema:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo crear el backup del sistema', 500, 'SYSTEM_BACKUP_ERROR');
        }
    }

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
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo completar la limpieza del sistema', 500, 'SYSTEM_CLEANUP_ERROR');
        }
    }

    static async checkAdminExists() {
        try {
            const admins = await ServicioAdministracion.getAllAdmins();
            const defaultAdmin = admins.find(admin => admin.username === 'admin');

            return {
                total: admins.length,
                defaultAdminExists: Boolean(defaultAdmin),
                admins: admins.map(admin => admin.toJSON())
            };
        } catch (error) {
            console.error('❌ Error verificando administradores:', error);
            throw error instanceof ErrorAplicacion ? error : new ErrorAplicacion('No se pudo verificar administradores', 500, 'ADMIN_CHECK_ERROR');
        }
    }

    static async directoryExists(dirPath) {
        try {
            await fsp.access(dirPath);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = ServicioSistema;
