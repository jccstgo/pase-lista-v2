const express = require('express');
const ControladorAsistencias = require('../controllers/controladorAsistencias');
const { autenticarAdministrador, autenticacionOpcional } = require('../middleware/autenticacion');
const { validarAsistencia, sanitizarEntrada } = require('../middleware/validacion');

const router = express.Router();

// Aplicar sanitización a todas las rutas
router.use(sanitizarEntrada);

/**
 * Rutas públicas (para estudiantes)
 */

// Registrar asistencia - Ruta principal del sistema
router.post('/', validarAsistencia, ControladorAsistencias.registrarAsistencia);

// Verificar si ya registró asistencia hoy (opcional, para frontend)
router.get('/check/:matricula', ControladorAsistencias.verificarAsistenciaDeHoy);

/**
 * Rutas semi-públicas (con autenticación opcional)
 */

// Obtener asistencias del día (puede requerir auth en producción)
router.get('/today', autenticacionOpcional, ControladorAsistencias.obtenerAsistenciasDeHoy);

// Obtener estadísticas básicas (puede requerir auth en producción)
router.get('/stats', autenticacionOpcional, ControladorAsistencias.obtenerEstadisticasAsistencia);

/**
 * Rutas protegidas (solo administradores)
 */

// Obtener asistencias por fecha específica
router.get('/date/:date', autenticarAdministrador, ControladorAsistencias.obtenerAsistenciasPorFecha);

// Obtener historial de un estudiante
router.get('/history/:matricula', autenticarAdministrador, ControladorAsistencias.obtenerHistorialEstudiante);

// Obtener reporte por rango de fechas
router.get('/report', autenticarAdministrador, ControladorAsistencias.obtenerReporteAsistencia);

// Exportar datos de asistencia
router.get('/export', autenticarAdministrador, ControladorAsistencias.exportarDatosAsistencia);

// Validar integridad de registros
router.get('/validate', autenticarAdministrador, ControladorAsistencias.validarIntegridad);

// Obtener resumen para múltiples fechas
router.post('/summary', autenticarAdministrador, ControladorAsistencias.obtenerResumenMultiplesFechas);

module.exports = router;