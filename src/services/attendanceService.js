const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const StudentService = require('./studentService');
const CSVService = require('./csvService');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');

class AttendanceService {
    /**
     * Obtener todas las asistencias
     */
    static async getAllAttendances() {
        try {
            const csvData = await CSVService.readCSV(config.FILES.ATTENDANCE);
            const attendances = Attendance.fromCSVArray(csvData);
            
            console.log(`📝 Cargadas ${attendances.length} asistencias`);
            return attendances;
        } catch (error) {
            console.error('❌ Error obteniendo asistencias:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener asistencias', 500, 'ATTENDANCES_LOAD_ERROR');
        }
    }

    /**
     * Registrar asistencia de un estudiante
     */
    static async registerAttendance(matricula) {
        try {
            if (!matricula) {
                throw new AppError('Matrícula es requerida', 400, 'MISSING_MATRICULA');
            }

            const cleanMatricula = matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            console.log(`📝 Registrando asistencia para: ${cleanMatricula}`);

            // Buscar estudiante en la lista oficial
            const student = await StudentService.findByMatricula(cleanMatricula);
            
            if (!student) {
                throw new AppError(
                    config.MESSAGES.ERROR.STUDENT_NOT_FOUND,
                    404,
                    'STUDENT_NOT_REGISTERED'
                );
            }

            // Verificar si ya se registró hoy
            const existingAttendance = await this.findTodayAttendance(cleanMatricula);
            if (existingAttendance) {
                const timeStr = existingAttendance.getFormattedTime();
                throw new AppError(
                    `Ya se registró su asistencia hoy a las ${timeStr}`,
                    409,
                    'ALREADY_REGISTERED_TODAY'
                );
            }

            // Crear registro de asistencia
            const attendance = new Attendance({
                matricula: student.matricula,
                nombre: student.nombre,
                grupo: student.grupo,
                timestamp: new Date().toISOString(),
                status: 'registered'
            });

            // Validar el registro
            const validation = attendance.isValid();
            if (!validation.isValid) {
                throw new AppError(
                    `Error en datos de asistencia: ${validation.errors.join(', ')}`,
                    400,
                    'INVALID_ATTENDANCE_DATA'
                );
            }

            // Guardar en CSV
            await CSVService.appendToCSV(
                config.FILES.ATTENDANCE, 
                attendance.toCSV(), 
                config.CSV_HEADERS.ATTENDANCE
            );

            console.log(`✅ Asistencia registrada: ${student.nombre} (${cleanMatricula})`);
            
            return {
                success: true,
                message: `¡Asistencia registrada exitosamente!<br>Grado y Nombre: <strong>${student.nombre}</strong><br>Grupo: <strong>${student.grupo}</strong>`,
                attendance: attendance.toJSON(),
                student: student.toJSON()
            };
        } catch (error) {
            console.error('❌ Error registrando asistencia:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al registrar asistencia', 500, 'ATTENDANCE_REGISTER_ERROR');
        }
    }

    /**
     * Buscar asistencia de hoy para una matrícula
     */
    static async findTodayAttendance(matricula) {
        try {
            const attendances = await this.getAllAttendances();
            const cleanMatricula = matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            
            return Attendance.findByMatriculaAndDate(attendances, cleanMatricula);
        } catch (error) {
            console.error('❌ Error buscando asistencia del día:', error);
            throw new AppError('Error al buscar asistencia', 500, 'ATTENDANCE_SEARCH_ERROR');
        }
    }

    /**
     * Obtener asistencias por fecha
     */
    static async getAttendancesByDate(date = null) {
        try {
            const attendances = await this.getAllAttendances();
            
            if (date) {
                return Attendance.filterByDate(attendances, date);
            } else {
                return Attendance.filterToday(attendances);
            }
        } catch (error) {
            console.error('❌ Error obteniendo asistencias por fecha:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener asistencias por fecha', 500, 'ATTENDANCE_DATE_ERROR');
        }
    }

    /**
     * Obtener estadísticas de asistencia
     */
    static async getAttendanceStats(date = null) {
        try {
            const students = await StudentService.getAllStudents();
            const attendances = await this.getAllAttendances();
            
            const targetDate = date || new Date().toISOString().split('T')[0];
            const todayAttendances = Attendance.filterByDate(attendances, targetDate);
            
            // Estudiantes que asistieron (registrados en lista)
            const presentRegistered = todayAttendances.filter(a => a.status === 'registered');
            
            // Estudiantes ausentes
            const presentMatriculas = presentRegistered.map(a => a.matricula);
            const absentStudents = students.filter(s => 
                !presentMatriculas.includes(s.matricula)
            );

            const stats = {
                date: targetDate,
                totalStudents: students.length,
                presentRegistered: presentRegistered.length,
                presentNotInList: 0, // Ya no se permite
                absent: absentStudents.length,
                totalPresent: presentRegistered.length,
                attendanceRate: students.length > 0 ? 
                    ((presentRegistered.length / students.length) * 100).toFixed(1) : 0,
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
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al calcular estadísticas', 500, 'STATS_CALCULATION_ERROR');
        }
    }

    /**
     * Obtener estadísticas por grupo
     */
    static getStatsByGroup(students, attendances) {
        const groupStats = {};
        
        // Inicializar estadísticas por grupo
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
        
        // Contar presentes por grupo
        attendances.forEach(attendance => {
            if (groupStats[attendance.grupo]) {
                groupStats[attendance.grupo].present++;
            }
        });
        
        // Calcular ausentes y tasas de asistencia
        Object.keys(groupStats).forEach(grupo => {
            const stats = groupStats[grupo];
            stats.absent = stats.total - stats.present;
            stats.attendanceRate = stats.total > 0 ? 
                ((stats.present / stats.total) * 100).toFixed(1) : 0;
        });
        
        return groupStats;
    }

    /**
     * Obtener lista detallada de asistencia
     */
    static async getDetailedAttendanceList(date = null) {
        try {
            const students = await StudentService.getAllStudents();
            const attendances = await this.getAllAttendances();
            
            const targetDate = date || new Date().toISOString().split('T')[0];
            const todayAttendances = Attendance.filterByDate(attendances, targetDate);
            
            // Estudiantes presentes (en lista oficial)
            const presentRegistered = todayAttendances
                .filter(a => a.status === 'registered')
                .map(attendance => ({
                    matricula: attendance.matricula,
                    nombre: attendance.nombre,
                    grupo: attendance.grupo,
                    timestamp: attendance.timestamp,
                    status: 'Presente (En lista)',
                    formattedTime: attendance.getFormattedTime()
                }));

            // Ya no se permiten registros fuera de lista
            const presentNotInList = [];

            // Estudiantes ausentes
            const presentMatriculas = todayAttendances.map(a => a.matricula);
            const absent = students
                .filter(s => !presentMatriculas.includes(s.matricula))
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
                presentNotInList,
                absent: absent.sort((a, b) => a.nombre.localeCompare(b.nombre)),
                summary: {
                    totalStudents: students.length,
                    present: presentRegistered.length,
                    absent: absent.length,
                    attendanceRate: students.length > 0 ? 
                        ((presentRegistered.length / students.length) * 100).toFixed(1) : 0
                }
            };
        } catch (error) {
            console.error('❌ Error obteniendo lista detallada:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener lista detallada', 500, 'DETAILED_LIST_ERROR');
        }
    }

    /**
     * Limpiar registros de asistencia (reiniciar sistema)
     */
    static async clearAttendanceRecords() {
        try {
            // Crear backup antes de limpiar
            if (await CSVService.fileExists(config.FILES.ATTENDANCE)) {
                await CSVService.backupCSV(config.FILES.ATTENDANCE);
            }

            // Crear archivo vacío con headers
            await CSVService.writeEmptyCSV(config.FILES.ATTENDANCE, config.CSV_HEADERS.ATTENDANCE);
            
            console.log('🧹 Registros de asistencia limpiados - borrón y cuenta nueva');
            return true;
        } catch (error) {
            console.error('❌ Error limpiando registros:', error);
            throw new AppError('Error al limpiar registros de asistencia', 500, 'CLEAR_RECORDS_ERROR');
        }
    }

    /**
     * Obtener resumen de asistencia por rango de fechas
     */
    static async getAttendanceReport(startDate, endDate) {
        try {
            const attendances = await this.getAllAttendances();
            const students = await StudentService.getAllStudents();
            
            // Filtrar por rango de fechas
            const reportAttendances = attendances.filter(attendance => {
                const attendanceDate = attendance.date;
                return attendanceDate >= startDate && attendanceDate <= endDate;
            });

            // Agrupar por fecha
            const dailyStats = {};
            const studentAttendance = {};

            // Inicializar contadores de estudiantes
            students.forEach(student => {
                studentAttendance[student.matricula] = {
                    student: student.toJSON(),
                    daysPresent: 0,
                    daysAbsent: 0,
                    attendanceDates: []
                };
            });

            // Procesar cada día en el rango
            const currentDate = new Date(startDate);
            const endDateObj = new Date(endDate);
            
            while (currentDate <= endDateObj) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayAttendances = reportAttendances.filter(a => a.date === dateStr);
                
                dailyStats[dateStr] = {
                    date: dateStr,
                    present: dayAttendances.length,
                    absent: students.length - dayAttendances.length,
                    attendanceRate: students.length > 0 ? 
                        ((dayAttendances.length / students.length) * 100).toFixed(1) : 0
                };

                // Actualizar estadísticas de estudiantes
                const presentToday = dayAttendances.map(a => a.matricula);
                
                students.forEach(student => {
                    if (presentToday.includes(student.matricula)) {
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
                    avgDailyAttendance: totalDays > 0 ? 
                        (Object.values(dailyStats).reduce((sum, day) => sum + day.present, 0) / totalDays).toFixed(1) : 0,
                    avgAttendanceRate: totalDays > 0 ? 
                        (Object.values(dailyStats).reduce((sum, day) => sum + parseFloat(day.attendanceRate), 0) / totalDays).toFixed(1) : 0
                },
                dailyStats,
                studentAttendance: Object.values(studentAttendance)
                    .map(record => ({
                        ...record,
                        attendanceRate: totalDays > 0 ? 
                            ((record.daysPresent / totalDays) * 100).toFixed(1) : 0
                    }))
                    .sort((a, b) => b.attendanceRate - a.attendanceRate)
            };
        } catch (error) {
            console.error('❌ Error generando reporte:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al generar reporte de asistencia', 500, 'REPORT_GENERATION_ERROR');
        }
    }

    /**
     * Obtener asistencias de un estudiante específico
     */
    static async getStudentAttendanceHistory(matricula, limit = 30) {
        try {
            const attendances = await this.getAllAttendances();
            const cleanMatricula = matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
            
            const studentAttendances = attendances
                .filter(a => a.matricula === cleanMatricula)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);

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

            // Calcular estadísticas
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
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener historial de asistencia', 500, 'STUDENT_HISTORY_ERROR');
        }
    }

    /**
     * Calcular tiempo promedio de llegada
     */
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

    /**
     * Validar integridad de registros de asistencia
     */
    static async validateAttendanceIntegrity() {
        try {
            const attendances = await this.getAllAttendances();
            const students = await StudentService.getAllStudents();
            const issues = [];

            // Verificar registros duplicados por día
            const dailyRecords = {};
            attendances.forEach((attendance, index) => {
                const key = `${attendance.matricula}-${attendance.date}`;
                if (dailyRecords[key]) {
                    issues.push({
                        type: 'DUPLICATE_DAILY_RECORD',
                        message: `Registro duplicado para ${attendance.matricula} en ${attendance.date}`,
                        indices: [dailyRecords[key], index],
                        data: attendance.toJSON()
                    });
                } else {
                    dailyRecords[key] = index;
                }
            });

            // Verificar registros huérfanos (sin estudiante correspondiente)
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

            // Verificar timestamps inválidos
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

            // Verificar registros futuros
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
            throw new AppError('Error al validar integridad de asistencias', 500, 'INTEGRITY_CHECK_ERROR');
        }
    }

    /**
     * Exportar datos de asistencia en formato específico
     */
    static async exportAttendanceData(format = 'json', startDate = null, endDate = null) {
        try {
            let attendances = await this.getAllAttendances();
            
            // Filtrar por fechas si se proporcionan
            if (startDate && endDate) {
                attendances = attendances.filter(a => 
                    a.date >= startDate && a.date <= endDate
                );
            }

            const exportData = {
                exportDate: new Date().toISOString(),
                period: startDate && endDate ? { startDate, endDate } : 'all',
                totalRecords: attendances.length,
                data: attendances.map(a => a.toJSON())
            };

            switch (format.toLowerCase()) {
                case 'json':
                    return JSON.stringify(exportData, null, 2);
                
                case 'csv':
                    // Convertir a formato CSV simple
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
                
                default:
                    return exportData;
            }
        } catch (error) {
            console.error('❌ Error exportando datos:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al exportar datos de asistencia', 500, 'EXPORT_ERROR');
        }
    }
}

module.exports = AttendanceService;