const express = require('express');
const ControladorAutenticacion = require('../controllers/controladorAutenticacion');
const { authenticateAdmin } = require('../middleware/auth');
const { 
    validateAdminLogin, 
    validatePasswordChange, 
    sanitizeInput 
} = require('../middleware/validation');

const router = express.Router();

// Aplicar sanitización a todas las rutas
router.use(sanitizeInput);

/**
 * Rutas públicas de autenticación
 */

// Login de administrador
router.post('/login', validateAdminLogin, ControladorAutenticacion.iniciarSesion);

// Verificar si un token es válido
router.post('/verify', ControladorAutenticacion.verificarAutenticacion);

// Renovar token
router.post('/refresh', ControladorAutenticacion.renovarToken);

// Logout (invalidar token del lado cliente)
router.post('/logout', ControladorAutenticacion.cerrarSesion);

// Validar fuerza de contraseña
router.post('/validate-password', ControladorAutenticacion.validarContrasena);

/**
 * Rutas protegidas (requieren autenticación)
 */

// Cambiar contraseña (requiere token válido)
router.post('/change-password', authenticateAdmin, validatePasswordChange, ControladorAutenticacion.cambiarContrasena);

// Obtener información de la sesión actual
router.get('/session', authenticateAdmin, ControladorAutenticacion.obtenerSesion);

// Obtener información sobre intentos de login
router.get('/login-attempts', authenticateAdmin, ControladorAutenticacion.obtenerIntentosInicioSesion);

/**
 * Middleware de logging para rutas de auth
 */
router.use((req, res, next) => {
    // Log de actividad de autenticación (sin datos sensibles)
    console.log(`🔐 Auth activity: ${req.method} ${req.originalUrl} - IP: ${req.ip || 'unknown'} - User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'unknown'}`);
    next();
});

/**
 * Middleware de manejo de errores específico para auth
 */
router.use((error, req, res, next) => {
    // Log de errores de autenticación
    console.error('❌ Error en autenticación:', {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        error: error.message,
        code: error.code
    });
    
    // No revelar información sensible en respuestas de error
    const safeErrorMessages = {
        'MISSING_CREDENTIALS': 'Usuario y contraseña son requeridos',
        'INVALID_CREDENTIALS': 'Credenciales inválidas',
        'USER_NOT_FOUND': 'Credenciales inválidas',
        'INVALID_PASSWORD': 'Credenciales inválidas',
        'ACCOUNT_LOCKED': 'Cuenta temporalmente bloqueada',
        'TOKEN_EXPIRED': 'Sesión expirada',
        'INVALID_TOKEN': 'Token de autorización inválido',
        'MISSING_TOKEN': 'Token de autorización requerido'
    };
    
    const statusCodes = {
        'MISSING_CREDENTIALS': 400,
        'INVALID_CREDENTIALS': 401,
        'USER_NOT_FOUND': 401,
        'INVALID_PASSWORD': 401,
        'ACCOUNT_LOCKED': 423,
        'TOKEN_EXPIRED': 401,
        'INVALID_TOKEN': 401,
        'MISSING_TOKEN': 401
    };
    
    const errorMessage = safeErrorMessages[error.code] || 'Error de autenticación';
    const statusCode = statusCodes[error.code] || error.statusCode || 500;
    
    // Si ya se envió una respuesta, no hacer nada más
    if (res.headersSent) {
        return next(error);
    }
    
    res.status(statusCode).json({
        success: false,
        error: errorMessage,
        code: error.code || 'AUTH_ERROR',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;