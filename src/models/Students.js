/**
 * Modelo para representar un estudiante/personal militar
 */
class Student {
    constructor(data) {
        this.matricula = this.normalizeMatricula(data.matricula);
        this.nombre = this.normalizeName(data.nombre);
        this.grupo = this.normalizeGroup(data.grupo);
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    /**
     * Normalizar matrícula
     */
    normalizeMatricula(matricula) {
        if (!matricula) return '';
        return matricula.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
    }

    /**
     * Normalizar nombre
     */
    normalizeName(nombre) {
        if (!nombre) return '';
        return nombre.toString().trim();
    }

    /**
     * Normalizar grupo
     */
    normalizeGroup(grupo) {
        if (!grupo) return '';
        return grupo.toString().trim().toUpperCase();
    }

    /**
     * Validar si el estudiante es válido
     */
    isValid() {
        const errors = [];
        
        if (!this.matricula || this.matricula.length === 0) {
            errors.push('Matrícula es requerida');
        }
        
        if (!this.nombre || this.nombre.length === 0) {
            errors.push('Nombre es requerido');
        }
        
        if (!this.grupo || this.grupo.length === 0) {
            errors.push('Grupo es requerido');
        }
        
        // Validar formato de matrícula
        const matriculaRegex = /^[A-Za-z0-9]+$/;
        if (this.matricula && !matriculaRegex.test(this.matricula)) {
            errors.push('Formato de matrícula inválido');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Convertir a objeto plano para CSV
     */
    toCSV() {
        return {
            matricula: this.matricula,
            nombre: this.nombre,
            grupo: this.grupo
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
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Crear estudiante desde datos de CSV
     */
    static fromCSV(csvData) {
        // Buscar cualquier clave que contenga 'matricula' (manejo de BOM)
        const matriculaKey = Object.keys(csvData).find(key => 
            key.includes('matricula') || key === 'matricula'
        );
        
        return new Student({
            matricula: csvData.matricula || csvData[matriculaKey] || '',
            nombre: csvData.nombre || '',
            grupo: csvData.grupo || ''
        });
    }

    /**
     * Crear múltiples estudiantes desde array de CSV
     */
    static fromCSVArray(csvArray) {
        return csvArray
            .map(data => Student.fromCSV(data))
            .filter(student => {
                const validation = student.isValid();
                return validation.isValid;
            });
    }

    /**
     * Buscar estudiante por matrícula
     */
    static findByMatricula(students, matricula) {
        const normalizedMatricula = new Student({ matricula }).matricula;
        return students.find(student => student.matricula === normalizedMatricula);
    }

    /**
     * Buscar estudiantes por grupo
     */
    static findByGroup(students, grupo) {
        const normalizedGroup = new Student({ grupo }).grupo;
        return students.filter(student => student.grupo === normalizedGroup);
    }

    /**
     * Obtener estadísticas de estudiantes
     */
    static getStats(students) {
        const groups = {};
        
        students.forEach(student => {
            if (!groups[student.grupo]) {
                groups[student.grupo] = 0;
            }
            groups[student.grupo]++;
        });

        return {
            total: students.length,
            groups,
            groupCount: Object.keys(groups).length
        };
    }
}

module.exports = Student;