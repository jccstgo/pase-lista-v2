const express = require('express');
const AdminController = require('../controllers/adminController');
const { authenticateAdmin } = require('../middleware/auth');
const { 
    validatePasswordChange, 
    validateStudentsList, 
    sanitizeInput 
} = require('../middleware/validation');

const router = express.Router();

// Aplicar autenticación y sanitización a todas las rutas de admin
router.use(authenticateAdmin);
router.use(sanitizeInput);

/**
 * Rutas principales de estadísticas y reportes
 */

/**
 * Configuración del sistema y restricciones
 */
router.get('/config', AdminController.getSystemConfig);
router.post('/config', AdminController.updateSystemConfig);

/**
 * Gestión de claves administrativas
 */
router.get('/admin-keys', AdminController.getAdminKeys);
router.post('/admin-keys', AdminController.createAdminKey);
router.delete('/admin-keys/:key', AdminController.deactivateAdminKey);

/**
 * Gestión de dispositivos registrados
 */
router.get('/devices', AdminController.getRegisteredDevices);

/**
 * Rutas principales de estadísticas y reportes
 */

// Obtener estadísticas generales del sistema
router.get('/stats', AdminController.getSystemStats);

// Obtener lista detallada de asistencia
router.get('/detailed-list', AdminController.getDetailedList);

// Obtener resumen ejecutivo
router.get('/executive-summary', AdminController.getExecutiveSummary);

// Obtener métricas en tiempo real
router.get('/realtime-metrics', AdminController.getRealtimeMetrics);

/**
 * Gestión de estudiantes
 */

// Subir nueva lista de estudiantes
router.post('/upload-students', validateStudentsList, AdminController.uploadStudents);

// Limpiar todos los estudiantes
router.delete('/students/clear', AdminController.clearStudents);

// Obtener estadísticas de estudiantes
router.get('/students/stats', AdminController.getStudentStats);

// Buscar estudiantes con filtros
router.get('/students/search', AdminController.searchStudents);

// Validar integridad de datos de estudiantes
router.get('/students/validate', AdminController.validateStudentsIntegrity);

/**
 * Gestión de asistencias
 */

// Validar integridad de datos de asistencias
router.get('/attendance/validate', AdminController.validateAttendanceIntegrity);

// Limpiar todos los registros de asistencia
router.delete('/attendance/clear', AdminController.clearAttendanceRecords);

/**
 * Gestión de cuenta de administrador
 */

// Obtener perfil del administrador actual
router.get('/profile', AdminController.getProfile);

// Cambiar contraseña
router.post('/change-password', validatePasswordChange, AdminController.changePassword);

// Obtener estadísticas de administradores
router.get('/admins/stats', AdminController.getAdminStats);

/**
 * Gestión del sistema
 */

// Obtener estado completo del sistema
router.get('/system-status', AdminController.getSystemStatus);

// Ejecutar diagnósticos del sistema
router.post('/diagnostics', AdminController.runDiagnostics);

// Crear backup completo del sistema
router.post('/backup', AdminController.createBackup);

// Limpiar archivos temporales y antiguos
router.post('/cleanup', AdminController.cleanupSystem);

/**
 * Exportación de datos
 */

// Exportar todos los datos del sistema
router.get('/export-all', AdminController.exportAllData);

/**
 * Middleware de manejo de errores específico para rutas de admin
 */
router.use((error, req, res, next) => {
    console.error('❌ Error en ruta de administración:', {
        url: req.originalUrl,
        method: req.method,
        admin: req.admin?.username,
        error: error.message
    });
    
    // Si ya se envió una respuesta, no hacer nada más
    if (res.headersSent) {
        return next(error);
    }
    
    // Respuesta de error específica para admin
    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Error interno del servidor',
        code: error.code || 'ADMIN_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
    });
});

module.exports = router;
