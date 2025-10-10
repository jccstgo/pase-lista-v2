/**
 * Modelo para representar un registro de asistencia
 */
class Asistencia {
    constructor(data) {
        this.matricula = this.normalizarMatricula(data.matricula);
        this.nombre = data.nombre || '';
        this.grupo = this.normalizarGrupo(data.grupo);
        this.timestamp = data.timestamp || data.recorded_at || new Date().toISOString();
        this.status = data.status || 'registered';
        this.date = data.date || data.attendance_date || this.extraerFecha(this.timestamp);
    }

    /**
     * Normalizar matrícula
     */
    normalizarMatricula(matricula) {
        if (!matricula) return '';
        return matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
    }

    /**
     * Normalizar grupo
     */
    normalizarGrupo(grupo) {
        if (!grupo) return '';
        return grupo.toString().trim().toUpperCase();
    }

    /**
     * Extraer fecha del timestamp
     */
    extraerFecha(timestamp) {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    /**
     * Validar si el registro es válido
     */
    esValida() {
        const errores = [];

        if (!this.matricula || this.matricula.length === 0) {
            errores.push('Matrícula es requerida');
        }

        if (!this.timestamp) {
            errores.push('Timestamp es requerido');
        }

        // Validar timestamp
        if (this.timestamp && isNaN(new Date(this.timestamp).getTime())) {
            errores.push('Timestamp inválido');
        }

        // Validar status
        const estadosValidos = ['registered', 'present', 'absent'];
        if (!estadosValidos.includes(this.status)) {
            errores.push('Status inválido');
        }

        return {
            isValid: errores.length === 0,
            errors: errores
        };
    }

    /**
     * Obtener hora formateada
     */
    obtenerHoraFormateada() {
        return new Date(this.timestamp).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Obtener fecha formateada
     */
    obtenerFechaFormateada() {
        return new Date(this.timestamp).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    /**
     * Verificar si es del día de hoy
     */
    esDeHoy() {
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
            formattedTime: this.obtenerHoraFormateada(),
            formattedDate: this.obtenerFechaFormateada()
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

        return new Asistencia({
            matricula: csvData.matricula || csvData[matriculaKey] || '',
            nombre: csvData.nombre || '',
            grupo: csvData.grupo || '',
            timestamp: csvData.timestamp || '',
            status: csvData.status || 'registered'
        });
    }

    /**
     * Crear asistencia desde una fila de base de datos
     */
    static fromDatabaseRow(row) {
        if (!row) {
            return null;
        }

        return new Asistencia({
            matricula: row.matricula,
            nombre: row.nombre,
            grupo: row.grupo,
            timestamp: row.timestamp || row.recorded_at,
            status: row.status,
            date: row.date || row.attendance_date
        });
    }

    /**
     * Crear múltiples asistencias desde array de CSV
     */
    static fromCSVArray(csvArray) {
        return csvArray
            .map(data => Asistencia.fromCSV(data))
            .filter(asistencia => {
                const validation = asistencia.esValida();
                return validation.isValid;
            });
    }

    /**
     * Filtrar asistencias por fecha
     */
    static filtrarPorFecha(asistencias, fecha) {
        const fechaObjetivo = typeof fecha === 'string' ? fecha : fecha.toISOString().split('T')[0];
        return asistencias.filter(asistencia => asistencia.date === fechaObjetivo);
    }

    /**
     * Filtrar asistencias de hoy
     */
    static filtrarHoy(asistencias) {
        const hoy = new Date().toISOString().split('T')[0];
        return Asistencia.filtrarPorFecha(asistencias, hoy);
    }

    /**
     * Buscar asistencia por matrícula y fecha
     */
    static buscarPorMatriculaYFecha(asistencias, matricula, fecha = null) {
        const matriculaNormalizada = new Asistencia({ matricula }).matricula;
        const fechaObjetivo = fecha || new Date().toISOString().split('T')[0];

        return asistencias.find(asistencia =>
            asistencia.matricula === matriculaNormalizada &&
            asistencia.date === fechaObjetivo
        );
    }

    /**
     * Obtener estadísticas de asistencias
     */
    static obtenerEstadisticas(asistencias, fecha = null) {
        const asistenciasObjetivo = fecha ?
            Asistencia.filtrarPorFecha(asistencias, fecha) :
            Asistencia.filtrarHoy(asistencias);

        const estadisticas = {
            total: asistenciasObjetivo.length,
            porEstado: {},
            porGrupo: {},
            fecha: fecha || new Date().toISOString().split('T')[0]
        };

        asistenciasObjetivo.forEach(asistencia => {
            // Por status
            if (!estadisticas.porEstado[asistencia.status]) {
                estadisticas.porEstado[asistencia.status] = 0;
            }
            estadisticas.porEstado[asistencia.status]++;

            // Por grupo
            if (asistencia.grupo) {
                if (!estadisticas.porGrupo[asistencia.grupo]) {
                    estadisticas.porGrupo[asistencia.grupo] = 0;
                }
                estadisticas.porGrupo[asistencia.grupo]++;
            }
        });

        return estadisticas;
    }

    /**
     * Obtener lista de asistentes únicos por día
     */
    static obtenerAsistentesUnicos(asistencias, fecha = null) {
        const asistenciasObjetivo = fecha ?
            Asistencia.filtrarPorFecha(asistencias, fecha) :
            Asistencia.filtrarHoy(asistencias);

        const asistenciasUnicas = new Map();

        asistenciasObjetivo.forEach(asistencia => {
            if (!asistenciasUnicas.has(asistencia.matricula)) {
                asistenciasUnicas.set(asistencia.matricula, asistencia);
            }
        });

        return Array.from(asistenciasUnicas.values());
    }
}

module.exports = Asistencia;
