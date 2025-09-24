/**
 * Modelo para representar un registro de asistencia
 */
class Attendance {
    constructor(data) {
        this.matricula = this.normalizeMatricula(data.matricula);
        this.nombre = data.nombre || '';
        this.grupo = this.normalizeGroup(data.grupo);
        this.timestamp = data.timestamp || new Date().toISOString();
        this.status = data.status || 'registered';
        this.date = this.extractDate(this.timestamp);
    }

    /**
     * Normalizar matrícula
     */
    normalizeMatricula(matricula) {
        if (!matricula) return '';
        return matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
    }

    /**
     * Normalizar grupo
     */
    normalizeGroup(grupo) {
        if (!grupo) return '';
        return grupo.toString().trim().toUpperCase();
    }

    /**
     * Extraer fecha del timestamp
     */
    extractDate(timestamp) {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    /**
     * Validar si el registro es válido
     */
    isValid() {
        const errors = [];
        
        if (!this.matricula || this.matricula.length === 0) {
            errors.push('Matrícula es requerida');
        }
        
        if (!this.timestamp) {
            errors.push('Timestamp es requerido');
        }
        
        // Validar timestamp
        if (this.timestamp && isNaN(new Date(this.timestamp).getTime())) {
            errors.push('Timestamp inválido');
        }
        
        // Validar status
        const validStatuses = ['registered', 'present', 'absent'];
        if (!validStatuses.includes(this.status)) {
            errors.push('Status inválido');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Obtener hora formateada
     */
    getFormattedTime() {
        return new Date(this.timestamp).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Obtener fecha formateada
     */
    getFormattedDate() {
        return new Date(this.timestamp).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    /**
     * Verificar si es del día de hoy
     */
    isToday() {
        const today = new Date().toISOString().split('T')[0];
        return this.date === today;
    }

    /**
     * Convertir a objeto plano para CSV
     */
    toCSV() {
        return {
            matricula: this.matricula,
            nombre: this.nombre,
            grupo: this.grupo,
            timestamp: this.timestamp,
            status: this.status
        };
    }

    /**
     * Convertir a objeto JSON
     */
    toJSON() {
        return {
            matricula: this.matricula,
            nombre: this.nombre,
            grupo: this.grupo,
            timestamp: this.timestamp,
            status: this.status,
            date: this.date,
            formattedTime: this.getFormattedTime(),
            formattedDate: this.getFormattedDate()
        };
    }

    /**
     * Crear asistencia desde datos de CSV
     */
    static fromCSV(csvData) {
        // Manejo de BOM y diferentes formatos de claves
        const matriculaKey = Object.keys(csvData).find(key => 
            key.includes('matricula')
        );
        
        return new Attendance({
            matricula: csvData.matricula || csvData[matriculaKey] || '',
            nombre: csvData.nombre || '',
            grupo: csvData.grupo || '',
            timestamp: csvData.timestamp || '',
            status: csvData.status || 'registered'
        });
    }

    /**
     * Crear múltiples asistencias desde array de CSV
     */
    static fromCSVArray(csvArray) {
        return csvArray
            .map(data => Attendance.fromCSV(data))
            .filter(attendance => {
                const validation = attendance.isValid();
                return validation.isValid;
            });
    }

    /**
     * Filtrar asistencias por fecha
     */
    static filterByDate(attendances, date) {
        const targetDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        return attendances.filter(attendance => attendance.date === targetDate);
    }

    /**
     * Filtrar asistencias de hoy
     */
    static filterToday(attendances) {
        const today = new Date().toISOString().split('T')[0];
        return Attendance.filterByDate(attendances, today);
    }

    /**
     * Buscar asistencia por matrícula y fecha
     */
    static findByMatriculaAndDate(attendances, matricula, date = null) {
        const normalizedMatricula = new Attendance({ matricula }).matricula;
        const targetDate = date || new Date().toISOString().split('T')[0];
        
        return attendances.find(attendance => 
            attendance.matricula === normalizedMatricula && 
            attendance.date === targetDate
        );
    }

    /**
     * Obtener estadísticas de asistencias
     */
    static getStats(attendances, date = null) {
        const targetAttendances = date ? 
            Attendance.filterByDate(attendances, date) : 
            Attendance.filterToday(attendances);

        const stats = {
            total: targetAttendances.length,
            byStatus: {},
            byGroup: {},
            date: date || new Date().toISOString().split('T')[0]
        };

        targetAttendances.forEach(attendance => {
            // Por status
            if (!stats.byStatus[attendance.status]) {
                stats.byStatus[attendance.status] = 0;
            }
            stats.byStatus[attendance.status]++;

            // Por grupo
            if (attendance.grupo) {
                if (!stats.byGroup[attendance.grupo]) {
                    stats.byGroup[attendance.grupo] = 0;
                }
                stats.byGroup[attendance.grupo]++;
            }
        });

        return stats;
    }

    /**
     * Obtener lista de asistentes únicos por día
     */
    static getUniqueAttendees(attendances, date = null) {
        const targetAttendances = date ? 
            Attendance.filterByDate(attendances, date) : 
            Attendance.filterToday(attendances);

        const unique = new Map();
        
        targetAttendances.forEach(attendance => {
            if (!unique.has(attendance.matricula)) {
                unique.set(attendance.matricula, attendance);
            }
        });

        return Array.from(unique.values());
    }
}

module.exports = Attendance;