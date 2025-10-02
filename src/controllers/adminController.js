const AdminService = require('../services/adminService');
const StudentService = require('../services/studentService');
const AttendanceService = require('../services/attendanceService');
const SystemService = require('../services/systemService');
const { asyncHandler } = require('../middleware/errorHandler');

class AdminController {
    /**
     * Obtener estadísticas generales del sistema
     * GET /api/admin/stats
     */
    static getSystemStats = asyncHandler(async (req, res) => {
        console.log('📊 Petición de estadísticas del sistema');
        
        const { date } = req.query;
        
        const stats = await AttendanceService.getAttendanceStats(date);
        
        res.status(200).json({
            success: true,
            data: stats
        });
    });

    /**
     * Obtener lista detallada de asistencia
     * GET /api/admin/detailed-list
     */
    static getDetailedList = asyncHandler(async (req, res) => {
        console.log('📋 Petición de lista detallada');
        
        const { date } = req.query;
        
        const detailedList = await AttendanceService.getDetailedAttendanceList(date);
        
        res.status(200).json({
            success: true,
            data: detailedList
        });
    });

    /**
     * Subir lista de estudiantes
     * POST /api/admin/upload-students
     */
    static uploadStudents = asyncHandler(async (req, res) => {
        console.log('📤 Petición de subida de estudiantes');
        
        const { students } = req.body;
        
        const result = await StudentService.updateStudentsList(students);
        
        // Limpiar registros de asistencia al subir nueva lista
        await AttendanceService.clearAttendanceRecords();
        
        res.status(200).json({
            success: true,
            message: `${result.validStudents} ${result.message}. Registros de asistencia reiniciados.`,
            data: {
                totalProcessed: result.totalProcessed,
                validStudents: result.validStudents,
                duplicatesRemoved: result.duplicatesRemoved,
                errorsCount: result.errors.length,
                errors: result.errors
            }
        });
    });

    /**
     * Cambiar contraseña de administrador
     * POST /api/admin/change-password
     */
    static changePassword = asyncHandler(async (req, res) => {
        console.log('🔐 Petición de cambio de contraseña');
        
        const { currentPassword, newPassword } = req.body;
        const username = req.admin.username;
        
        const result = await AdminService.changePassword(username, currentPassword, newPassword);
        
        res.status(200).json({
            success: true,
            message: result.message,
            timestamp: result.timestamp
        });
    });

    /**
     * Obtener información del administrador actual
     * GET /api/admin/profile
     */
    static getProfile = asyncHandler(async (req, res) => {
        console.log('👤 Petición de perfil de administrador');
        
        const username = req.admin.username;
        const admin = await AdminService.findByUsername(username);
        
        if (!admin) {
            return res.status(404).json({
                success: false,
                error: 'Administrador no encontrado'
            });
        }
        
        res.status(200).json({
            success: true,
            data: admin.toSafeJSON()
        });
    });

    /**
     * Obtener estado del sistema
     * GET /api/admin/system-status
     */
    static getSystemStatus = asyncHandler(async (req, res) => {
        console.log('🏥 Petición de estado del sistema');
        
        const status = await SystemService.getSystemStatus();
        
        res.status(200).json({
            success: true,
            data: status
        });
    });

    /**
     * Ejecutar diagnósticos del sistema
     * POST /api/admin/diagnostics
     */
    static runDiagnostics = asyncHandler(async (req, res) => {
        console.log('🔍 Petición de diagnósticos del sistema');
        
        const diagnostics = await SystemService.runSystemDiagnostics();
        
        res.status(200).json({
            success: true,
            data: diagnostics
        });
    });

    /**
     * Crear backup del sistema
     * POST /api/admin/backup
     */
    static createBackup = asyncHandler(async (req, res) => {
        console.log('💾 Petición de backup del sistema');
        
        const backup = await SystemService.createSystemBackup();
        
        res.status(200).json({
            success: true,
            message: 'Backup creado exitosamente',
            data: backup
        });
    });

    /**
     * Limpiar sistema (archivos temporales, backups antiguos)
     * POST /api/admin/cleanup
     */
    static cleanupSystem = asyncHandler(async (req, res) => {
        console.log('🧹 Petición de limpieza del sistema');
        
        const cleanup = await SystemService.cleanupSystem();
        
        res.status(200).json({
            success: true,
            message: 'Limpieza completada exitosamente',
            data: cleanup
        });
    });

    /**
     * Obtener estadísticas de estudiantes
     * GET /api/admin/students/stats
     */
    static getStudentStats = asyncHandler(async (req, res) => {
        console.log('📚 Petición de estadísticas de estudiantes');
        
        const stats = await StudentService.getStudentStats();
        
        res.status(200).json({
            success: true,
            data: stats
        });
    });

    /**
     * Buscar estudiantes con filtros
     * GET /api/admin/students/search
     */
    static searchStudents = asyncHandler(async (req, res) => {
        console.log('🔍 Petición de búsqueda de estudiantes');
        
        const filters = {
            matricula: req.query.matricula,
            nombre: req.query.nombre,
            grupo: req.query.grupo,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            page: req.query.page,
            limit: req.query.limit
        };
        
        // Remover filtros vacíos
        Object.keys(filters).forEach(key => {
            if (!filters[key]) delete filters[key];
        });
        
        const results = await StudentService.searchStudents(filters);
        
        res.status(200).json({
            success: true,
            data: results
        });
    });

    /**
     * Validar integridad de datos de estudiantes
     * GET /api/admin/students/validate
     */
    static validateStudentsIntegrity = asyncHandler(async (req, res) => {
        console.log('🔍 Petición de validación de integridad de estudiantes');
        
        const validation = await StudentService.validateDataIntegrity();
        
        res.status(200).json({
            success: true,
            data: validation
        });
    });

    /**
     * Validar integridad de datos de asistencias
     * GET /api/admin/attendance/validate
     */
    static validateAttendanceIntegrity = asyncHandler(async (req, res) => {
        console.log('🔍 Petición de validación de integridad de asistencias');
        
        const validation = await AttendanceService.validateAttendanceIntegrity();
        
        res.status(200).json({
            success: true,
            data: validation
        });
    });

    /**
     * Obtener estadísticas de administradores
     * GET /api/admin/admins/stats
     */
    static getAdminStats = asyncHandler(async (req, res) => {
        console.log('👥 Petición de estadísticas de administradores');
        
        const stats = await AdminService.getAdminStats();
        
        res.status(200).json({
            success: true,
            data: stats
        });
    });

    /**
     * Limpiar registros de asistencia
     * DELETE /api/admin/attendance/clear
     */
    static clearAttendanceRecords = asyncHandler(async (req, res) => {
        console.log('🧹 Petición de limpieza de registros de asistencia');
        
        await AttendanceService.clearAttendanceRecords();
        
        res.status(200).json({
            success: true,
            message: 'Registros de asistencia limpiados exitosamente'
        });
    });

    /**
     * Exportar todos los datos del sistema
     * GET /api/admin/export-all
     */
    static exportAllData = asyncHandler(async (req, res) => {
        console.log('📤 Petición de exportación completa de datos');
        
        const { format = 'json' } = req.query;
        
        // Obtener todos los datos
        const students = await StudentService.getAllStudents();
        const attendances = await AttendanceService.getAllAttendances();
        const systemStatus = await SystemService.getSystemStatus();
        
        const exportData = {
            exportInfo: {
                timestamp: new Date().toISOString(),
                format,
                version: '1.0.0'
            },
            systemStatus: {
                environment: systemStatus.environment,
                uptime: systemStatus.uptime
            },
            data: {
                students: students.map(s => s.toJSON()),
                attendances: attendances.map(a => a.toJSON()),
                totals: {
                    students: students.length,
                    attendances: attendances.length
                }
            }
        };
        
        if (format.toLowerCase() === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=sistema_completo_${new Date().toISOString().split('T')[0]}.json`);
            res.json(exportData);
        } else {
            res.status(400).json({
                success: false,
                error: 'Formato no soportado para exportación completa. Use JSON.'
            });
        }
    });

    /**
     * Obtener resumen ejecutivo
     * GET /api/admin/executive-summary
     */
    static getExecutiveSummary = asyncHandler(async (req, res) => {
        console.log('📈 Petición de resumen ejecutivo');
        
        const { period = '7' } = req.query; // Días hacia atrás
        const days = parseInt(period);
        
        if (days < 1 || days > 90) {
            return res.status(400).json({
                success: false,
                error: 'El período debe estar entre 1 y 90 días'
            });
        }
        
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // Obtener datos
        const [studentStats, attendanceReport, systemStatus] = await Promise.all([
            StudentService.getStudentStats(),
            AttendanceService.getAttendanceReport(startDate, endDate),
            SystemService.getSystemStatus()
        ]);
        
        const summary = {
            period: {
                days,
                startDate,
                endDate
            },
            overview: {
                totalStudents: studentStats.total,
                avgDailyAttendance: attendanceReport.summary.avgDailyAttendance,
                avgAttendanceRate: `${attendanceReport.summary.avgAttendanceRate}%`,
                systemUptime: `${Math.round(systemStatus.uptime / 3600)}h`
            },
            trends: {
                attendanceByDay: attendanceReport.dailyStats,
                groupDistribution: studentStats.groups,
                topAttenders: attendanceReport.studentAttendance
                    .filter(s => s.daysPresent > 0)
                    .slice(0, 10)
                    .map(s => ({
                        nombre: s.student.nombre,
                        grupo: s.student.grupo,
                        attendanceRate: s.attendanceRate + '%',
                        daysPresent: s.daysPresent
                    }))
            },
            alerts: [],
            recommendations: []
        };
        
        // Generar alertas
        if (parseFloat(attendanceReport.summary.avgAttendanceRate) < 80) {
            summary.alerts.push({
                type: 'warning',
                message: `Tasa de asistencia promedio baja: ${attendanceReport.summary.avgAttendanceRate}%`
            });
            summary.recommendations.push('Revisar posibles causas de ausentismo');
        }
        
        if (systemStatus.uptime > 7 * 24 * 3600) { // 7 días
            summary.recommendations.push('Considere reinicio programado del sistema');
        }
        
        res.status(200).json({
            success: true,
            data: summary
        });
    });

    /**
     * Obtener métricas en tiempo real
     * GET /api/admin/realtime-metrics
     */
    static getRealtimeMetrics = asyncHandler(async (req, res) => {
        console.log('⚡ Petición de métricas en tiempo real');
        
        const [todayStats, systemStatus] = await Promise.all([
            AttendanceService.getAttendanceStats(),
            SystemService.getSystemStatus()
        ]);
        
        const metrics = {
            timestamp: new Date().toISOString(),
            attendance: {
                today: {
                    present: todayStats.presentRegistered,
                    total: todayStats.totalStudents,
                    rate: parseFloat(todayStats.attendanceRate),
                    lastUpdate: todayStats.lastUpdate
                }
            },
            system: {
                uptime: Math.round(systemStatus.uptime),
                memoryUsage: Math.round(systemStatus.memory.rss / 1024 / 1024), // MB
                filesStatus: Object.values(systemStatus.files).every(f => f.exists)
            }
        };
        
        res.status(200).json({
            success: true,
            data: metrics
        });
    });
}

module.exports = AdminController;