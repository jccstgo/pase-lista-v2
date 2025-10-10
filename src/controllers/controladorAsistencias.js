const ServicioAsistencias = require('../services/servicioAsistencias');
const { manejadorAsincrono } = require('../middleware/manejadorErrores');

class ControladorAsistencias {
    /**
     * Registrar asistencia de un estudiante
     * POST /api/attendance
     */
    static registrarAsistencia = manejadorAsincrono(async (req, res) => {
        console.log('📝 Petición de registro de asistencia recibida');
        
        const { matricula, deviceFingerprint } = req.body;

        const result = await ServicioAsistencias.registerAttendance({
            matricula,
            deviceFingerprint,
            userAgent: req.headers['user-agent'] || ''
        });
        
        res.status(200).json({
            success: true,
            message: result.message,
            data: {
                attendance: result.attendance,
                student: result.student,
                timestamp: new Date().toISOString()
            }
        });
    });

    /**
     * Obtener asistencias del día actual
     * GET /api/attendance/today
     */
    static obtenerAsistenciasDeHoy = manejadorAsincrono(async (req, res) => {
        console.log('📋 Petición de asistencias del día');
        
        const attendances = await ServicioAsistencias.getAttendancesByDate();
        
        res.status(200).json({
            success: true,
            data: {
                date: new Date().toISOString().split('T')[0],
                attendances: attendances.map(a => a.toJSON()),
                total: attendances.length
            }
        });
    });

    /**
     * Obtener asistencias por fecha específica
     * GET /api/attendance/date/:date
     */
    static obtenerAsistenciasPorFecha = manejadorAsincrono(async (req, res) => {
        const { date } = req.params;
        
        console.log(`📋 Petición de asistencias para fecha: ${date}`);
        
        // Validar formato de fecha
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }
        
        const attendances = await ServicioAsistencias.getAttendancesByDate(date);
        
        res.status(200).json({
            success: true,
            data: {
                date,
                attendances: attendances.map(a => a.toJSON()),
                total: attendances.length
            }
        });
    });

    /**
     * Verificar si un estudiante ya registró asistencia hoy
     * GET /api/attendance/check/:matricula
     */
    static verificarAsistenciaDeHoy = manejadorAsincrono(async (req, res) => {
        const { matricula } = req.params;
        
        console.log(`🔍 Verificando asistencia del día para: ${matricula}`);
        
        const attendance = await ServicioAsistencias.findTodayAttendance(matricula);
        
        res.status(200).json({
            success: true,
            data: {
                matricula,
                hasAttended: !!attendance,
                attendance: attendance ? attendance.toJSON() : null,
                date: new Date().toISOString().split('T')[0]
            }
        });
    });

    /**
     * Obtener estadísticas de asistencia
     * GET /api/attendance/stats
     * GET /api/attendance/stats?date=YYYY-MM-DD
     */
    static obtenerEstadisticasAsistencia = manejadorAsincrono(async (req, res) => {
        const { date } = req.query;
        
        console.log(`📊 Petición de estadísticas${date ? ` para fecha: ${date}` : ' del día'}`);
        
        // Validar formato de fecha si se proporciona
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }
        
        const stats = await ServicioAsistencias.getAttendanceStats(date);
        
        res.status(200).json({
            success: true,
            data: stats
        });
    });

    /**
     * Obtener historial de asistencia de un estudiante
     * GET /api/attendance/history/:matricula
     * GET /api/attendance/history/:matricula?limit=30
     */
    static obtenerHistorialEstudiante = manejadorAsincrono(async (req, res) => {
        const { matricula } = req.params;
        const { limit } = req.query;
        
        console.log(`📚 Petición de historial para: ${matricula}`);
        
        const parsedLimit = limit ? parseInt(limit) : 30;
        if (parsedLimit < 1 || parsedLimit > 365) {
            return res.status(400).json({
                success: false,
                error: 'El límite debe estar entre 1 y 365'
            });
        }
        
        const history = await ServicioAsistencias.getStudentAttendanceHistory(matricula, parsedLimit);
        
        res.status(200).json({
            success: true,
            data: history
        });
    });

    /**
     * Obtener reporte de asistencia por rango de fechas
     * GET /api/attendance/report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
     */
    static obtenerReporteAsistencia = manejadorAsincrono(async (req, res) => {
        const { startDate, endDate } = req.query;
        
        console.log(`📈 Petición de reporte desde ${startDate} hasta ${endDate}`);
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'startDate y endDate son requeridos'
            });
        }
        
        // Validar formato de fechas
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }
        
        // Validar que startDate sea anterior a endDate
        if (new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({
                success: false,
                error: 'La fecha de inicio debe ser anterior a la fecha de fin'
            });
        }
        
        // Validar que el rango no sea mayor a 1 año
        const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
        if (daysDiff > 365) {
            return res.status(400).json({
                success: false,
                error: 'El rango de fechas no puede ser mayor a 365 días'
            });
        }
        
        const report = await ServicioAsistencias.getAttendanceReport(startDate, endDate);
        
        res.status(200).json({
            success: true,
            data: report
        });
    });

    /**
     * Exportar datos de asistencia
     * GET /api/attendance/export?format=json&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
     */
    static exportarDatosAsistencia = manejadorAsincrono(async (req, res) => {
        const { format = 'json', startDate, endDate } = req.query;
        
        console.log(`📤 Petición de exportación en formato: ${format}`);
        
        // Validar formato
        const validFormats = ['json', 'csv'];
        if (!validFormats.includes(format.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: `Formato no válido. Formatos disponibles: ${validFormats.join(', ')}`
            });
        }
        
        // Validar fechas si se proporcionan
        if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de startDate inválido. Use YYYY-MM-DD'
            });
        }
        
        if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de endDate inválido. Use YYYY-MM-DD'
            });
        }
        
        const exportData = await ServicioAsistencias.exportAttendanceData(format, startDate, endDate);
        
        // Configurar headers de respuesta según el formato
        if (format.toLowerCase() === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=asistencias_${new Date().toISOString().split('T')[0]}.csv`);
            res.send(exportData);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=asistencias_${new Date().toISOString().split('T')[0]}.json`);
            res.send(exportData);
        }
    });

    /**
     * Validar integridad de registros de asistencia
     * GET /api/attendance/validate
     */
    static validarIntegridad = manejadorAsincrono(async (req, res) => {
        console.log('🔍 Petición de validación de integridad de asistencias');
        
        const validation = await ServicioAsistencias.validateAttendanceIntegrity();
        
        res.status(200).json({
            success: true,
            data: validation
        });
    });

    /**
     * Obtener resumen de asistencia para múltiples fechas
     * POST /api/attendance/summary
     * Body: { dates: ["2024-01-01", "2024-01-02"] }
     */
    static obtenerResumenMultiplesFechas = manejadorAsincrono(async (req, res) => {
        const { dates } = req.body;
        
        console.log(`📊 Petición de resumen para ${dates?.length || 0} fechas`);
        
        if (!dates || !Array.isArray(dates) || dates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de fechas'
            });
        }
        
        if (dates.length > 31) {
            return res.status(400).json({
                success: false,
                error: 'Máximo 31 fechas permitidas'
            });
        }
        
        // Validar formato de fechas
        const invalidDates = dates.filter(date => !/^\d{4}-\d{2}-\d{2}$/.test(date));
        if (invalidDates.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Fechas con formato inválido: ${invalidDates.join(', ')}`
            });
        }
        
        const summaries = {};
        
        for (const date of dates) {
            try {
                const stats = await ServicioAsistencias.getAttendanceStats(date);
                summaries[date] = stats;
            } catch (error) {
                summaries[date] = {
                    error: error.message,
                    date
                };
            }
        }
        
        res.status(200).json({
            success: true,
            data: {
                summaries,
                totalDates: dates.length,
                successfulDates: Object.keys(summaries).filter(date => !summaries[date].error).length
            }
        });
    });
}

module.exports = ControladorAsistencias;