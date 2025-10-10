const Estudiante = require('../models/Estudiante');
const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

class ServicioEstudiantes {
    /**
     * Convertir fila de la base de datos a instancia de Student
     */
    static mapRowToStudent(row) {
        if (!row) {
            return null;
        }

        const normalizeDate = (value) => (value instanceof Date ? value.toISOString() : value);

        return new Estudiante({
            matricula: row.matricula,
            nombre: row.nombre,
            grupo: row.grupo,
            createdAt: normalizeDate(row.created_at),
            updatedAt: normalizeDate(row.updated_at)
        });
    }

    /**
     * Obtener todos los estudiantes
     */
    static async getAllStudents() {
        try {
            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 ORDER BY LOWER(nombre) ASC, nombre ASC`
            );

            const students = rows.map(row => this.mapRowToStudent(row));
            console.log(`📚 Cargados ${students.length} estudiantes desde la base de datos`);
            return students;
        } catch (error) {
            console.error('❌ Error obteniendo estudiantes desde la base de datos:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener lista de estudiantes', 500, 'STUDENTS_LOAD_ERROR');
        }
    }

    /**
     * Buscar estudiante por matrícula
     */
    static async findByMatricula(matricula) {
        try {
            if (!matricula) {
                throw new ErrorAplicacion('Matrícula es requerida', 400, 'MISSING_MATRICULA');
            }

            const normalizedMatricula = new Estudiante({ matricula }).matricula;
            const row = await servicioBaseDatos.get(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 WHERE matricula = $1`,
                [normalizedMatricula]
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
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al buscar estudiante', 500, 'STUDENT_SEARCH_ERROR');
        }
    }

    /**
     * Buscar estudiantes por grupo
     */
    static async findByGroup(grupo) {
        try {
            if (!grupo) {
                throw new ErrorAplicacion('Grupo es requerido', 400, 'MISSING_GROUP');
            }

            const normalizedGroup = new Estudiante({ grupo }).grupo;
            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 WHERE grupo = $1
                 ORDER BY LOWER(nombre) ASC, nombre ASC`,
                [normalizedGroup]
            );

            const students = rows.map(row => this.mapRowToStudent(row));
            console.log(`📊 Encontrados ${students.length} estudiantes en grupo ${normalizedGroup}`);
            return students;
        } catch (error) {
            console.error('❌ Error buscando estudiantes por grupo:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al buscar estudiantes por grupo', 500, 'GROUP_SEARCH_ERROR');
        }
    }

    /**
     * Crear/actualizar lista completa de estudiantes desde carga masiva
     */
    static async updateStudentsList(studentsData) {
        try {
            if (!Array.isArray(studentsData) || studentsData.length === 0) {
                throw new ErrorAplicacion('Lista de estudiantes inválida o vacía', 400, 'INVALID_STUDENTS_LIST');
            }

            const validStudents = [];
            const errors = [];
            const duplicates = [];
            const matriculas = new Set();
            const timestamp = new Date().toISOString();

            for (let i = 0; i < studentsData.length; i++) {
                try {
                    const student = new Estudiante({
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
                throw new ErrorAplicacion(
                    `No hay estudiantes válidos. Errores: ${errors.slice(0, 5).join('; ')}`,
                    400,
                    'NO_VALID_STUDENTS'
                );
            }

            try {
                await servicioBaseDatos.backupDatabase('students');
            } catch (backupError) {
                console.warn('⚠️ No se pudo crear respaldo de estudiantes:', backupError.message);
            }

            await servicioBaseDatos.transaction(async (client) => {
                await client.query('DELETE FROM students');

                for (const student of validStudents) {
                    await client.query(
                        `INSERT INTO students (matricula, nombre, grupo, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (matricula) DO UPDATE SET
                             nombre = EXCLUDED.nombre,
                             grupo = EXCLUDED.grupo,
                             updated_at = EXCLUDED.updated_at`,
                        [
                            student.matricula,
                            student.nombre,
                            student.grupo,
                            student.createdAt,
                            student.updatedAt
                        ]
                    );
                }
            });

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
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al actualizar lista de estudiantes', 500, 'STUDENTS_UPDATE_ERROR');
        }
    }

    /**
     * Agregar estudiante individual
     */
    static async addStudent(studentData) {
        try {
            const timestamp = new Date().toISOString();
            const student = new Estudiante({
                ...studentData,
                createdAt: timestamp,
                updatedAt: timestamp
            });

            const validation = student.isValid();
            if (!validation.isValid) {
                throw new ErrorAplicacion(`Datos de estudiante inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_STUDENT_DATA');
            }

            const existing = await servicioBaseDatos.get(
                'SELECT matricula FROM students WHERE matricula = $1',
                [student.matricula]
            );

            if (existing) {
                throw new ErrorAplicacion(`Ya existe un estudiante con matrícula ${student.matricula}`, 409, 'STUDENT_ALREADY_EXISTS');
            }

            await servicioBaseDatos.run(
                `INSERT INTO students (matricula, nombre, grupo, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    student.matricula,
                    student.nombre,
                    student.grupo,
                    student.createdAt,
                    student.updatedAt
                ]
            );

            console.log(`✅ Estudiante agregado a la base de datos: ${student.nombre} (${student.matricula})`);
            return student;
        } catch (error) {
            console.error('❌ Error agregando estudiante:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al agregar estudiante', 500, 'STUDENT_ADD_ERROR');
        }
    }

    /**
     * Actualizar datos de estudiante
     */
    static async updateStudent(matricula, updateData) {
        try {
            const existingStudent = await this.findByMatricula(matricula);
            if (!existingStudent) {
                throw new ErrorAplicacion('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            const timestamp = new Date().toISOString();
            const updatedStudent = new Estudiante({
                ...existingStudent.toJSON(),
                ...updateData,
                matricula: existingStudent.matricula,
                createdAt: existingStudent.createdAt,
                updatedAt: timestamp
            });

            const validation = updatedStudent.isValid();
            if (!validation.isValid) {
                throw new ErrorAplicacion(`Datos actualizados inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_UPDATE_DATA');
            }

            const result = await servicioBaseDatos.run(
                `UPDATE students
                 SET nombre = $1,
                     grupo = $2,
                     updated_at = $3
                 WHERE matricula = $4`,
                [
                    updatedStudent.nombre,
                    updatedStudent.grupo,
                    updatedStudent.updatedAt,
                    updatedStudent.matricula
                ]
            );

            if (result.rowCount === 0) {
                throw new ErrorAplicacion('No se pudo actualizar el estudiante', 500, 'UPDATE_FAILED');
            }

            console.log(`✅ Estudiante actualizado en base de datos: ${updatedStudent.nombre} (${updatedStudent.matricula})`);
            return updatedStudent;
        } catch (error) {
            console.error('❌ Error actualizando estudiante:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al actualizar estudiante', 500, 'STUDENT_UPDATE_ERROR');
        }
    }

    /**
     * Eliminar estudiante
     */
    static async deleteStudent(matricula) {
        try {
            const existingStudent = await this.findByMatricula(matricula);
            if (!existingStudent) {
                throw new ErrorAplicacion('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            const result = await servicioBaseDatos.run(
                'DELETE FROM students WHERE matricula = $1',
                [existingStudent.matricula]
            );

            if (result.rowCount === 0) {
                throw new ErrorAplicacion('No se pudo eliminar el estudiante', 500, 'DELETE_FAILED');
            }

            console.log(`🗑️ Estudiante eliminado de la base de datos: ${existingStudent.nombre} (${existingStudent.matricula})`);
            return true;
        } catch (error) {
            console.error('❌ Error eliminando estudiante:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al eliminar estudiante', 500, 'STUDENT_DELETE_ERROR');
        }
    }

    /**
     * Limpiar todos los estudiantes de la base de datos
     */
    static async clearAllStudents() {
        try {
            try {
                await servicioBaseDatos.backupDatabase('students-clear');
            } catch (backupError) {
                console.warn('⚠️ No se pudo crear respaldo antes de limpiar estudiantes:', backupError.message);
            }

            const result = await servicioBaseDatos.clearTable('students');
            console.log(`🧹 Base de datos de estudiantes limpiada. Registros eliminados: ${result.rowCount}`);

            return {
                deleted: result.rowCount,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error limpiando estudiantes:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al limpiar estudiantes', 500, 'STUDENTS_CLEAR_ERROR');
        }
    }

    /**
     * Obtener estadísticas de estudiantes
     */
    static async getStudentStats() {
        try {
            const totals = await servicioBaseDatos.get('SELECT COUNT(*) AS total FROM students');
            const groupRows = await servicioBaseDatos.all(
                `SELECT grupo, COUNT(*) AS total
                 FROM students
                 GROUP BY grupo
                 ORDER BY grupo`
            );

            const groups = {};
            groupRows.forEach(row => {
                groups[row.grupo] = Number.parseInt(row.total, 10);
            });

            return {
                total: Number.parseInt(totals?.total, 10) || 0,
                groups,
                groupCount: Object.keys(groups).length,
                storage: {
                    connection: config.DATABASE.SUMMARY
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de estudiantes:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error al obtener estadísticas', 500, 'STATS_ERROR');
        }
    }

    /**
     * Buscar estudiantes con filtros avanzados
     */
    static async searchStudents(filters = {}) {
        try {
            const conditions = [];
            const values = [];
            let paramIndex = 1;

            if (filters.matricula) {
                conditions.push(`matricula ILIKE $${paramIndex}`);
                values.push(`%${filters.matricula.toString().trim().toUpperCase()}%`);
                paramIndex += 1;
            }

            if (filters.nombre) {
                conditions.push(`nombre ILIKE $${paramIndex}`);
                values.push(`%${filters.nombre.toString().trim()}%`);
                paramIndex += 1;
            }

            if (filters.grupo) {
                conditions.push(`grupo = $${paramIndex}`);
                values.push(filters.grupo.toString().trim().toUpperCase());
                paramIndex += 1;
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const allowedSortFields = {
                matricula: 'matricula',
                nombre: 'LOWER(nombre)',
                grupo: 'grupo'
            };

            const sortField = allowedSortFields[filters.sortBy] || 'LOWER(nombre)';
            const sortOrder = filters.sortOrder === 'desc' ? 'DESC' : 'ASC';
            const orderClause = sortField === 'LOWER(nombre)'
                ? `ORDER BY LOWER(nombre) ${sortOrder}, nombre ${sortOrder}`
                : `ORDER BY ${sortField} ${sortOrder}`;

            if (filters.page && filters.limit) {
                const page = Math.max(parseInt(filters.page, 10) || 1, 1);
                const limit = Math.max(parseInt(filters.limit, 10) || 10, 1);
                const offset = (page - 1) * limit;

                const totalRow = await servicioBaseDatos.get(
                    `SELECT COUNT(*) AS total FROM students ${whereClause}`,
                    values
                );

                const paginatedRows = await servicioBaseDatos.all(
                    `SELECT matricula, nombre, grupo, created_at, updated_at
                     FROM students
                     ${whereClause}
                     ${orderClause}
                     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                    [...values, limit, offset]
                );

                const students = paginatedRows.map(row => this.mapRowToStudent(row));
                const total = Number.parseInt(totalRow?.total, 10) || 0;

                return {
                    students,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit) || 1,
                        hasNext: offset + students.length < total,
                        hasPrev: page > 1
                    }
                };
            }

            const rows = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 ${whereClause}
                 ${orderClause}`,
                values
            );

            const students = rows.map(row => this.mapRowToStudent(row));

            return {
                students,
                total: students.length
            };
        } catch (error) {
            console.error('❌ Error buscando estudiantes:', error);
            if (error instanceof ErrorAplicacion) {
                throw error;
            }
            throw new ErrorAplicacion('Error en búsqueda de estudiantes', 500, 'SEARCH_ERROR');
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
            throw new ErrorAplicacion('Error al validar integridad de datos', 500, 'INTEGRITY_CHECK_ERROR');
        }
    }
}

module.exports = ServicioEstudiantes;
