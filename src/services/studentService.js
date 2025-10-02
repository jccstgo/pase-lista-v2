const Student = require('../models/Student');
const CSVService = require('./csvService');
const config = require('../config/server');
const { AppError } = require('../middleware/errorHandler');

class StudentService {
    /**
     * Obtener todos los estudiantes
     */
    static async getAllStudents() {
        try {
            const csvData = await CSVService.readCSV(config.FILES.STUDENTS);
            const students = Student.fromCSVArray(csvData);
            
            console.log(`📚 Cargados ${students.length} estudiantes`);
            return students;
        } catch (error) {
            console.error('❌ Error obteniendo estudiantes:', error);
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

            const students = await this.getAllStudents();
            const student = Student.findByMatricula(students, matricula);
            
            if (!student) {
                console.log(`⚠️ Estudiante no encontrado: ${matricula}`);
                return null;
            }

            console.log(`✅ Estudiante encontrado: ${student.nombre}`);
            return student;
        } catch (error) {
            console.error('❌ Error buscando estudiante:', error);
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

            const students = await this.getAllStudents();
            const studentsInGroup = Student.findByGroup(students, grupo);
            
            console.log(`📊 Encontrados ${studentsInGroup.length} estudiantes en grupo ${grupo}`);
            return studentsInGroup;
        } catch (error) {
            console.error('❌ Error buscando estudiantes por grupo:', error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Error al buscar estudiantes por grupo', 500, 'GROUP_SEARCH_ERROR');
        }
    }

    /**
     * Crear/actualizar lista completa de estudiantes
     */
    static async updateStudentsList(studentsData) {
        try {
            if (!Array.isArray(studentsData) || studentsData.length === 0) {
                throw new AppError('Lista de estudiantes inválida o vacía', 400, 'INVALID_STUDENTS_LIST');
            }

            // Crear backup del archivo actual
            if (await CSVService.fileExists(config.FILES.STUDENTS)) {
                await CSVService.backupCSV(config.FILES.STUDENTS);
            }

            // Validar y procesar estudiantes
            const validStudents = [];
            const errors = [];

            for (let i = 0; i < studentsData.length; i++) {
                try {
                    const student = new Student(studentsData[i]);
                    const validation = student.isValid();
                    
                    if (!validation.isValid) {
                        errors.push(`Estudiante ${i + 1}: ${validation.errors.join(', ')}`);
                        continue;
                    }

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

            // Verificar duplicados por matrícula
            const matriculas = new Set();
            const duplicates = [];
            
            const uniqueStudents = validStudents.filter(student => {
                if (matriculas.has(student.matricula)) {
                    duplicates.push(student.matricula);
                    return false;
                }
                matriculas.add(student.matricula);
                return true;
            });

            if (duplicates.length > 0) {
                console.warn(`⚠️ Matrículas duplicadas removidas: ${duplicates.join(', ')}`);
            }

            // Escribir al archivo CSV
            const csvData = uniqueStudents.map(student => student.toCSV());
            await CSVService.writeCSV(config.FILES.STUDENTS, csvData, config.CSV_HEADERS.STUDENTS);

            console.log(`✅ Lista de estudiantes actualizada: ${uniqueStudents.length} estudiantes válidos`);
            
            return {
                success: true,
                totalProcessed: studentsData.length,
                validStudents: uniqueStudents.length,
                duplicatesRemoved: duplicates.length,
                errors: errors.slice(0, 10), // Limitar errores mostrados
                students: uniqueStudents
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
            const student = new Student(studentData);
            const validation = student.isValid();
            
            if (!validation.isValid) {
                throw new AppError(`Datos de estudiante inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_STUDENT_DATA');
            }

            // Verificar que no exista ya
            const existingStudent = await this.findByMatricula(student.matricula);
            if (existingStudent) {
                throw new AppError(`Ya existe un estudiante con matrícula ${student.matricula}`, 409, 'STUDENT_ALREADY_EXISTS');
            }

            // Agregar al archivo CSV
            await CSVService.appendToCSV(
                config.FILES.STUDENTS, 
                student.toCSV(), 
                config.CSV_HEADERS.STUDENTS
            );

            console.log(`✅ Estudiante agregado: ${student.nombre} (${student.matricula})`);
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
            // Verificar que el estudiante existe
            const existingStudent = await this.findByMatricula(matricula);
            if (!existingStudent) {
                throw new AppError('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            // Crear estudiante actualizado
            const updatedStudent = new Student({
                ...existingStudent.toJSON(),
                ...updateData,
                matricula: existingStudent.matricula // No permitir cambiar matrícula
            });

            const validation = updatedStudent.isValid();
            if (!validation.isValid) {
                throw new AppError(`Datos actualizados inválidos: ${validation.errors.join(', ')}`, 400, 'INVALID_UPDATE_DATA');
            }

            // Actualizar en CSV
            const updated = await CSVService.updateInCSV(
                config.FILES.STUDENTS,
                { matricula: existingStudent.matricula },
                updatedStudent.toCSV(),
                config.CSV_HEADERS.STUDENTS
            );

            if (!updated) {
                throw new AppError('No se pudo actualizar el estudiante', 500, 'UPDATE_FAILED');
            }

            console.log(`✅ Estudiante actualizado: ${updatedStudent.nombre} (${updatedStudent.matricula})`);
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
            // Verificar que el estudiante existe
            const existingStudent = await this.findByMatricula(matricula);
            if (!existingStudent) {
                throw new AppError('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            // Eliminar del CSV
            const deletedCount = await CSVService.deleteFromCSV(
                config.FILES.STUDENTS,
                { matricula: existingStudent.matricula },
                config.CSV_HEADERS.STUDENTS
            );

            if (deletedCount === 0) {
                throw new AppError('No se pudo eliminar el estudiante', 500, 'DELETE_FAILED');
            }

            console.log(`🗑️ Estudiante eliminado: ${existingStudent.nombre} (${existingStudent.matricula})`);
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
     * Obtener estadísticas de estudiantes
     */
    static async getStudentStats() {
        try {
            const students = await this.getAllStudents();
            const stats = Student.getStats(students);
            
            // Información adicional del archivo
            const fileStats = await CSVService.getCSVStats(config.FILES.STUDENTS);
            
            return {
                ...stats,
                fileInfo: {
                    lastModified: fileStats.lastModified,
                    fileSize: fileStats.fileSize
                },
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
            const students = await this.getAllStudents();
            
            let filteredStudents = students;
            
            // Filtro por matrícula (búsqueda parcial)
            if (filters.matricula) {
                const searchMatricula = filters.matricula.toUpperCase();
                filteredStudents = filteredStudents.filter(student => 
                    student.matricula.includes(searchMatricula)
                );
            }
            
            // Filtro por nombre (búsqueda parcial, case-insensitive)
            if (filters.nombre) {
                const searchNombre = filters.nombre.toLowerCase();
                filteredStudents = filteredStudents.filter(student => 
                    student.nombre.toLowerCase().includes(searchNombre)
                );
            }
            
            // Filtro por grupo
            if (filters.grupo) {
                const searchGrupo = filters.grupo.toUpperCase();
                filteredStudents = filteredStudents.filter(student => 
                    student.grupo === searchGrupo
                );
            }
            
            // Ordenamiento
            if (filters.sortBy) {
                const sortField = filters.sortBy;
                const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;
                
                filteredStudents.sort((a, b) => {
                    const valueA = a[sortField] || '';
                    const valueB = b[sortField] || '';
                    
                    return valueA.localeCompare(valueB) * sortOrder;
                });
            }
            
            // Paginación
            if (filters.page && filters.limit) {
                const page = parseInt(filters.page);
                const limit = parseInt(filters.limit);
                const startIndex = (page - 1) * limit;
                const endIndex = startIndex + limit;
                
                const total = filteredStudents.length;
                const paginatedStudents = filteredStudents.slice(startIndex, endIndex);
                
                return {
                    students: paginatedStudents,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                        hasNext: endIndex < total,
                        hasPrev: page > 1
                    }
                };
            }
            
            return {
                students: filteredStudents,
                total: filteredStudents.length
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
            
            // Verificar duplicados
            const matriculas = new Map();
            students.forEach((student, index) => {
                if (matriculas.has(student.matricula)) {
                    issues.push({
                        type: 'DUPLICATE_MATRICULA',
                        message: `Matrícula duplicada: ${student.matricula}`,
                        indices: [matriculas.get(student.matricula), index]
                    });
                } else {
                    matriculas.set(student.matricula, index);
                }
            });
            
            // Verificar datos faltantes o inválidos
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
            console.error('❌ Error validando integridad:', error);
            throw new AppError('Error al validar integridad de datos', 500, 'INTEGRITY_CHECK_ERROR');
        }
    }
}

module.exports = StudentService;
