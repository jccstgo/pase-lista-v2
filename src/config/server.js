try {
    require('dotenv').config();
} catch (error) {
    console.warn('⚠️ dotenv no encontrado, usando configuración por defecto');
}

const config = {
    // Configuración del servidor
    DEFAULT_PORT: 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Configuración de JWT
    JWT_SECRET: process.env.JWT_SECRET || 'sistema-militar-pase-lista-2024-clave-temporal-cambiar-en-produccion',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
    
    // Configuración de archivos
    DATA_DIR: 'data',
    FILES: {
        STUDENTS: 'data/students.csv',
        ATTENDANCE: 'data/attendance.csv',
        ADMIN: 'data/admin.csv'
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
        ]
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