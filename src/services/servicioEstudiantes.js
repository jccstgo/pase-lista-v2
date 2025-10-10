const Estudiante = require('../models/Estudiante');
const servicioBaseDatos = require('./servicioBaseDatos');
const config = require('../config/server');
const { ErrorAplicacion } = require('../middleware/manejadorErrores');

class ServicioEstudiantes {
    /**
     * Convertir fila de la base de datos a instancia de Estudiante
     */
    static mapearFilaAEstudiante(fila) {
        if (!fila) {
            return null;
        }

        const normalizeDate = (value) => (value instanceof Date ? value.toISOString() : value);

        return new Estudiante({
            matricula: fila.matricula,
            nombre: fila.nombre,
            grupo: fila.grupo,
            createdAt: normalizeDate(fila.created_at),
            updatedAt: normalizeDate(fila.updated_at)
        });
    }

    /**
     * Obtener todos los estudiantes
     */
    static async obtenerTodosLosEstudiantes() {
        try {
            const filas = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 ORDER BY LOWER(nombre) ASC, nombre ASC`
            );

            const estudiantes = filas.map(fila => this.mapearFilaAEstudiante(fila));
            console.log(`📚 Cargados ${estudiantes.length} estudiantes desde la base de datos`);
            return estudiantes;
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
    static async buscarPorMatricula(matricula) {
        try {
            if (!matricula) {
                throw new ErrorAplicacion('Matrícula es requerida', 400, 'MISSING_MATRICULA');
            }

            const matriculaNormalizada = new Estudiante({ matricula }).matricula;
            const fila = await servicioBaseDatos.get(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 WHERE matricula = $1`,
                [matriculaNormalizada]
            );

            if (!fila) {
                console.log(`⚠️ Estudiante no encontrado en base de datos: ${matriculaNormalizada}`);
                return null;
            }

            const estudiante = this.mapearFilaAEstudiante(fila);
            console.log(`✅ Estudiante encontrado en base de datos: ${estudiante.nombre}`);
            return estudiante;
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
    static async buscarPorGrupo(grupo) {
        try {
            if (!grupo) {
                throw new ErrorAplicacion('Grupo es requerido', 400, 'MISSING_GROUP');
            }

            const grupoNormalizado = new Estudiante({ grupo }).grupo;
            const filas = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 WHERE grupo = $1
                 ORDER BY LOWER(nombre) ASC, nombre ASC`,
                [grupoNormalizado]
            );

            const estudiantes = filas.map(fila => this.mapearFilaAEstudiante(fila));
            console.log(`📊 Encontrados ${estudiantes.length} estudiantes en grupo ${grupoNormalizado}`);
            return estudiantes;
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
    static async actualizarListaEstudiantes(datosEstudiantes) {
        try {
            if (!Array.isArray(datosEstudiantes) || datosEstudiantes.length === 0) {
                throw new ErrorAplicacion('Lista de estudiantes inválida o vacía', 400, 'INVALID_STUDENTS_LIST');
            }

            const estudiantesValidos = [];
            const errores = [];
            const duplicados = [];
            const matriculas = new Set();
            const marcaTiempo = new Date().toISOString();

            for (let i = 0; i < datosEstudiantes.length; i++) {
                try {
                    const estudiante = new Estudiante({
                        ...datosEstudiantes[i],
                        createdAt: datosEstudiantes[i].createdAt || marcaTiempo,
                        updatedAt: marcaTiempo
                    });

                    const validacion = estudiante.isValid();
                    if (!validacion.isValid) {
                        errores.push(`Estudiante ${i + 1}: ${validacion.errors.join(', ')}`);
                        continue;
                    }

                    if (matriculas.has(estudiante.matricula)) {
                        duplicados.push(estudiante.matricula);
                        continue;
                    }

                    matriculas.add(estudiante.matricula);
                    estudiantesValidos.push(estudiante);
                } catch (error) {
                    errores.push(`Estudiante ${i + 1}: Error de procesamiento - ${error.message}`);
                }
            }

            if (estudiantesValidos.length === 0) {
                throw new ErrorAplicacion(
                    `No hay estudiantes válidos. Errores: ${errores.slice(0, 5).join('; ')}`,
                    400,
                    'NO_VALID_STUDENTS'
                );
            }

            try {
                await servicioBaseDatos.backupDatabase('students');
            } catch (backupError) {
                console.warn('⚠️ No se pudo crear respaldo de estudiantes:', backupError.message);
            }

            await servicioBaseDatos.transaction(async (cliente) => {
                await cliente.query('DELETE FROM students');

                for (const estudiante of estudiantesValidos) {
                    await cliente.query(
                        `INSERT INTO students (matricula, nombre, grupo, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (matricula) DO UPDATE SET
                             nombre = EXCLUDED.nombre,
                             grupo = EXCLUDED.grupo,
                             updated_at = EXCLUDED.updated_at`,
                        [
                            estudiante.matricula,
                            estudiante.nombre,
                            estudiante.grupo,
                            estudiante.createdAt,
                            estudiante.updatedAt
                        ]
                    );
                }
            });

            console.log(`✅ Lista de estudiantes actualizada en base de datos: ${estudiantesValidos.length} registros válidos`);

            return {
                success: true,
                message: config.MESSAGES.SUCCESS.STUDENTS_UPLOADED,
                totalProcessed: datosEstudiantes.length,
                validStudents: estudiantesValidos.length,
                duplicatesRemoved: duplicados.length,
                errors: errores.slice(0, 10),
                students: estudiantesValidos
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
    static async agregarEstudiante(datosEstudiante) {
        try {
            const marcaTiempo = new Date().toISOString();
            const estudiante = new Estudiante({
                ...datosEstudiante,
                createdAt: marcaTiempo,
                updatedAt: marcaTiempo
            });

            const validacion = estudiante.isValid();
            if (!validacion.isValid) {
                throw new ErrorAplicacion(`Datos de estudiante inválidos: ${validacion.errors.join(', ')}`, 400, 'INVALID_STUDENT_DATA');
            }

            const existing = await servicioBaseDatos.get(
                'SELECT matricula FROM students WHERE matricula = $1',
                [estudiante.matricula]
            );

            if (existing) {
                throw new ErrorAplicacion(`Ya existe un estudiante con matrícula ${estudiante.matricula}`, 409, 'STUDENT_ALREADY_EXISTS');
            }

            await servicioBaseDatos.run(
                `INSERT INTO students (matricula, nombre, grupo, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    estudiante.matricula,
                    estudiante.nombre,
                    estudiante.grupo,
                    estudiante.createdAt,
                    estudiante.updatedAt
                ]
            );

            console.log(`✅ Estudiante agregado a la base de datos: ${estudiante.nombre} (${estudiante.matricula})`);
            return estudiante;
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
    static async actualizarEstudiante(matricula, datosActualizacion) {
        try {
            const estudianteExistente = await this.buscarPorMatricula(matricula);
            if (!estudianteExistente) {
                throw new ErrorAplicacion('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            const marcaTiempo = new Date().toISOString();
            const estudianteActualizado = new Estudiante({
                ...estudianteExistente.toJSON(),
                ...datosActualizacion,
                matricula: estudianteExistente.matricula,
                createdAt: estudianteExistente.createdAt,
                updatedAt: marcaTiempo
            });

            const validacion = estudianteActualizado.isValid();
            if (!validacion.isValid) {
                throw new ErrorAplicacion(
                    `Datos actualizados inválidos: ${validacion.errors.join(', ')}`,
                    400,
                    'INVALID_UPDATE_DATA'
                );
            }

            const resultado = await servicioBaseDatos.run(
                `UPDATE students
                 SET nombre = $1,
                     grupo = $2,
                     updated_at = $3
                 WHERE matricula = $4`,
                [
                    estudianteActualizado.nombre,
                    estudianteActualizado.grupo,
                    estudianteActualizado.updatedAt,
                    estudianteActualizado.matricula
                ]
            );

            if (resultado.rowCount === 0) {
                throw new ErrorAplicacion('No se pudo actualizar el estudiante', 500, 'UPDATE_FAILED');
            }

            console.log(`✅ Estudiante actualizado en base de datos: ${estudianteActualizado.nombre} (${estudianteActualizado.matricula})`);
            return estudianteActualizado;
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
    static async eliminarEstudiante(matricula) {
        try {
            const estudianteExistente = await this.buscarPorMatricula(matricula);
            if (!estudianteExistente) {
                throw new ErrorAplicacion('Estudiante no encontrado', 404, 'STUDENT_NOT_FOUND');
            }

            const resultado = await servicioBaseDatos.run(
                'DELETE FROM students WHERE matricula = $1',
                [estudianteExistente.matricula]
            );

            if (resultado.rowCount === 0) {
                throw new ErrorAplicacion('No se pudo eliminar el estudiante', 500, 'DELETE_FAILED');
            }

            console.log(`🗑️ Estudiante eliminado de la base de datos: ${estudianteExistente.nombre} (${estudianteExistente.matricula})`);
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
    static async limpiarTodosLosEstudiantes() {
        try {
            try {
                await servicioBaseDatos.backupDatabase('students-clear');
            } catch (errorRespaldo) {
                console.warn('⚠️ No se pudo crear respaldo antes de limpiar estudiantes:', errorRespaldo.message);
            }

            const resultado = await servicioBaseDatos.clearTable('students');
            console.log(`🧹 Base de datos de estudiantes limpiada. Registros eliminados: ${resultado.rowCount}`);

            return {
                deleted: resultado.rowCount,
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
    static async obtenerEstadisticasEstudiantes() {
        try {
            const totales = await servicioBaseDatos.get('SELECT COUNT(*) AS total FROM students');
            const filasPorGrupo = await servicioBaseDatos.all(
                `SELECT grupo, COUNT(*) AS total
                 FROM students
                 GROUP BY grupo
                 ORDER BY grupo`
            );

            const grupos = {};
            filasPorGrupo.forEach(fila => {
                grupos[fila.grupo] = Number.parseInt(fila.total, 10);
            });

            return {
                total: Number.parseInt(totales?.total, 10) || 0,
                groups: grupos,
                groupCount: Object.keys(grupos).length,
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
    static async buscarEstudiantes(filtros = {}) {
        try {
            const condiciones = [];
            const valores = [];
            let indiceParametro = 1;

            if (filtros.matricula) {
                condiciones.push(`matricula ILIKE $${indiceParametro}`);
                valores.push(`%${filtros.matricula.toString().trim().toUpperCase()}%`);
                indiceParametro += 1;
            }

            if (filtros.nombre) {
                condiciones.push(`nombre ILIKE $${indiceParametro}`);
                valores.push(`%${filtros.nombre.toString().trim()}%`);
                indiceParametro += 1;
            }

            if (filtros.grupo) {
                condiciones.push(`grupo = $${indiceParametro}`);
                valores.push(filtros.grupo.toString().trim().toUpperCase());
                indiceParametro += 1;
            }

            const clausulaWhere = condiciones.length > 0
                ? `WHERE ${condiciones.join(' AND ')}`
                : '';

            const camposOrdenamientoPermitidos = {
                matricula: 'matricula',
                nombre: 'LOWER(nombre)',
                grupo: 'grupo'
            };

            const campoOrden = camposOrdenamientoPermitidos[filtros.sortBy] || 'LOWER(nombre)';
            const orden = filtros.sortOrder === 'desc' ? 'DESC' : 'ASC';
            const clausulaOrden = campoOrden === 'LOWER(nombre)'
                ? `ORDER BY LOWER(nombre) ${orden}, nombre ${orden}`
                : `ORDER BY ${campoOrden} ${orden}`;

            if (filtros.page && filtros.limit) {
                const pagina = Math.max(parseInt(filtros.page, 10) || 1, 1);
                const limite = Math.max(parseInt(filtros.limit, 10) || 10, 1);
                const desplazamiento = (pagina - 1) * limite;

                const filaTotal = await servicioBaseDatos.get(
                    `SELECT COUNT(*) AS total FROM students ${clausulaWhere}`,
                    valores
                );

                const filasPaginadas = await servicioBaseDatos.all(
                    `SELECT matricula, nombre, grupo, created_at, updated_at
                     FROM students
                     ${clausulaWhere}
                     ${clausulaOrden}
                     LIMIT $${indiceParametro} OFFSET $${indiceParametro + 1}`,
                    [...valores, limite, desplazamiento]
                );

                const estudiantes = filasPaginadas.map(fila => this.mapearFilaAEstudiante(fila));
                const total = Number.parseInt(filaTotal?.total, 10) || 0;

                return {
                    students: estudiantes,
                    pagination: {
                        page: pagina,
                        limit: limite,
                        total,
                        totalPages: Math.ceil(total / limite) || 1,
                        hasNext: desplazamiento + estudiantes.length < total,
                        hasPrev: pagina > 1
                    }
                };
            }

            const filas = await servicioBaseDatos.all(
                `SELECT matricula, nombre, grupo, created_at, updated_at
                 FROM students
                 ${clausulaWhere}
                 ${clausulaOrden}`,
                valores
            );

            const estudiantes = filas.map(fila => this.mapearFilaAEstudiante(fila));

            return {
                students: estudiantes,
                total: estudiantes.length
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
    static async validarIntegridadDatos() {
        try {
            const estudiantes = await this.obtenerTodosLosEstudiantes();
            const incidencias = [];

            estudiantes.forEach((estudiante, indice) => {
                const validacion = estudiante.isValid();
                if (!validacion.isValid) {
                    incidencias.push({
                        type: 'INVALID_DATA',
                        message: `Estudiante ${indice + 1}: ${validacion.errors.join(', ')}`,
                        student: estudiante.toJSON()
                    });
                }
            });

            return {
                isValid: incidencias.length === 0,
                totalStudents: estudiantes.length,
                issues: incidencias,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Error validando integridad de estudiantes:', error);
            throw new ErrorAplicacion('Error al validar integridad de datos', 500, 'INTEGRITY_CHECK_ERROR');
        }
    }
}

module.exports = ServicioEstudiantes;
