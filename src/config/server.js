const path = require('path');

try {
    require('dotenv').config();
} catch (error) {
    console.warn('⚠️ dotenv no encontrado, usando configuración por defecto');
}

const DATA_DIR = process.env.DATA_DIR || 'data';
const resolveDataPath = (...segments) => path.join(DATA_DIR, ...segments);

const DEFAULT_DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pase_lista';

const parseNumber = (value, defaultValue) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

const shouldUseSSL = (value) => value === true || (typeof value === 'string' && value.toLowerCase() === 'true');

const getDatabaseSummary = (databaseUrl) => {
    try {
        const url = new URL(databaseUrl);
        const protocol = url.protocol.replace(/:$/, '');
        const host = url.hostname;
        const port = url.port || '5432';
        const databaseName = url.pathname.replace(/^\//, '') || 'postgres';
        return `${protocol}://${host}:${port}/${databaseName}`;
    } catch (error) {
        console.warn('⚠️ No se pudo generar resumen de la base de datos:', error.message);
        return 'postgresql://localhost:5432/pase_lista';
    }
};

const config = {
    // Configuración del servidor
    DEFAULT_PORT: 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Configuración de JWT
    JWT_SECRET: process.env.JWT_SECRET || 'sistema-militar-pase-lista-2024-clave-temporal-cambiar-en-produccion',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
    
    // Configuración de archivos
    DATA_DIR,
    FILES: {
        STUDENTS: resolveDataPath('students.csv'),
        ATTENDANCE: resolveDataPath('attendance.csv'),
        ADMIN: resolveDataPath('admin.csv'),
        CONFIG: resolveDataPath('system_config.csv'),
        ADMIN_KEYS: resolveDataPath('admin_keys.csv'),
        DEVICES: resolveDataPath('devices.csv')
    },

    DATABASE: {
        URL: DEFAULT_DATABASE_URL,
        SUMMARY: getDatabaseSummary(DEFAULT_DATABASE_URL),
        SSL: shouldUseSSL(process.env.DATABASE_SSL),
        MAX_POOL_SIZE: parseNumber(process.env.DATABASE_MAX_POOL_SIZE, 10),
        IDLE_TIMEOUT_MS: parseNumber(process.env.DATABASE_IDLE_TIMEOUT_MS, 30000),
        CONNECTION_TIMEOUT_MS: parseNumber(process.env.DATABASE_CONNECTION_TIMEOUT_MS, 2000)
    },

    // Configuración de CSV
    CSV_HEADERS: {
        STUDENTS: [
            { id: 'matricula', title: 'matricula' },
            { id: 'nombre', title: 'nombre' },
            { id: 'grupo', title: 'grupo' }
        ],
        ATTENDANCE: [
            { id: 'matricula', title: 'matricula' },
            { id: 'nombre', title: 'nombre' },
            { id: 'grupo', title: 'grupo' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'status', title: 'status' }
        ],
        ADMIN: [
            { id: 'username', title: 'username' },
            { id: 'password', title: 'password' }
        ],
        CONFIG: [
            { id: 'key', title: 'key' },
            { id: 'value', title: 'value' },
            { id: 'updated_at', title: 'updated_at' }
        ],
        ADMIN_KEYS: [
            { id: 'key', title: 'key' },
            { id: 'description', title: 'description' },
            { id: 'is_active', title: 'is_active' },
            { id: 'created_at', title: 'created_at' },
            { id: 'deactivated_at', title: 'deactivated_at' }
        ],
        DEVICES: [
            { id: 'device_fingerprint', title: 'device_fingerprint' },
            { id: 'matricula', title: 'matricula' },
            { id: 'first_registration', title: 'first_registration' },
            { id: 'last_used', title: 'last_used' },
            { id: 'user_agent', title: 'user_agent' }
        ]
    },

    // Configuración del sistema (restricciones y comportamiento)
    DEFAULT_SYSTEM_CONFIG: {
        location_restriction_enabled: 'false',
        device_restriction_enabled: 'false',
        admin_key_bypass_enabled: 'false',
        location_name: '',
        location_latitude: '',
        location_longitude: '',
        location_radius_km: '1'
    },
    
    // Configuración de validación
    VALIDATION: {
        MIN_PASSWORD_LENGTH: 6,
        REQUIRED_STUDENT_FIELDS: ['matricula', 'nombre', 'grupo']
    },
    
    // Configuración de seguridad
    SECURITY: {
        BCRYPT_ROUNDS: 10,
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_TIME: 15 * 60 * 1000 // 15 minutos
    },
    
    // Mensajes del sistema
    MESSAGES: {
        SUCCESS: {
            ATTENDANCE_REGISTERED: '¡Asistencia registrada exitosamente!',
            PASSWORD_CHANGED: 'Contraseña cambiada exitosamente',
            STUDENTS_UPLOADED: 'estudiantes cargados exitosamente'
        },
        ERROR: {
            INVALID_CREDENTIALS: 'Credenciales inválidas',
            STUDENT_NOT_FOUND: 'Su matrícula no se encuentra registrada. Por favor acérquese al personal de Jefes de la Escuela Superior de Guerra.',
            ALREADY_REGISTERED: 'Ya se registró su asistencia hoy',
            SERVER_ERROR: 'Error interno del servidor',
            VALIDATION_ERROR: 'Error de validación de datos'
        }
    }
};

// Validaciones de configuración en producción
if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET === 'sistema-militar-pase-lista-2024-clave-temporal-cambiar-en-produccion') {
        console.warn('⚠️ ADVERTENCIA: JWT_SECRET debe cambiarse en producción');
    }
}

module.exports = config;
