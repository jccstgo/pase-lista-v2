const express = require('express');
const ControladorAsistencias = require('../controllers/controladorAsistencias');
const { authenticateAdmin, optionalAuth } = require('../middleware/auth');
const { validateAttendance, sanitizeInput } = require('../middleware/validation');

const router = express.Router();

// Aplicar sanitización a todas las rutas
router.use(sanitizeInput);

/**
 * Rutas públicas (para estudiantes)
 */

// Registrar asistencia - Ruta principal del sistema
router.post('/', validateAttendance, ControladorAsistencias.registrarAsistencia);

// Verificar si ya registró asistencia hoy (opcional, para frontend)
router.get('/check/:matricula', ControladorAsistencias.verificarAsistenciaDeHoy);

/**
 * Rutas semi-públicas (con autenticación opcional)
 */

// Obtener asistencias del día (puede requerir auth en producción)
router.get('/today', optionalAuth, ControladorAsistencias.obtenerAsistenciasDeHoy);

// Obtener estadísticas básicas (puede requerir auth en producción)
router.get('/stats', optionalAuth, ControladorAsistencias.obtenerEstadisticasAsistencia);

/**
 * Rutas protegidas (solo administradores)
 */

// Obtener asistencias por fecha específica
router.get('/date/:date', authenticateAdmin, ControladorAsistencias.obtenerAsistenciasPorFecha);

// Obtener historial de un estudiante
router.get('/history/:matricula', authenticateAdmin, ControladorAsistencias.obtenerHistorialEstudiante);

// Obtener reporte por rango de fechas
router.get('/report', authenticateAdmin, ControladorAsistencias.obtenerReporteAsistencia);

// Exportar datos de asistencia
router.get('/export', authenticateAdmin, ControladorAsistencias.exportarDatosAsistencia);

// Validar integridad de registros
router.get('/validate', authenticateAdmin, ControladorAsistencias.validarIntegridad);

// Obtener resumen para múltiples fechas
router.post('/summary', authenticateAdmin, ControladorAsistencias.obtenerResumenMultiplesFechas);

module.exports = router;