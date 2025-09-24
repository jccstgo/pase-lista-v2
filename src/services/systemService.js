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
                console.log('