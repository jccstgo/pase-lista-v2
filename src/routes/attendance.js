const express = require('express');
const AttendanceController = require('../controllers/attendanceController');
const { authenticateAdmin, optionalAuth } = require('../middleware/auth');
const { validateAttendance, sanitizeInput } = require('../middleware/validation');

const router = express.Router();

// Aplicar sanitización a todas las rutas
router.use(sanitizeInput);

/**
 * Rutas públicas (para estudiantes)
 */

// Registrar asistencia - Ruta principal del sistema
router.post('/', validateAttendance, AttendanceController.registerAttendance);

// Verificar si ya registró asistencia hoy (opcional, para frontend)
router.get('/check/:matricula', AttendanceController.checkTodayAttendance);

/**
 * Rutas semi-públicas (con autenticación opcional)
 */

// Obtener asistencias del día (puede requerir auth en producción)
router.get('/today', optionalAuth, AttendanceController.getTodayAttendances);

// Obtener estadísticas básicas (puede requerir auth en producción)
router.get('/stats', optionalAuth, AttendanceController.getAttendanceStats);

/**
 * Rutas protegidas (solo administradores)
 */

// Obtener asistencias por fecha específica
router.get('/date/:date', authenticateAdmin, AttendanceController.getAttendancesByDate);

// Obtener historial de un estudiante
router.get('/history/:matricula', authenticateAdmin, AttendanceController.getStudentHistory);

// Obtener reporte por rango de fechas
router.get('/report', authenticateAdmin, AttendanceController.getAttendanceReport);

// Exportar datos de asistencia
router.get('/export', authenticateAdmin, AttendanceController.exportAttendanceData);

// Validar integridad de registros
router.get('/validate', authenticateAdmin, AttendanceController.validateIntegrity);

// Obtener resumen para múltiples fechas
router.post('/summary', authenticateAdmin, AttendanceController.getMultipleDatesSummary);

module.exports = router;