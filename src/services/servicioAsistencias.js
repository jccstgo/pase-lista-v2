const Asistencia = require('../models/Asistencia');
const ServicioEstudiantes = require('./servicioEstudiantes');
const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const ServicioDispositivos = require('./servicioDispositivos');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

class ServicioAsistencias {
    static mapearFilaAAsistencia(row) {
        return Asistencia.fromDatabaseRow({
            ...row,
            timestamp: row?.recorded_at,
            date: row?.attendance_date
        });
    }

    static async obtenerTodasLasAsistencias() {
        try {
            const rows = await servicioBaseDatos.all(`
                SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                FROM attendances
                ORDER BY recorded_at DESC
            `);

            const asistencias = rows.map(row => this.mapearFilaAAsistencia(row));
            console.log(`📝 Cargadas ${asistencias.length} asistencias desde la base de datos`);
            return asistencias;
        } catch (error) {
            console.error('❌ Error obteniendo asistencias:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener asistencias', 500, 'ATTENDANCES_LOAD_ERROR');
        }
    }

    static async registrarAsistencia(solicitudAsistencia) {
        try {
            const solicitud = typeof solicitudAsistencia === 'object' && solicitudAsistencia !== null
                ? solicitudAsistencia
                : { matricula: solicitudAsistencia };

            if (!solicitud.matricula) {
                throw new ErrorAplicacion('Matrícula es requerida', 400, 'MISSING_MATRICULA');
            }

            const matriculaNormalizada = solicitud.matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            console.log(`📝 Registrando asistencia para: ${matriculaNormalizada}`);

            const estudiante = await ServicioEstudiantes.buscarPorMatricula(matriculaNormalizada);

            if (!estudiante) {
                throw new ErrorAplicacion(
                    config.MESSAGES.ERROR.STUDENT_NOT_FOUND,
                    404,
                    'STUDENT_NOT_REGISTERED'
                );
            }

            const fechaAsistencia = new Date().toISOString().split('T')[0];
            const asistenciaExistente = await servicioBaseDatos.get(
                `SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE matricula = $1 AND attendance_date = $2`,
                [matriculaNormalizada, fechaAsistencia]
            );

            if (asistenciaExistente) {
                const asistenciaRegistrada = this.mapearFilaAAsistencia(asistenciaExistente);
                const horaFormateada = asistenciaRegistrada.obtenerHoraFormateada();
                throw new ErrorAplicacion(
                    `Ya se registró su asistencia hoy a las ${horaFormateada}`,
                    409,
                    'ALREADY_REGISTERED_TODAY'
                );
            }

            const timestamp = new Date().toISOString();
            const inserted = await servicioBaseDatos.get(
                `INSERT INTO attendances (matricula, nombre, grupo, attendance_date, recorded_at, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                 RETURNING id, matricula, nombre, grupo, attendance_date, recorded_at, status`,
                [
                    estudiante.matricula,
                    estudiante.nombre,
                    estudiante.grupo,
                    fechaAsistencia,
                    timestamp,
                    'registered'
                ]
            );

            const asistencia = this.mapearFilaAAsistencia(inserted);

            await ServicioDispositivos.registerDeviceUsage({
                matricula: estudiante.matricula,
                deviceFingerprint: solicitud.deviceFingerprint,
                userAgent: solicitud.userAgent
            });

            console.log(`✅ Asistencia registrada: ${estudiante.nombre} (${matriculaNormalizada})`);

            return {
                success: true,
                message: `¡Asistencia registrada exitosamente!<br>Grado y Nombre: <strong>${estudiante.nombre}</strong><br>Grupo: <strong>${estudiante.grupo}</strong>`,
                attendance: asistencia.toJSON(),
                student: estudiante.toJSON()
            };
        } catch (error) {
            console.error('❌ Error registrando asistencia:', error);
            if (error?.code === '23505') {
                throw new ErrorAplicacion(
                    config.MESSAGES.ERROR.ALREADY_REGISTERED,
                    409,
                    'ALREADY_REGISTERED_TODAY'
                );
            }
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al registrar asistencia', 500, 'ATTENDANCE_REGISTER_ERROR');
        }
    }

    static async buscarAsistenciaDeHoy(matricula) {
        try {
            const matriculaNormalizada = matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            const fechaHoy = new Date().toISOString().split('T')[0];

            const row = await servicioBaseDatos.get(
                `SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE matricula = $1 AND attendance_date = $2`,
                [matriculaNormalizada, fechaHoy]
            );

            return row ? this.mapearFilaAAsistencia(row) : null;
        } catch (error) {
            console.error('❌ Error buscando asistencia del día:', error);
            throw new ErrorAplicacion('Error al buscar asistencia', 500, 'ATTENDANCE_SEARCH_ERROR');
        }
    }

    static async obtenerAsistenciasPorFecha(fecha = null) {
        try {
            const fechaObjetivo = fecha || new Date().toISOString().split('T')[0];
            const rows = await servicioBaseDatos.all(
                `SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE attendance_date = $1
                 ORDER BY recorded_at ASC`,
                [fechaObjetivo]
            );

            return rows.map(row => this.mapearFilaAAsistencia(row));
        } catch (error) {
            console.error('❌ Error obteniendo asistencias por fecha:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener asistencias por fecha', 500, 'ATTENDANCE_DATE_ERROR');
        }
    }

    static async obtenerEstadisticasAsistencias(fecha = null) {
        try {
            const estudiantes = await ServicioEstudiantes.obtenerTodosLosEstudiantes();
            const fechaObjetivo = fecha || new Date().toISOString().split('T')[0];
            const asistencias = await this.obtenerAsistenciasPorFecha(fechaObjetivo);

            const presentesRegistrados = asistencias.filter(asistencia => asistencia.status === 'registered');
            const matriculasPresentes = new Set(presentesRegistrados.map(asistencia => asistencia.matricula));
            const estudiantesAusentes = estudiantes.filter(estudiante => !matriculasPresentes.has(estudiante.matricula));

            const estadisticas = {
                date: fechaObjetivo,
                totalStudents: estudiantes.length,
                presentRegistered: presentesRegistrados.length,
                presentNotInList: 0,
                absent: estudiantesAusentes.length,
                totalPresent: presentesRegistrados.length,
                attendanceRate: estudiantes.length > 0 ? ((presentesRegistrados.length / estudiantes.length) * 100).toFixed(1) : 0,
                byGroup: this.obtenerEstadisticasPorGrupo(estudiantes, presentesRegistrados),
                lastUpdate: new Date().toISOString()
            };

            console.log(`📊 Estadísticas calculadas para ${fechaObjetivo}:`, {
                total: estadisticas.totalStudents,
                present: estadisticas.presentRegistered,
                absent: estadisticas.absent,
                rate: `${estadisticas.attendanceRate}%`
            });

            return estadisticas;
        } catch (error) {
            console.error('❌ Error calculando estadísticas:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al calcular estadísticas', 500, 'STATS_CALCULATION_ERROR');
        }
    }

    static obtenerEstadisticasPorGrupo(estudiantes, asistencias) {
        const estadisticasPorGrupo = {};

        estudiantes.forEach(estudiante => {
            if (!estadisticasPorGrupo[estudiante.grupo]) {
                estadisticasPorGrupo[estudiante.grupo] = {
                    total: 0,
                    present: 0,
                    absent: 0,
                    attendanceRate: 0
                };
            }
            estadisticasPorGrupo[estudiante.grupo].total++;
        });

        asistencias.forEach(asistencia => {
            if (estadisticasPorGrupo[asistencia.grupo]) {
                estadisticasPorGrupo[asistencia.grupo].present++;
            }
        });

        Object.keys(estadisticasPorGrupo).forEach(grupo => {
            const resumenGrupo = estadisticasPorGrupo[grupo];
            resumenGrupo.absent = resumenGrupo.total - resumenGrupo.present;
            resumenGrupo.attendanceRate = resumenGrupo.total > 0
                ? ((resumenGrupo.present / resumenGrupo.total) * 100).toFixed(1)
                : 0;
        });

        return estadisticasPorGrupo;
    }

    static async obtenerListaDetalladaAsistencias(fecha = null) {
        try {
            const estudiantes = await ServicioEstudiantes.obtenerTodosLosEstudiantes();
            const fechaObjetivo = fecha || new Date().toISOString().split('T')[0];
            const asistencias = await this.obtenerAsistenciasPorFecha(fechaObjetivo);

            const presentesRegistrados = asistencias
                .filter(asistencia => asistencia.status === 'registered')
                .map(asistencia => ({
                    matricula: asistencia.matricula,
                    nombre: asistencia.nombre,
                    grupo: asistencia.grupo,
                    timestamp: asistencia.timestamp,
                    status: 'Presente (En lista)',
                    formattedTime: asistencia.obtenerHoraFormateada()
                }));

            const matriculasPresentes = new Set(asistencias.map(asistencia => asistencia.matricula));
            const ausentes = estudiantes
                .filter(estudiante => !matriculasPresentes.has(estudiante.matricula))
                .map(estudiante => ({
                    matricula: estudiante.matricula,
                    nombre: estudiante.nombre,
                    grupo: estudiante.grupo,
                    timestamp: null,
                    status: 'Ausente',
                    formattedTime: '-'
                }));

            return {
                date: fechaObjetivo,
                formattedDate: new Date(fechaObjetivo).toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                presentRegistered: presentesRegistrados.sort((a, b) => a.nombre.localeCompare(b.nombre)),
                presentNotInList: [],
                absent: ausentes.sort((a, b) => a.nombre.localeCompare(b.nombre)),
                summary: {
                    totalStudents: estudiantes.length,
                    present: presentesRegistrados.length,
                    absent: ausentes.length,
                    attendanceRate: estudiantes.length > 0 ? ((presentesRegistrados.length / estudiantes.length) * 100).toFixed(1) : 0
                }
            };
        } catch (error) {
            console.error('❌ Error obteniendo lista detallada:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener lista detallada', 500, 'DETAILED_LIST_ERROR');
        }
    }

    static async limpiarRegistrosAsistencias() {
        try {
            const result = await servicioBaseDatos.run('DELETE FROM attendances');
            console.log('🧹 Registros de asistencia limpiados en la base de datos');
            return result.rowCount;
        } catch (error) {
            console.error('❌ Error limpiando registros:', error);
            throw new ErrorAplicacion('Error al limpiar registros de asistencia', 500, 'CLEAR_RECORDS_ERROR');
        }
    }

    static async obtenerReporteAsistencias(fechaInicio, fechaFin) {
        try {
            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE attendance_date BETWEEN $1 AND $2
                 ORDER BY attendance_date ASC, recorded_at ASC`,
                [fechaInicio, fechaFin]
            );

            const asistencias = rows.map(row => this.mapearFilaAAsistencia(row));
            const estudiantes = await ServicioEstudiantes.obtenerTodosLosEstudiantes();

            const asistenciasReporte = asistencias;
            const estadisticasDiarias = {};
            const asistenciaPorEstudiante = {};

            estudiantes.forEach(estudiante => {
                asistenciaPorEstudiante[estudiante.matricula] = {
                    student: estudiante.toJSON(),
                    daysPresent: 0,
                    daysAbsent: 0,
                    attendanceDates: []
                };
            });

            const fechaActual = new Date(fechaInicio);
            const fechaFinObjeto = new Date(fechaFin);

            while (fechaActual <= fechaFinObjeto) {
                const fechaCadena = fechaActual.toISOString().split('T')[0];
                const asistenciasDelDia = asistenciasReporte.filter(asistencia => asistencia.date === fechaCadena);

                estadisticasDiarias[fechaCadena] = {
                    date: fechaCadena,
                    present: asistenciasDelDia.length,
                    absent: estudiantes.length - asistenciasDelDia.length,
                    attendanceRate: estudiantes.length > 0 ? ((asistenciasDelDia.length / estudiantes.length) * 100).toFixed(1) : 0
                };

                const presentesHoy = new Set(asistenciasDelDia.map(asistencia => asistencia.matricula));

                estudiantes.forEach(estudiante => {
                    if (presentesHoy.has(estudiante.matricula)) {
                        asistenciaPorEstudiante[estudiante.matricula].daysPresent++;
                        asistenciaPorEstudiante[estudiante.matricula].attendanceDates.push(fechaCadena);
                    } else {
                        asistenciaPorEstudiante[estudiante.matricula].daysAbsent++;
                    }
                });

                fechaActual.setDate(fechaActual.getDate() + 1);
            }

            const totalDias = Object.keys(estadisticasDiarias).length;

            return {
                period: {
                    startDate: fechaInicio,
                    endDate: fechaFin,
                    totalDays: totalDias
                },
                summary: {
                    totalStudents: estudiantes.length,
                    avgDailyAttendance: totalDias > 0 ? (Object.values(estadisticasDiarias).reduce((suma, dia) => suma + dia.present, 0) / totalDias).toFixed(1) : 0,
                    avgAttendanceRate: totalDias > 0 ? (Object.values(estadisticasDiarias).reduce((suma, dia) => suma + parseFloat(dia.attendanceRate), 0) / totalDias).toFixed(1) : 0
                },
                dailyStats: estadisticasDiarias,
                studentAttendance: Object.values(asistenciaPorEstudiante)
                    .map(registro => ({
                        ...registro,
                        attendanceRate: totalDias > 0 ? ((registro.daysPresent / totalDias) * 100).toFixed(1) : 0
                    }))
                    .sort((a, b) => b.attendanceRate - a.attendanceRate)
            };
        } catch (error) {
            console.error('❌ Error generando reporte:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al generar reporte de asistencia', 500, 'REPORT_GENERATION_ERROR');
        }
    }

    static async obtenerHistorialAsistenciasEstudiante(matricula, limite = 30) {
        try {
            const matriculaNormalizada = matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE matricula = $1
                 ORDER BY recorded_at DESC
                 LIMIT $2`,
                [matriculaNormalizada, limite]
            );

            const asistenciasEstudiante = rows.map(row => this.mapearFilaAAsistencia(row));

            if (asistenciasEstudiante.length === 0) {
                return {
                    matricula: matriculaNormalizada,
                    attendances: [],
                    summary: {
                        totalRecords: 0,
                        lastAttendance: null,
                        averageAttendanceTime: null
                    }
                };
            }

            const summary = {
                totalRecords: asistenciasEstudiante.length,
                lastAttendance: asistenciasEstudiante[0].toJSON(),
                averageAttendanceTime: this.calcularTiempoPromedio(asistenciasEstudiante)
            };

            return {
                matricula: matriculaNormalizada,
                attendances: asistenciasEstudiante.map(asistencia => asistencia.toJSON()),
                summary
            };
        } catch (error) {
            console.error('❌ Error obteniendo historial de estudiante:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener historial de asistencia', 500, 'STUDENT_HISTORY_ERROR');
        }
    }

    static calcularTiempoPromedio(asistencias) {
        if (asistencias.length === 0) return null;

        let minutosTotales = 0;
        let registrosValidos = 0;

        asistencias.forEach(asistencia => {
            const hora = new Date(asistencia.timestamp);
            if (!isNaN(hora.getTime())) {
                const minutos = hora.getHours() * 60 + hora.getMinutes();
                minutosTotales += minutos;
                registrosValidos++;
            }
        });

        if (registrosValidos === 0) return null;

        const minutosPromedio = Math.round(minutosTotales / registrosValidos);
        const horas = Math.floor(minutosPromedio / 60);
        const minutosRestantes = minutosPromedio % 60;

        return `${horas.toString().padStart(2, '0')}:${minutosRestantes.toString().padStart(2, '0')}`;
    }

    static async validarIntegridadAsistencias() {
        try {
            const [asistencias, estudiantes] = await Promise.all([
                this.obtenerTodasLasAsistencias(),
                ServicioEstudiantes.obtenerTodosLosEstudiantes()
            ]);
            const incidencias = [];

            const registrosDiarios = new Map();
            asistencias.forEach((asistencia, indice) => {
                const clave = `${asistencia.matricula}-${asistencia.date}`;
                if (registrosDiarios.has(clave)) {
                    incidencias.push({
                        type: 'DUPLICATE_DAILY_RECORD',
                        message: `Registro duplicado para ${asistencia.matricula} en ${asistencia.date}`,
                        indices: [registrosDiarios.get(clave), indice],
                        data: asistencia.toJSON()
                    });
                } else {
                    registrosDiarios.set(clave, indice);
                }
            });

            const matriculasValidas = new Set(estudiantes.map(estudiante => estudiante.matricula));
            asistencias.forEach((asistencia, indice) => {
                if (!matriculasValidas.has(asistencia.matricula)) {
                    incidencias.push({
                        type: 'ORPHANED_RECORD',
                        message: `Asistencia registrada para matrícula no existente: ${asistencia.matricula}`,
                        index: indice,
                        data: asistencia.toJSON()
                    });
                }
            });

            asistencias.forEach((asistencia, indice) => {
                if (isNaN(new Date(asistencia.timestamp).getTime())) {
                    incidencias.push({
                        type: 'INVALID_TIMESTAMP',
                        message: `Timestamp inválido en registro ${indice + 1}: ${asistencia.timestamp}`,
                        index: indice,
                        data: asistencia.toJSON()
                    });
                }
            });

            const now = new Date();
            asistencias.forEach((asistencia, indice) => {
                const fechaAsistencia = new Date(asistencia.timestamp);
                if (fechaAsistencia > now) {
                    incidencias.push({
                        type: 'FUTURE_RECORD',
                        message: `Registro con fecha futura: ${asistencia.timestamp}`,
                        index: indice,
                        data: asistencia.toJSON()
                    });
                }
            });

            return {
                isValid: incidencias.length === 0,
                totalRecords: asistencias.length,
                validStudentReferences: asistencias.length - incidencias.filter(i => i.type === 'ORPHANED_RECORD').length,
                issues: incidencias,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error validando integridad de asistencias:', error);
            throw new ErrorAplicacion('Error al validar integridad de asistencias', 500, 'INTEGRITY_CHECK_ERROR');
        }
    }

    static async exportarDatosAsistencias(formato = 'json', fechaInicio = null, fechaFin = null) {
        try {
            const conditions = [];
            const values = [];
            let paramIndex = 1;

            if (fechaInicio && fechaFin) {
                conditions.push(`attendance_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
                values.push(fechaInicio, fechaFin);
                paramIndex += 2;
            } else if (fechaInicio) {
                conditions.push(`attendance_date >= $${paramIndex}`);
                values.push(fechaInicio);
                paramIndex += 1;
            } else if (fechaFin) {
                conditions.push(`attendance_date <= $${paramIndex}`);
                values.push(fechaFin);
                paramIndex += 1;
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 ${whereClause}
                 ORDER BY attendance_date ASC, recorded_at ASC`,
                values
            );

            const asistencias = rows.map(row => this.mapearFilaAAsistencia(row));

            const exportData = {
                exportDate: new Date().toISOString(),
                period: fechaInicio && fechaFin ? { startDate: fechaInicio, endDate: fechaFin } : 'all',
                totalRecords: asistencias.length,
                data: asistencias.map(asistencia => asistencia.toJSON())
            };

            switch (formato.toLowerCase()) {
                case 'json':
                    return JSON.stringify(exportData, null, 2);
                case 'csv': {
                    const csvHeaders = ['Matricula', 'Nombre', 'Grupo', 'Fecha', 'Hora', 'Status'];
                    const csvRows = asistencias.map(asistencia => [
                        asistencia.matricula,
                        asistencia.nombre,
                        asistencia.grupo,
                        asistencia.date,
                        asistencia.obtenerHoraFormateada(),
                        asistencia.status
                    ]);

                    return [
                        csvHeaders.join(','),
                        ...csvRows.map(row => row.join(','))
                    ].join('\n');
                }
                default:
                    return exportData;
            }
        } catch (error) {
            console.error('❌ Error exportando datos:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al exportar datos de asistencia', 500, 'EXPORT_ERROR');
        }
    }
}

module.exports = ServicioAsistencias;
