const fs = require('fs').promises;
const fsSync = require('fs');
const { Readable } = require('stream');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { AppError } = require('../middleware/errorHandler');
const { decodePotentiallyMisencodedText, decodeBufferToText } = require('../utils/encoding');

class CSVService {
    /**
     * Verificar si un archivo existe
     */
    static async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Crear directorio si no existe
     */
    static async ensureDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`✅ Directorio ${dirPath} creado/verificado`);
            return true;
        } catch (error) {
            console.error(`❌ Error creando directorio ${dirPath}:`, error);
            throw new AppError(`Error creando directorio: ${error.message}`, 500, 'DIRECTORY_ERROR');
        }
    }

    /**
     * Leer archivo CSV
     */
    static async readCSV(filePath) {
        if (!fsSync.existsSync(filePath)) {
            console.log(`⚠️ Archivo no encontrado: ${filePath}, retornando array vacío`);
            return [];
        }

        let decodedContent = '';

        try {
            const fileBuffer = await fs.readFile(filePath);
            decodedContent = decodeBufferToText(fileBuffer);
        } catch (error) {
            console.error(`❌ Error leyendo ${filePath}:`, error);
            throw new AppError(`Error leyendo CSV: ${error.message}`, 500, 'CSV_READ_ERROR');
        }

        return new Promise((resolve, reject) => {
            const results = [];

            Readable.from([decodedContent])
                .pipe(csv({
                    skipEmptyLines: true,
                    mapHeaders: ({ header }) => {
                        if (typeof header !== 'string') {
                            return header;
                        }

                        const trimmed = header.replace(/^\uFEFF/, '').trim();
                        return decodePotentiallyMisencodedText(trimmed);
                    }
                }))
                .on('data', (data) => {
                    const cleanData = {};
                    Object.keys(data).forEach(key => {
                        const cleanKey = decodePotentiallyMisencodedText(
                            key.replace(/^\uFEFF/, '').trim()
                        );
                        const value = data[key];

                        if (typeof value === 'string') {
                            const trimmedValue = value.trim();
                            cleanData[cleanKey] = decodePotentiallyMisencodedText(trimmedValue);
                        } else {
                            cleanData[cleanKey] = value;
                        }
                    });

                    const hasData = Object.values(cleanData).some(value => value && value.toString().trim() !== '');
                    if (hasData) {
                        results.push(cleanData);
                    }
                })
                .on('end', () => {
                    console.log(`📖 Leídos ${results.length} registros válidos de ${filePath}`);
                    resolve(results);
                })
                .on('error', (error) => {
                    console.error(`❌ Error procesando CSV ${filePath}:`, error);
                    reject(new AppError(`Error leyendo CSV: ${error.message}`, 500, 'CSV_READ_ERROR'));
                });
        });
    }

    /**
     * Escribir archivo CSV
     */
    static async writeCSV(filePath, data, headers) {
        try {
            // Validar parámetros
            if (!filePath || !headers) {
                throw new AppError('Ruta de archivo y headers son requeridos', 400, 'INVALID_PARAMETERS');
            }

            if (!Array.isArray(data)) {
                throw new AppError('Los datos deben ser un array', 400, 'INVALID_DATA_TYPE');
            }

            if (!Array.isArray(headers)) {
                throw new AppError('Los headers deben ser un array', 400, 'INVALID_HEADERS_TYPE');
            }

            // Crear directorio padre si no existe
            const dirPath = require('path').dirname(filePath);
            await this.ensureDirectory(dirPath);
            
            const writer = createCsvWriter({
                path: filePath,
                header: headers,
                encoding: 'utf8'
            });
            
            await writer.writeRecords(data);
            console.log(`💾 Escritos ${data.length} registros en ${filePath}`);
            
            return true;
        } catch (error) {
            console.error(`❌ Error escribiendo ${filePath}:`, error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Error escribiendo CSV: ${error.message}`, 500, 'CSV_WRITE_ERROR');
        }
    }

    /**
     * Escribir CSV con solo headers (archivo vacío)
     */
    static async writeEmptyCSV(filePath, headers) {
        try {
            const headerLine = headers.map(h => h.title || h.id).join(',');
            await fs.writeFile(filePath, headerLine + '\n', 'utf8');
            console.log(`💾 Archivo ${filePath} inicializado con headers`);
            return true;
        } catch (error) {
            console.error(`❌ Error creando archivo vacío ${filePath}:`, error);
            throw new AppError(`Error creando archivo CSV vacío: ${error.message}`, 500, 'CSV_CREATE_ERROR');
        }
    }

    /**
     * Agregar registro a CSV existente
     */
    static async appendToCSV(filePath, newRecord, headers) {
        try {
            // Leer registros existentes
            const existingRecords = await this.readCSV(filePath);
            
            // Agregar nuevo registro
            const allRecords = [...existingRecords, newRecord];
            
            // Escribir todo de nuevo
            await this.writeCSV(filePath, allRecords, headers);
            
            return allRecords.length;
        } catch (error) {
            console.error(`❌ Error agregando registro a ${filePath}:`, error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Error agregando a CSV: ${error.message}`, 500, 'CSV_APPEND_ERROR');
        }
    }

    /**
     * Buscar registros en CSV
     */
    static async findInCSV(filePath, searchCriteria) {
        try {
            const records = await this.readCSV(filePath);
            
            if (!searchCriteria || Object.keys(searchCriteria).length === 0) {
                return records;
            }
            
            return records.filter(record => {
                return Object.entries(searchCriteria).every(([key, value]) => {
                    const recordValue = record[key];
                    if (!recordValue) return false;
                    
                    // Comparación case-insensitive para strings
                    if (typeof value === 'string' && typeof recordValue === 'string') {
                        return recordValue.toLowerCase().includes(value.toLowerCase());
                    }
                    
                    return recordValue === value;
                });
            });
        } catch (error) {
            console.error(`❌ Error buscando en ${filePath}:`, error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Error buscando en CSV: ${error.message}`, 500, 'CSV_SEARCH_ERROR');
        }
    }

    /**
     * Actualizar registro en CSV
     */
    static async updateInCSV(filePath, searchCriteria, updateData, headers) {
        try {
            const records = await this.readCSV(filePath);
            let updated = false;
            
            const updatedRecords = records.map(record => {
                const matches = Object.entries(searchCriteria).every(([key, value]) => 
                    record[key] === value
                );
                
                if (matches) {
                    updated = true;
                    return { ...record, ...updateData };
                }
                
                return record;
            });
            
            if (updated) {
                await this.writeCSV(filePath, updatedRecords, headers);
                console.log(`✅ Registro actualizado en ${filePath}`);
            }
            
            return updated;
        } catch (error) {
            console.error(`❌ Error actualizando en ${filePath}:`, error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Error actualizando CSV: ${error.message}`, 500, 'CSV_UPDATE_ERROR');
        }
    }

    /**
     * Eliminar registros de CSV
     */
    static async deleteFromCSV(filePath, searchCriteria, headers) {
        try {
            const records = await this.readCSV(filePath);
            
            const filteredRecords = records.filter(record => {
                return !Object.entries(searchCriteria).every(([key, value]) => 
                    record[key] === value
                );
            });
            
            const deletedCount = records.length - filteredRecords.length;
            
            if (deletedCount > 0) {
                await this.writeCSV(filePath, filteredRecords, headers);
                console.log(`🗑️ ${deletedCount} registros eliminados de ${filePath}`);
            }
            
            return deletedCount;
        } catch (error) {
            console.error(`❌ Error eliminando de ${filePath}:`, error);
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Error eliminando de CSV: ${error.message}`, 500, 'CSV_DELETE_ERROR');
        }
    }

    /**
     * Obtener estadísticas de archivo CSV
     */
    static async getCSVStats(filePath) {
        try {
            const records = await this.readCSV(filePath);
            const stats = await fs.stat(filePath);
            
            return {
                recordCount: records.length,
                fileSize: stats.size,
                lastModified: stats.mtime.toISOString(),
                created: stats.birthtime.toISOString()
            };
        } catch (error) {
            console.error(`❌ Error obteniendo estadísticas de ${filePath}:`, error);
            throw new AppError(`Error obteniendo estadísticas: ${error.message}`, 500, 'CSV_STATS_ERROR');
        }
    }

    /**
     * Hacer backup de archivo CSV
     */
    static async backupCSV(filePath) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = `${filePath}.backup.${timestamp}`;
            
            await fs.copyFile(filePath, backupPath);
            console.log(`📋 Backup creado: ${backupPath}`);
            
            return backupPath;
        } catch (error) {
            console.error(`❌ Error creando backup de ${filePath}:`, error);
            throw new AppError(`Error creando backup: ${error.message}`, 500, 'CSV_BACKUP_ERROR');
        }
    }
}

module.exports = CSVService;