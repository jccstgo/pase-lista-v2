const express = require('express');
const ControladorAdministracion = require('../controllers/controladorAdministracion');
const { autenticarAdministrador, requerirAccesoTecnico } = require('../middleware/autenticacion');
const {
    validarCambioContrasena,
    validarListaEstudiantes,
    sanitizarEntrada
} = require('../middleware/validacion');

const router = express.Router();

// Aplicar autenticación y sanitización a todas las rutas de admin
router.use(autenticarAdministrador);
router.use(sanitizarEntrada);

/**
 * Rutas principales de estadísticas y reportes
 */

/**
 * Configuración del sistema y restricciones
 */
router.get('/config', requerirAccesoTecnico, ControladorAdministracion.obtenerConfiguracionSistema);
router.post('/config', requerirAccesoTecnico, ControladorAdministracion.actualizarConfiguracionSistema);

/**
 * Gestión de claves administrativas
 */
router.get('/admin-keys', requerirAccesoTecnico, ControladorAdministracion.obtenerClavesAdministrativas);
router.post('/admin-keys', requerirAccesoTecnico, ControladorAdministracion.crearClaveAdministrativa);
router.delete('/admin-keys/:key', requerirAccesoTecnico, ControladorAdministracion.desactivarClaveAdministrativa);

/**
 * Gestión de dispositivos registrados
 */
router.get('/devices', requerirAccesoTecnico, ControladorAdministracion.obtenerDispositivosRegistrados);

/**
 * Rutas principales de estadísticas y reportes
 */

// Obtener estadísticas generales del sistema
router.get('/stats', ControladorAdministracion.obtenerEstadisticasSistema);

// Obtener lista detallada de asistencia
router.get('/detailed-list', ControladorAdministracion.obtenerListaDetallada);

// Obtener resumen ejecutivo
router.get('/executive-summary', ControladorAdministracion.obtenerResumenEjecutivo);

// Obtener métricas en tiempo real
router.get('/realtime-metrics', ControladorAdministracion.obtenerMetricasTiempoReal);

/**
 * Gestión de estudiantes
 */

// Subir nueva lista de estudiantes
router.post('/upload-students', requerirAccesoTecnico, validarListaEstudiantes, ControladorAdministracion.subirEstudiantes);

// Limpiar todos los estudiantes
router.delete('/students/clear', requerirAccesoTecnico, ControladorAdministracion.limpiarEstudiantes);

// Obtener estadísticas de estudiantes
router.get('/students/stats', requerirAccesoTecnico, ControladorAdministracion.obtenerEstadisticasEstudiantes);

// Buscar estudiantes con filtros
router.get('/students/search', requerirAccesoTecnico, ControladorAdministracion.buscarEstudiantes);

// Validar integridad de datos de estudiantes
router.get('/students/validate', requerirAccesoTecnico, ControladorAdministracion.validarIntegridadEstudiantes);

/**
 * Gestión de asistencias
 */

// Validar integridad de datos de asistencias
router.get('/attendance/validate', requerirAccesoTecnico, ControladorAdministracion.validarIntegridadAsistencias);

// Limpiar todos los registros de asistencia
router.delete('/attendance/clear', requerirAccesoTecnico, ControladorAdministracion.limpiarRegistrosAsistencia);

/**
 * Gestión de cuenta de administrador
 */

// Obtener perfil del administrador actual
router.get('/profile', requerirAccesoTecnico, ControladorAdministracion.obtenerPerfil);

// Cambiar contraseña
router.post('/change-password', requerirAccesoTecnico, validarCambioContrasena, ControladorAdministracion.cambiarContrasena);

// Obtener estadísticas de administradores
router.get('/admins/stats', requerirAccesoTecnico, ControladorAdministracion.obtenerEstadisticasAdministradores);

/**
 * Gestión del sistema
 */

// Obtener estado completo del sistema
router.get('/system-status', requerirAccesoTecnico, ControladorAdministracion.obtenerEstadoSistema);

// Ejecutar diagnósticos del sistema
router.post('/diagnostics', requerirAccesoTecnico, ControladorAdministracion.ejecutarDiagnosticos);

// Crear backup completo del sistema
router.post('/backup', requerirAccesoTecnico, ControladorAdministracion.crearRespaldo);

// Limpiar archivos temporales y antiguos
router.post('/cleanup', requerirAccesoTecnico, ControladorAdministracion.limpiarSistema);

/**
 * Exportación de datos
 */

// Exportar todos los datos del sistema
router.get('/export-all', requerirAccesoTecnico, ControladorAdministracion.exportarTodosLosDatos);

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
