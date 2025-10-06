const fs = require('fs/promises');

const Student = require('../models/Student');
const database = require('./databaseService');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');

class StudentService {
    /**
     * Convertir fila de la base de datos a instancia de Student
     */
    static mapRowToStudent(row) {
        if (!row) {
            return null;
        }

        return new Student({
            matricula: row.matricula,
            nombre: row.nombre,
            grupo: row.grupo,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    }

    /**
     * Obtener todos los estudiantes
     */
    static async getAllStudents() {
        try {
            const rows = database.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 ORDER BY nombre COLLATE NOCASE`
            );

            const students = rows.map(row => this.mapRowToStudent(row));
            console.log(`📚 Cargados ${students.length} estudiantes desde la base de datos`);
            return students;
        } catch (error) {
            console.error('❌ Error obteniendo estudiantes desde la base de datos:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener lista de estudiantes', 500, 'STUDENTS_LOAD_ERROR');
        }
    }

    /**
     * Buscar estudiante por matrícula
     */
    static async findByMatricula(matricula) {
        try {
            if (!matricula) {
                throw new AppError('Matrícula es requerida', 400, 'MISSING_MATRICULA');
            }

            const normalizedMatricula = new Student({ matricula }).matricula;
            const row = database.get(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 WHERE matricula = @matricula`,
                { matricula: normalizedMatricula }
            );

            if (!row) {
                console.log(`⚠️ Estudiante no encontrado en base de datos: ${normalizedMatricula}`);
                return null;
            }

            const student = this.mapRowToStudent(row);
            console.log(`✅ Estudiante encontrado en base de datos: ${student.nombre}`);
            return student;
        } catch (error) {
            console.error('❌ Error buscando estudiante por matrícula:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al buscar estudiante', 500, 'STUDENT_SEARCH_ERROR');
        }
    }

    /**
     * Buscar estudiantes por grupo
     */
    static async findByGroup(grupo) {
        try {
            if (!grupo) {
                throw new AppError('Grupo es requerido', 400, 'MISSING_GROUP');
            }

            const normalizedGroup = new Student({ grupo }).grupo;
            const rows = database.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 WHERE grupo = @grupo
                 ORDER BY nombre COLLATE NOCASE`,
                { grupo: normalizedGroup }
            );

            const students = rows.map(row => this.mapRowToStudent(row));
            console.log(`📊 Encontrados ${students.length} estudiantes en grupo ${normalizedGroup}`);
            return students;
        } catch (error) {
            console.error('❌ Error buscando estudiantes por grupo:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al buscar estudiantes por grupo', 500, 'GROUP_SEARCH_ERROR');
        }
    }

    /**
     * Crear/actualizar lista completa de estudiantes desde carga masiva
     */
    static async updateStudentsList(studentsData) {
        try {
            if (!Array.isArray(studentsData) || studentsData.length === 0) {
                throw new AppError('Lista de estudiantes inválida o vacía', 400, 'INVALID_STUDENTS_LIST');
            }

            const validStudents = [];
            const errors = [];
            const duplicates = [];
            const matriculas = new Set();
            const timestamp = new Date().toISOString();

            for (let i = 0; i < studentsData.length; i++) {
                try {
                    const student = new Student({
                        ...studentsData[i],
                        createdAt: studentsData[i].createdAt || timestamp,
                        updatedAt: timestamp
                    });

                    const validation = student.isValid();
                    if (!validation.isValid) {
                        errors.push(`Estudiante ${i + 1}: ${validation.errors.join(', ')}`);
                        continue;
                    }

                    if (matriculas.has(student.matricula)) {
                        duplicates.push(student.matricula);
                        continue;
                    }

                    matriculas.add(student.matricula);
                    validStudents.push(student);
                } catch (error) {
                    errors.push(`Estudiante ${i + 1}: Error de procesamiento - ${error.message}`);
                }
            }

            if (validStudents.length === 0) {
                throw new AppError(
                    `No hay estudiantes válidos. Errores: ${errors.slice(0, 5).join('; ')}`,
                    400,
                    'NO_VALID_STUDENTS'
                );
            }

            try {
                database.backupDatabase('students');
            } catch (backupError) {
                console.warn('⚠️ No se pudo crear respaldo de estudiantes:', backupError.message);
            }

            const insertStatement = database.prepare(`
                INSERT INTO students (matricula, nombre, grupo, created_at, updated_at)
                VALUES (@matricula, @nombre, @grupo, @createdAt, @updatedAt)
                ON CONFLICT(matricula) DO UPDATE SET
                    nombre = excluded.nombre,
                    grupo = excluded.grupo,
                    updated_at = excluded.updated_at
            `);

            const replaceStudents = database.transaction(students => {
                database.run('DELETE FROM students');
                students.forEach(student => {
                    insertStatement.run({
                        matricula: student.matricula,
                        nombre: student.nombre,
                        grupo: student.grupo,
                        createdAt: student.createdAt,
                        updatedAt: student.updatedAt
                    });
                });
            });

            replaceStudents(validStudents);

            console.log(`✅ Lista de estudiantes actualizada en base de datos: ${validStudents.length} registros válidos`);

            return {
                success: true,
                message: config.MESSAGES.SUCCESS.STUDENTS_UPLOADED,
                totalProcessed: studentsData.length,
                validStudents: validStudents.length,
                duplicatesRemoved: duplicates.length,
                errors: errors.slice(0, 10),
                students: validStudents
            };
        } catch (error) {
            console.error('❌ Error actualizando lista de estudiantes:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al actualizar lista de estudiantes', 500, 'STUDENTS_UPDATE_ERROR');
        }
    }

    /**
     * Agregar estudiante individual
     */
    static async addStudent(studentData) {
        try {
            const timestamp = new Date().toISOString();
            const student = new Student({
                ...studentData,
                createdAt: timestamp,
                updatedAt: timestamp
            });

            const validation = student.isValid();
            if (!validation.isValid) {
                throw new AppError(`Datos de estudiante inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_STUDENT_DATA');
            }

            const existing = database.get(
                'SELECT matricula FROM students WHERE matricula = @matricula',
                { matricula: student.matricula }
            );

            if (existing) {
                throw new AppError(`Ya existe un estudiante con matrícula ${student.matricula}`, 409, 'STUDENT_ALREADY_EXISTS');
            }

            database.run(
                `INSERT INTO students (matricula, nombre, grupo, created_at, updated_at)
                 VALUES (@matricula, @nombre, @grupo, @createdAt, @updatedAt)`,
                {
                    matricula: student.matricula,
                    nombre: student.nombre,
                    grupo: student.grupo,
                    createdAt: student.createdAt,
                    updatedAt: student.updatedAt
                }
            );

            console.log(`✅ Estudiante agregado a la base de datos: ${student.nombre} (${student.matricula})`);
            return student;
        } catch (error) {
            console.error('❌ Error agregando estudiante:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al agregar estudiante', 500, 'STUDENT_ADD_ERROR');
        }
    }

    /**
     * Actualizar datos de estudiante
     */
    static async updateStudent(matricula, updateData) {
        try {
            const existingStudent = await this.findByMatricula(matricula);
            if (!existingStudent) {
                throw new AppError('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            const timestamp = new Date().toISOString();
            const updatedStudent = new Student({
                ...existingStudent.toJSON(),
                ...updateData,
                matricula: existingStudent.matricula,
                createdAt: existingStudent.createdAt,
                updatedAt: timestamp
            });

            const validation = updatedStudent.isValid();
            if (!validation.isValid) {
                throw new AppError(`Datos actualizados inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_UPDATE_DATA');
            }

            const result = database.run(
                `UPDATE students
                 SET nombre = @nombre,
                     grupo = @grupo,
                     updated_at = @updatedAt
                 WHERE matricula = @matricula`,
                {
                    matricula: updatedStudent.matricula,
                    nombre: updatedStudent.nombre,
                    grupo: updatedStudent.grupo,
                    updatedAt: updatedStudent.updatedAt
                }
            );

            if (result.changes === 0) {
                throw new AppError('No se pudo actualizar el estudiante', 500, 'UPDATE_FAILED');
            }

            console.log(`✅ Estudiante actualizado en base de datos: ${updatedStudent.nombre} (${updatedStudent.matricula})`);
            return updatedStudent;
        } catch (error) {
            console.error('❌ Error actualizando estudiante:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al actualizar estudiante', 500, 'STUDENT_UPDATE_ERROR');
        }
    }

    /**
     * Eliminar estudiante
     */
    static async deleteStudent(matricula) {
        try {
            const existingStudent = await this.findByMatricula(matricula);
            if (!existingStudent) {
                throw new AppError('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            const result = database.run(
                'DELETE FROM students WHERE matricula = @matricula',
                { matricula: existingStudent.matricula }
            );

            if (result.changes === 0) {
                throw new AppError('No se pudo eliminar el estudiante', 500, 'DELETE_FAILED');
            }

            console.log(`🗑️ Estudiante eliminado de la base de datos: ${existingStudent.nombre} (${existingStudent.matricula})`);
            return true;
        } catch (error) {
            console.error('❌ Error eliminando estudiante:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al eliminar estudiante', 500, 'STUDENT_DELETE_ERROR');
        }
    }

    /**
     * Limpiar todos los estudiantes de la base de datos
     */
    static async clearAllStudents() {
        try {
            try {
                database.backupDatabase('students-clear');
            } catch (backupError) {
                console.warn('⚠️ No se pudo crear respaldo antes de limpiar estudiantes:', backupError.message);
            }

            const result = database.clearTable('students');
            console.log(`🧹 Base de datos de estudiantes limpiada. Registros eliminados: ${result.changes}`);

            return {
                deleted: result.changes,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error limpiando estudiantes:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al limpiar estudiantes', 500, 'STUDENTS_CLEAR_ERROR');
        }
    }

    /**
     * Obtener estadísticas de estudiantes
     */
    static async getStudentStats() {
        try {
            const totals = database.get('SELECT COUNT(*) AS total FROM students');
            const groupRows = database.all(
                `SELECT grupo, COUNT(*) AS total
                 FROM students
                 GROUP BY grupo
                 ORDER BY grupo`
            );

            const groups = {};
            groupRows.forEach(row => {
                groups[row.grupo] = row.total;
            });

            let fileInfo = {};
            try {
                const stats = await fs.stat(config.DATABASE.FILE);
                fileInfo = {
                    lastModified: stats.mtime.toISOString(),
                    fileSize: stats.size
                };
            } catch (statError) {
                console.warn('⚠️ No se pudo obtener información del archivo de base de datos:', statError.message);
            }

            return {
                total: totals?.total || 0,
                groups,
                groupCount: Object.keys(groups).length,
                fileInfo,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de estudiantes:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al obtener estadísticas', 500, 'STATS_ERROR');
        }
    }

    /**
     * Buscar estudiantes con filtros avanzados
     */
    static async searchStudents(filters = {}) {
        try {
            const conditions = [];
            const params = {};

            if (filters.matricula) {
                conditions.push('matricula LIKE @matricula');
                params.matricula = `%${filters.matricula.toString().trim().toUpperCase()}%`;
            }

            if (filters.nombre) {
                conditions.push('LOWER(nombre) LIKE @nombre');
                params.nombre = `%${filters.nombre.toString().trim().toLowerCase()}%`;
            }

            if (filters.grupo) {
                conditions.push('grupo = @grupo');
                params.grupo = filters.grupo.toString().trim().toUpperCase();
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const allowedSortFields = {
                matricula: 'matricula',
                nombre: 'nombre',
                grupo: 'grupo'
            };

            const sortField = allowedSortFields[filters.sortBy] || 'nombre';
            const sortOrder = filters.sortOrder === 'desc' ? 'DESC' : 'ASC';
            const orderClause = `ORDER BY ${sortField} COLLATE NOCASE ${sortOrder}`;

            if (filters.page && filters.limit) {
                const page = Math.max(parseInt(filters.page, 10) || 1, 1);
                const limit = Math.max(parseInt(filters.limit, 10) || 10, 1);
                const offset = (page - 1) * limit;

                const totalRow = database.get(
                    `SELECT COUNT(*) AS total FROM students ${whereClause}`,
                    params
                );

                const rows = database.all(
                    `SELECT matricula, nombre, grupo, created_at, updated_at
                     FROM students
                     ${whereClause}
                     ${orderClause}
                     LIMIT @limit OFFSET @offset`,
                    { ...params, limit, offset }
                );

                const students = rows.map(row => this.mapRowToStudent(row));

                return {
                    students,
                    pagination: {
                        page,
                        limit,
                        total: totalRow?.total || 0,
                        totalPages: Math.ceil((totalRow?.total || 0) / limit) || 1,
                        hasNext: offset + students.length < (totalRow?.total || 0),
                        hasPrev: page > 1
                    }
                };
            }

            const rows = database.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 ${whereClause}
                 ${orderClause}`,
                params
            );

            const students = rows.map(row => this.mapRowToStudent(row));

            return {
                students,
                total: students.length
            };
        } catch (error) {
            console.error('❌ Error buscando estudiantes:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error en búsqueda de estudiantes', 500, 'SEARCH_ERROR');
        }
    }

    /**
     * Validar integridad de datos
     */
    static async validateDataIntegrity() {
        try {
            const students = await this.getAllStudents();
            const issues = [];

            students.forEach((student, index) => {
                const validation = student.isValid();
                if (!validation.isValid) {
                    issues.push({
                        type: 'INVALID_DATA',
                        message: `Estudiante ${index + 1}: ${validation.errors.join(', ')}`,
                        student: student.toJSON()
                    });
                }
            });

            return {
                isValid: issues.length === 0,
                totalStudents: students.length,
                issues,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error validando integridad de estudiantes:', error);
            throw new AppError('Error al validar integridad de datos', 500, 'INTEGRITY_CHECK_ERROR');
        }
    }
}

module.exports = StudentService;
