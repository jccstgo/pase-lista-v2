const Asistencia = require('../models/Asistencia');
const ServicioEstudiantes = require('./servicioEstudiantes');
const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const ServicioDispositivos = require('./servicioDispositivos');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

class ServicioAsistencias {
    static mapRowToAttendance(row) {
        return Asistencia.fromDatabaseRow({
            ...row,
            timestamp: row?.recorded_at,
            date: row?.attendance_date
        });
    }

    static async getAllAttendances() {
        try {
            const rows = await servicioBaseDatos.all(`
                SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                FROM attendances
                ORDER BY recorded_at DESC
            `);

            const attendances = rows.map(row => this.mapRowToAttendance(row));
            console.log(`📝 Cargadas ${attendances.length} asistencias desde la base de datos`);
            return attendances;
        } catch (error) {
            console.error('❌ Error obteniendo asistencias:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener asistencias', 500, 'ATTENDANCES_LOAD_ERROR');
        }
    }

    static async registerAttendance(attendanceRequest) {
        try {
            const request = typeof attendanceRequest === 'object' && attendanceRequest !== null
                ? attendanceRequest
                : { matricula: attendanceRequest };

            if (!request.matricula) {
                throw new ErrorAplicacion('Matrícula es requerida', 400, 'MISSING_MATRICULA');
            }

            const cleanMatricula = request.matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            console.log(`📝 Registrando asistencia para: ${cleanMatricula}`);

            const student = await ServicioEstudiantes.findByMatricula(cleanMatricula);

            if (!student) {
                throw new ErrorAplicacion(
                    config.MESSAGES.ERROR.STUDENT_NOT_FOUND,
                    404,
                    'STUDENT_NOT_REGISTERED'
                );
            }

            const attendanceDate = new Date().toISOString().split('T')[0];
            const existingAttendance = await servicioBaseDatos.get(
                `SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE matricula = $1 AND attendance_date = $2`,
                [cleanMatricula, attendanceDate]
            );

            if (existingAttendance) {
                const attendance = this.mapRowToAttendance(existingAttendance);
                const timeStr = attendance.getFormattedTime();
                throw new ErrorAplicacion(
                    `Ya se registró su asistencia hoy a las ${timeStr}`,
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
                    student.matricula,
                    student.nombre,
                    student.grupo,
                    attendanceDate,
                    timestamp,
                    'registered'
                ]
            );

            const attendance = this.mapRowToAttendance(inserted);

            await ServicioDispositivos.registerDeviceUsage({
                matricula: student.matricula,
                deviceFingerprint: request.deviceFingerprint,
                userAgent: request.userAgent
            });

            console.log(`✅ Asistencia registrada: ${student.nombre} (${cleanMatricula})`);

            return {
                success: true,
                message: `¡Asistencia registrada exitosamente!<br>Grado y Nombre: <strong>${student.nombre}</strong><br>Grupo: <strong>${student.grupo}</strong>`,
                attendance: attendance.toJSON(),
                student: student.toJSON()
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

    static async findTodayAttendance(matricula) {
        try {
            const cleanMatricula = matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            const today = new Date().toISOString().split('T')[0];

            const row = await servicioBaseDatos.get(
                `SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE matricula = $1 AND attendance_date = $2`,
                [cleanMatricula, today]
            );

            return row ? this.mapRowToAttendance(row) : null;
        } catch (error) {
            console.error('❌ Error buscando asistencia del día:', error);
            throw new ErrorAplicacion('Error al buscar asistencia', 500, 'ATTENDANCE_SEARCH_ERROR');
        }
    }

    static async getAttendancesByDate(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];
            const rows = await servicioBaseDatos.all(
                `SELECT id, matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE attendance_date = $1
                 ORDER BY recorded_at ASC`,
                [targetDate]
            );

            return rows.map(row => this.mapRowToAttendance(row));
        } catch (error) {
            console.error('❌ Error obteniendo asistencias por fecha:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener asistencias por fecha', 500, 'ATTENDANCE_DATE_ERROR');
        }
    }

    static async getAttendanceStats(date = null) {
        try {
            const students = await ServicioEstudiantes.getAllStudents();
            const targetDate = date || new Date().toISOString().split('T')[0];
            const attendances = await this.getAttendancesByDate(targetDate);

            const presentRegistered = attendances.filter(a => a.status === 'registered');
            const presentMatriculas = new Set(presentRegistered.map(a => a.matricula));
            const absentStudents = students.filter(s => !presentMatriculas.has(s.matricula));

            const stats = {
                date: targetDate,
                totalStudents: students.length,
                presentRegistered: presentRegistered.length,
                presentNotInList: 0,
                absent: absentStudents.length,
                totalPresent: presentRegistered.length,
                attendanceRate: students.length > 0 ? ((presentRegistered.length / students.length) * 100).toFixed(1) : 0,
                byGroup: this.getStatsByGroup(students, presentRegistered),
                lastUpdate: new Date().toISOString()
            };

            console.log(`📊 Estadísticas calculadas para ${targetDate}:`, {
                total: stats.totalStudents,
                present: stats.presentRegistered,
                absent: stats.absent,
                rate: `${stats.attendanceRate}%`
            });

            return stats;
        } catch (error) {
            console.error('❌ Error calculando estadísticas:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al calcular estadísticas', 500, 'STATS_CALCULATION_ERROR');
        }
    }

    static getStatsByGroup(students, attendances) {
        const groupStats = {};

        students.forEach(student => {
            if (!groupStats[student.grupo]) {
                groupStats[student.grupo] = {
                    total: 0,
                    present: 0,
                    absent: 0,
                    attendanceRate: 0
                };
            }
            groupStats[student.grupo].total++;
        });

        attendances.forEach(attendance => {
            if (groupStats[attendance.grupo]) {
                groupStats[attendance.grupo].present++;
            }
        });

        Object.keys(groupStats).forEach(grupo => {
            const stats = groupStats[grupo];
            stats.absent = stats.total - stats.present;
            stats.attendanceRate = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : 0;
        });

        return groupStats;
    }

    static async getDetailedAttendanceList(date = null) {
        try {
            const students = await ServicioEstudiantes.getAllStudents();
            const targetDate = date || new Date().toISOString().split('T')[0];
            const attendances = await this.getAttendancesByDate(targetDate);

            const presentRegistered = attendances
                .filter(a => a.status === 'registered')
                .map(attendance => ({
                    matricula: attendance.matricula,
                    nombre: attendance.nombre,
                    grupo: attendance.grupo,
                    timestamp: attendance.timestamp,
                    status: 'Presente (En lista)',
                    formattedTime: attendance.getFormattedTime()
                }));

            const presentMatriculas = new Set(attendances.map(a => a.matricula));
            const absent = students
                .filter(s => !presentMatriculas.has(s.matricula))
                .map(student => ({
                    matricula: student.matricula,
                    nombre: student.nombre,
                    grupo: student.grupo,
                    timestamp: null,
                    status: 'Ausente',
                    formattedTime: '-'
                }));

            return {
                date: targetDate,
                formattedDate: new Date(targetDate).toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                presentRegistered: presentRegistered.sort((a, b) => a.nombre.localeCompare(b.nombre)),
                presentNotInList: [],
                absent: absent.sort((a, b) => a.nombre.localeCompare(b.nombre)),
                summary: {
                    totalStudents: students.length,
                    present: presentRegistered.length,
                    absent: absent.length,
                    attendanceRate: students.length > 0 ? ((presentRegistered.length / students.length) * 100).toFixed(1) : 0
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

    static async clearAttendanceRecords() {
        try {
            const result = await servicioBaseDatos.run('DELETE FROM attendances');
            console.log('🧹 Registros de asistencia limpiados en la base de datos');
            return result.rowCount;
        } catch (error) {
            console.error('❌ Error limpiando registros:', error);
            throw new ErrorAplicacion('Error al limpiar registros de asistencia', 500, 'CLEAR_RECORDS_ERROR');
        }
    }

    static async getAttendanceReport(startDate, endDate) {
        try {
            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE attendance_date BETWEEN $1 AND $2
                 ORDER BY attendance_date ASC, recorded_at ASC`,
                [startDate, endDate]
            );

            const attendances = rows.map(row => this.mapRowToAttendance(row));
            const students = await ServicioEstudiantes.getAllStudents();

            const reportAttendances = attendances;
            const dailyStats = {};
            const studentAttendance = {};

            students.forEach(student => {
                studentAttendance[student.matricula] = {
                    student: student.toJSON(),
                    daysPresent: 0,
                    daysAbsent: 0,
                    attendanceDates: []
                };
            });

            const currentDate = new Date(startDate);
            const endDateObj = new Date(endDate);

            while (currentDate <= endDateObj) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayAttendances = reportAttendances.filter(a => a.date === dateStr);

                dailyStats[dateStr] = {
                    date: dateStr,
                    present: dayAttendances.length,
                    absent: students.length - dayAttendances.length,
                    attendanceRate: students.length > 0 ? ((dayAttendances.length / students.length) * 100).toFixed(1) : 0
                };

                const presentToday = new Set(dayAttendances.map(a => a.matricula));

                students.forEach(student => {
                    if (presentToday.has(student.matricula)) {
                        studentAttendance[student.matricula].daysPresent++;
                        studentAttendance[student.matricula].attendanceDates.push(dateStr);
                    } else {
                        studentAttendance[student.matricula].daysAbsent++;
                    }
                });

                currentDate.setDate(currentDate.getDate() + 1);
            }

            const totalDays = Object.keys(dailyStats).length;

            return {
                period: {
                    startDate,
                    endDate,
                    totalDays
                },
                summary: {
                    totalStudents: students.length,
                    avgDailyAttendance: totalDays > 0 ? (Object.values(dailyStats).reduce((sum, day) => sum + day.present, 0) / totalDays).toFixed(1) : 0,
                    avgAttendanceRate: totalDays > 0 ? (Object.values(dailyStats).reduce((sum, day) => sum + parseFloat(day.attendanceRate), 0) / totalDays).toFixed(1) : 0
                },
                dailyStats,
                studentAttendance: Object.values(studentAttendance)
                    .map(record => ({
                        ...record,
                        attendanceRate: totalDays > 0 ? ((record.daysPresent / totalDays) * 100).toFixed(1) : 0
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

    static async getStudentAttendanceHistory(matricula, limit = 30) {
        try {
            const cleanMatricula = matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, attendance_date, recorded_at, status
                 FROM attendances
                 WHERE matricula = $1
                 ORDER BY recorded_at DESC
                 LIMIT $2`,
                [cleanMatricula, limit]
            );

            const studentAttendances = rows.map(row => this.mapRowToAttendance(row));

            if (studentAttendances.length === 0) {
                return {
                    matricula: cleanMatricula,
                    attendances: [],
                    summary: {
                        totalRecords: 0,
                        lastAttendance: null,
                        averageAttendanceTime: null
                    }
                };
            }

            const summary = {
                totalRecords: studentAttendances.length,
                lastAttendance: studentAttendances[0].toJSON(),
                averageAttendanceTime: this.calculateAverageTime(studentAttendances)
            };

            return {
                matricula: cleanMatricula,
                attendances: studentAttendances.map(a => a.toJSON()),
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

    static calculateAverageTime(attendances) {
        if (attendances.length === 0) return null;

        let totalMinutes = 0;
        let validRecords = 0;

        attendances.forEach(attendance => {
            const time = new Date(attendance.timestamp);
            if (!isNaN(time.getTime())) {
                const minutes = time.getHours() * 60 + time.getMinutes();
                totalMinutes += minutes;
                validRecords++;
            }
        });

        if (validRecords === 0) return null;

        const avgMinutes = Math.round(totalMinutes / validRecords);
        const hours = Math.floor(avgMinutes / 60);
        const minutes = avgMinutes % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    static async validateAttendanceIntegrity() {
        try {
            const [attendances, students] = await Promise.all([
                this.getAllAttendances(),
                ServicioEstudiantes.getAllStudents()
            ]);
            const issues = [];

            const dailyRecords = new Map();
            attendances.forEach((attendance, index) => {
                const key = `${attendance.matricula}-${attendance.date}`;
                if (dailyRecords.has(key)) {
                    issues.push({
                        type: 'DUPLICATE_DAILY_RECORD',
                        message: `Registro duplicado para ${attendance.matricula} en ${attendance.date}`,
                        indices: [dailyRecords.get(key), index],
                        data: attendance.toJSON()
                    });
                } else {
                    dailyRecords.set(key, index);
                }
            });

            const validMatriculas = new Set(students.map(s => s.matricula));
            attendances.forEach((attendance, index) => {
                if (!validMatriculas.has(attendance.matricula)) {
                    issues.push({
                        type: 'ORPHANED_RECORD',
                        message: `Asistencia registrada para matrícula no existente: ${attendance.matricula}`,
                        index,
                        data: attendance.toJSON()
                    });
                }
            });

            attendances.forEach((attendance, index) => {
                if (isNaN(new Date(attendance.timestamp).getTime())) {
                    issues.push({
                        type: 'INVALID_TIMESTAMP',
                        message: `Timestamp inválido en registro ${index + 1}: ${attendance.timestamp}`,
                        index,
                        data: attendance.toJSON()
                    });
                }
            });

            const now = new Date();
            attendances.forEach((attendance, index) => {
                const attendanceDate = new Date(attendance.timestamp);
                if (attendanceDate > now) {
                    issues.push({
                        type: 'FUTURE_RECORD',
                        message: `Registro con fecha futura: ${attendance.timestamp}`,
                        index,
                        data: attendance.toJSON()
                    });
                }
            });

            return {
                isValid: issues.length === 0,
                totalRecords: attendances.length,
                validStudentReferences: attendances.length - issues.filter(i => i.type === 'ORPHANED_RECORD').length,
                issues,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error validando integridad de asistencias:', error);
            throw new ErrorAplicacion('Error al validar integridad de asistencias', 500, 'INTEGRITY_CHECK_ERROR');
        }
    }

    static async exportAttendanceData(format = 'json', startDate = null, endDate = null) {
        try {
            const conditions = [];
            const values = [];
            let paramIndex = 1;

            if (startDate && endDate) {
                conditions.push(`attendance_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
                values.push(startDate, endDate);
                paramIndex += 2;
            } else if (startDate) {
                conditions.push(`attendance_date >= $${paramIndex}`);
                values.push(startDate);
                paramIndex += 1;
            } else if (endDate) {
                conditions.push(`attendance_date <= $${paramIndex}`);
                values.push(endDate);
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

            const attendances = rows.map(row => this.mapRowToAttendance(row));

            const exportData = {
                exportDate: new Date().toISOString(),
                period: startDate && endDate ? { startDate, endDate } : 'all',
                totalRecords: attendances.length,
                data: attendances.map(a => a.toJSON())
            };

            switch (format.toLowerCase()) {
                case 'json':
                    return JSON.stringify(exportData, null, 2);
                case 'csv': {
                    const csvHeaders = ['Matricula', 'Nombre', 'Grupo', 'Fecha', 'Hora', 'Status'];
                    const csvRows = attendances.map(a => [
                        a.matricula,
                        a.nombre,
                        a.grupo,
                        a.date,
                        a.getFormattedTime(),
                        a.status
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
