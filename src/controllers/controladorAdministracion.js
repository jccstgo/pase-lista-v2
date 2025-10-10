const ServicioAdministracion = require('../services/servicioAdministracion');
const ServicioEstudiantes = require('../services/servicioEstudiantes');
const ServicioAsistencias = require('../services/servicioAsistencias');
const ServicioSistema = require('../services/servicioSistema');
const ServicioConfiguracion = require('../services/servicioConfiguracion');
const ServicioClavesAdministrativas = require('../services/servicioClavesAdministrativas');
const ServicioDispositivos = require('../services/servicioDispositivos');
const { manejadorAsincrono } = require('../middleware/manejadorErrores');

class ControladorAdministracion {
    /**
     * Obtener estadísticas generales del sistema
     * GET /api/admin/stats
     */
    static obtenerEstadisticasSistema = manejadorAsincrono(async (req, res) => {
        console.log('📊 Petición de estadísticas del sistema');
        
        const { date } = req.query;
        
        const stats = await ServicioAsistencias.obtenerEstadisticasAsistencias(date);
        
        res.status(200).json({
            success: true,
            data: stats
        });
    });

    /**
     * Obtener lista detallada de asistencia
     * GET /api/admin/detailed-list
     */
    static obtenerListaDetallada = manejadorAsincrono(async (req, res) => {
        console.log('📋 Petición de lista detallada');
        
        const { date } = req.query;
        
        const detailedList = await ServicioAsistencias.obtenerListaDetalladaAsistencias(date);
        
        res.status(200).json({
            success: true,
            data: detailedList
        });
    });

    /**
     * Subir lista de estudiantes
     * POST /api/admin/upload-students
     */
    static subirEstudiantes = manejadorAsincrono(async (req, res) => {
        console.log('📤 Petición de subida de estudiantes');

        const { students } = req.body;

        const result = await ServicioEstudiantes.actualizarListaEstudiantes(students);

        // Limpiar registros de asistencia al subir nueva lista
        await ServicioAsistencias.limpiarRegistrosAsistencias();
        await ServicioDispositivos.clearAllDevices();

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
     * Limpiar todos los estudiantes de la base de datos
     * DELETE /api/admin/students/clear
     */
    static limpiarEstudiantes = manejadorAsincrono(async (req, res) => {
        console.log('🧹 Petición de limpieza de estudiantes');

        const result = await ServicioEstudiantes.limpiarTodosLosEstudiantes();
        await ServicioAsistencias.limpiarRegistrosAsistencias();
        await ServicioDispositivos.clearAllDevices();

        res.status(200).json({
            success: true,
            message: 'Base de datos de estudiantes limpiada exitosamente. Registros relacionados fueron reiniciados.',
            data: result
        });
    });

    /**
     * Cambiar contraseña de administrador
     * POST /api/admin/change-password
     */
    static cambiarContrasena = manejadorAsincrono(async (req, res) => {
        console.log('🔐 Petición de cambio de contraseña');
        
        const { currentPassword, newPassword } = req.body;
        const username = req.admin.username;
        
        const result = await ServicioAdministracion.changePassword(username, currentPassword, newPassword);
        
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
    static obtenerPerfil = manejadorAsincrono(async (req, res) => {
        console.log('👤 Petición de perfil de administrador');
        
        const username = req.admin.username;
        const admin = await ServicioAdministracion.findByUsername(username);
        
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
    static obtenerEstadoSistema = manejadorAsincrono(async (req, res) => {
        console.log('🏥 Petición de estado del sistema');
        
        const status = await ServicioSistema.getSystemStatus();
        
        res.status(200).json({
            success: true,
            data: status
        });
    });

    /**
     * Ejecutar diagnósticos del sistema
     * POST /api/admin/diagnostics
     */
    static ejecutarDiagnosticos = manejadorAsincrono(async (req, res) => {
        console.log('🔍 Petición de diagnósticos del sistema');
        
        const diagnostics = await ServicioSistema.runSystemDiagnostics();
        
        res.status(200).json({
            success: true,
            data: diagnostics
        });
    });

    /**
     * Crear backup del sistema
     * POST /api/admin/backup
     */
    static crearRespaldo = manejadorAsincrono(async (req, res) => {
        console.log('💾 Petición de backup del sistema');
        
        const backup = await ServicioSistema.createSystemBackup();
        
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
    static limpiarSistema = manejadorAsincrono(async (req, res) => {
        console.log('🧹 Petición de limpieza del sistema');

        const cleanup = await ServicioSistema.cleanupSystem();

        res.status(200).json({
            success: true,
            message: 'Limpieza completada exitosamente',
            data: cleanup
        });
    });

    /**
     * Obtener configuración del sistema (restricciones)
     * GET /api/admin/config
     */
    static obtenerConfiguracionSistema = manejadorAsincrono(async (req, res) => {
        console.log('⚙️ Petición de configuración del sistema');

        const systemConfig = await ServicioConfiguracion.getSystemConfig();
        res.status(200).json(systemConfig);
    });

    /**
     * Actualizar configuración del sistema (restricciones)
     * POST /api/admin/config
     */
    static actualizarConfiguracionSistema = manejadorAsincrono(async (req, res) => {
        console.log('💾 Petición de guardado de configuración');

        const updatedConfig = await ServicioConfiguracion.saveSystemConfig(req.body || {});
        res.status(200).json(updatedConfig);
    });

    /**
     * Obtener claves administrativas
     * GET /api/admin/admin-keys
     */
    static obtenerClavesAdministrativas = manejadorAsincrono(async (req, res) => {
        console.log('🔑 Petición de listado de claves administrativas');

        const keys = await ServicioClavesAdministrativas.getAllKeys();
        res.status(200).json(keys);
    });

    /**
     * Crear nueva clave administrativa
     * POST /api/admin/admin-keys
     */
    static crearClaveAdministrativa = manejadorAsincrono(async (req, res) => {
        console.log('➕ Petición de creación de clave administrativa');

        const { key, description } = req.body || {};
        const newKey = await ServicioClavesAdministrativas.createKey(key, description);

        res.status(201).json(newKey);
    });

    /**
     * Desactivar clave administrativa
     * DELETE /api/admin/admin-keys/:key
     */
    static desactivarClaveAdministrativa = manejadorAsincrono(async (req, res) => {
        const { key } = req.params;
        console.log(`🗝️ Petición de desactivación de clave: ${key}`);

        const updatedKey = await ServicioClavesAdministrativas.deactivateKey(key);
        res.status(200).json(updatedKey);
    });

    /**
     * Obtener dispositivos registrados
     * GET /api/admin/devices
     */
    static obtenerDispositivosRegistrados = manejadorAsincrono(async (req, res) => {
        console.log('📱 Petición de dispositivos registrados');

        const devices = await ServicioDispositivos.getAllDevices();
        res.status(200).json(devices);
    });

    /**
     * Obtener estadísticas de estudiantes
     * GET /api/admin/students/stats
     */
    static obtenerEstadisticasEstudiantes = manejadorAsincrono(async (req, res) => {
        console.log('📚 Petición de estadísticas de estudiantes');
        
        const stats = await ServicioEstudiantes.obtenerEstadisticasEstudiantes();
        
        res.status(200).json({
            success: true,
            data: stats
        });
    });

    /**
     * Buscar estudiantes con filtros
     * GET /api/admin/students/search
     */
    static buscarEstudiantes = manejadorAsincrono(async (req, res) => {
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
        
        const results = await ServicioEstudiantes.buscarEstudiantes(filters);
        
        res.status(200).json({
            success: true,
            data: results
        });
    });

    /**
     * Validar integridad de datos de estudiantes
     * GET /api/admin/students/validate
     */
    static validarIntegridadEstudiantes = manejadorAsincrono(async (req, res) => {
        console.log('🔍 Petición de validación de integridad de estudiantes');
        
        const validation = await ServicioEstudiantes.validarIntegridadDatos();
        
        res.status(200).json({
            success: true,
            data: validation
        });
    });

    /**
     * Validar integridad de datos de asistencias
     * GET /api/admin/attendance/validate
     */
    static validarIntegridadAsistencias = manejadorAsincrono(async (req, res) => {
        console.log('🔍 Petición de validación de integridad de asistencias');
        
        const validation = await ServicioAsistencias.validarIntegridadAsistencias();
        
        res.status(200).json({
            success: true,
            data: validation
        });
    });

    /**
     * Obtener estadísticas de administradores
     * GET /api/admin/admins/stats
     */
    static obtenerEstadisticasAdministradores = manejadorAsincrono(async (req, res) => {
        console.log('👥 Petición de estadísticas de administradores');
        
        const stats = await ServicioAdministracion.getAdminStats();
        
        res.status(200).json({
            success: true,
            data: stats
        });
    });

    /**
     * Limpiar registros de asistencia
     * DELETE /api/admin/attendance/clear
     */
    static limpiarRegistrosAsistencia = manejadorAsincrono(async (req, res) => {
        console.log('🧹 Petición de limpieza de registros de asistencia');
        
        await ServicioAsistencias.limpiarRegistrosAsistencias();
        
        res.status(200).json({
            success: true,
            message: 'Registros de asistencia limpiados exitosamente'
        });
    });

    /**
     * Exportar todos los datos del sistema
     * GET /api/admin/export-all
     */
    static exportarTodosLosDatos = manejadorAsincrono(async (req, res) => {
        console.log('📤 Petición de exportación completa de datos');
        
        const { format = 'json' } = req.query;
        
        // Obtener todos los datos
        const estudiantes = await ServicioEstudiantes.obtenerTodosLosEstudiantes();
        const asistencias = await ServicioAsistencias.obtenerTodasLasAsistencias();
        const estadoSistema = await ServicioSistema.getSystemStatus();

        const datosExportacion = {
            exportInfo: {
                timestamp: new Date().toISOString(),
                format,
                version: '1.0.0'
            },
            systemStatus: {
                environment: estadoSistema.environment,
                uptime: estadoSistema.uptime
            },
            data: {
                students: estudiantes.map(estudiante => estudiante.toJSON()),
                attendances: asistencias.map(asistencia => asistencia.toJSON()),
                totals: {
                    students: estudiantes.length,
                    attendances: asistencias.length
                }
            }
        };

        if (format.toLowerCase() === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=sistema_completo_${new Date().toISOString().split('T')[0]}.json`);
            res.json(datosExportacion);
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
    static obtenerResumenEjecutivo = manejadorAsincrono(async (req, res) => {
        console.log('📈 Petición de resumen ejecutivo');
        
        const { period = '7' } = req.query; // Días hacia atrás
        const dias = parseInt(period);

        if (dias < 1 || dias > 90) {
            return res.status(400).json({
                success: false,
                error: 'El período debe estar entre 1 y 90 días'
            });
        }

        const fechaFin = new Date().toISOString().split('T')[0];
        const fechaInicio = new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Obtener datos
        const [estadisticasEstudiantes, reporteAsistencias, estadoSistema] = await Promise.all([
            ServicioEstudiantes.obtenerEstadisticasEstudiantes(),
            ServicioAsistencias.obtenerReporteAsistencias(fechaInicio, fechaFin),
            ServicioSistema.getSystemStatus()
        ]);

        const resumen = {
            period: {
                days: dias,
                startDate: fechaInicio,
                endDate: fechaFin
            },
            overview: {
                totalStudents: estadisticasEstudiantes.total,
                avgDailyAttendance: reporteAsistencias.summary.avgDailyAttendance,
                avgAttendanceRate: `${reporteAsistencias.summary.avgAttendanceRate}%`,
                systemUptime: `${Math.round(estadoSistema.uptime / 3600)}h`
            },
            trends: {
                attendanceByDay: reporteAsistencias.dailyStats,
                groupDistribution: estadisticasEstudiantes.groups,
                topAttenders: reporteAsistencias.studentAttendance
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
        if (parseFloat(reporteAsistencias.summary.avgAttendanceRate) < 80) {
            resumen.alerts.push({
                type: 'warning',
                message: `Tasa de asistencia promedio baja: ${reporteAsistencias.summary.avgAttendanceRate}%`
            });
            resumen.recommendations.push('Revisar posibles causas de ausentismo');
        }

        if (estadoSistema.uptime > 7 * 24 * 3600) { // 7 días
            resumen.recommendations.push('Considere reinicio programado del sistema');
        }

        res.status(200).json({
            success: true,
            data: resumen
        });
    });

    /**
     * Obtener métricas en tiempo real
     * GET /api/admin/realtime-metrics
     */
    static obtenerMetricasTiempoReal = manejadorAsincrono(async (req, res) => {
        console.log('⚡ Petición de métricas en tiempo real');
        
        const [estadisticasHoy, estadoSistema] = await Promise.all([
            ServicioAsistencias.obtenerEstadisticasAsistencias(),
            ServicioSistema.getSystemStatus()
        ]);

        const metricas = {
            timestamp: new Date().toISOString(),
            attendance: {
                today: {
                    present: estadisticasHoy.presentRegistered,
                    total: estadisticasHoy.totalStudents,
                    rate: parseFloat(estadisticasHoy.attendanceRate),
                    lastUpdate: estadisticasHoy.lastUpdate
                }
            },
            system: {
                uptime: Math.round(estadoSistema.uptime),
                memoryUsage: Math.round(estadoSistema.memory.rss / 1024 / 1024), // MB
                filesStatus: Object.values(estadoSistema.files).every(f => f.exists)
            }
        };

        res.status(200).json({
            success: true,
            data: metricas
        });
    });
}

module.exports = ControladorAdministracion;
