const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


const app = express();
const PORT = process.env.PORT || 3000;
//const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';
const JWT_SECRET = process.env.JWT_SECRET || 'sistema-militar-pase-lista-2024-clave-temporal-cambiar-en-produccion';

// Validar que se configure JWT_SECRET en producción
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.warn('⚠️ ADVERTENCIA: JWT_SECRET no configurado en producción. Configurar en variables de entorno.');
}

// Middleware
app.use(express.json());

app.use(express.static('public'));
// Headers de seguridad para producción
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
    });
    console.log('🛡️ Headers de seguridad activados para producción');
}


// Archivos CSV
const STUDENTS_FILE = 'data/students.csv';
const ATTENDANCE_FILE = 'data/attendance.csv';
const ADMIN_FILE = 'data/admin.csv';

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// Inicializar archivos si no existen
async function initializeFiles() {
    try {
        console.log('🔄 Inicializando sistema de archivos...');
        
        // Crear directorio data
        await fs.mkdir('data', { recursive: true });
        console.log('✅ Directorio data creado/verificado');
        
       // Verificar/crear archivo de estudiantes
        if (!(await fileExists(STUDENTS_FILE))) {
            console.log('📁 Creando archivo de estudiantes vacío...');
            const studentsWriter = createCsvWriter({
                path: STUDENTS_FILE,
                header: [
                    { id: 'matricula', title: 'matricula' },
                    { id: 'nombre', title: 'nombre' },
                    { id: 'grupo', title: 'grupo' }
                ]
            });
            await studentsWriter.writeRecords([]);
            console.log('✅ Archivo students.csv creado vacío con formato: matricula, nombre, grupo');
        } else {
            console.log('✅ Archivo students.csv existe');
        }

        // Verificar/crear archivo de asistencia
        if (!(await fileExists(ATTENDANCE_FILE))) {
            console.log('📝 Creando archivo de asistencia...');
            await writeAttendanceCSV(ATTENDANCE_FILE, [], [
                { id: 'matricula', title: 'matricula' },
                { id: 'nombre', title: 'nombre' },
                { id: 'grupo', title: 'grupo' },
                { id: 'timestamp', title: 'timestamp' },
                { id: 'status', title: 'status' }
            ]);
            console.log('✅ Archivo attendance.csv creado');
        } else {
            console.log('✅ Archivo attendance.csv existe');
        }

        // Crear admin por defecto si no existe
        if (!(await fileExists(ADMIN_FILE))) {
            console.log('🔐 Creando usuario administrador...');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const adminWriter = createCsvWriter({
                path: ADMIN_FILE,
                header: [
                    { id: 'username', title: 'username' },
                    { id: 'password', title: 'password' }
                ]
            });
            await adminWriter.writeRecords([
                { username: 'admin', password: hashedPassword }
            ]);
            console.log('✅ Usuario admin creado (admin/admin123)');
        } else {
            console.log('✅ Archivo admin.csv existe');
        }
        
        console.log('🎉 Inicialización completada exitosamente');
    } catch (error) {
        console.error('❌ Error inicializando archivos:', error);
        throw error;
    }
}

// Función mejorada para leer CSV
async function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        
        // Verificar si el archivo existe usando fs sync
        if (!require('fs').existsSync(filePath)) {
            console.log(`⚠️ Archivo no encontrado: ${filePath}, retornando array vacío`);
            resolve([]);
            return;
        }
        
        require('fs').createReadStream(filePath, { encoding: 'utf8' })
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
                console.log(`📖 Leídos ${results.length} registros de ${filePath}`);
                resolve(results);
            })
            .on('error', (error) => {
                console.error(`❌ Error leyendo ${filePath}:`, error);
                reject(error);
            });
    });
}

// Función para escribir CSV con mejor manejo de errores
async function writeCSV(filePath, data, headers) {
    try {
        const writer = createCsvWriter({
            path: filePath,
            header: headers,
            encoding: 'utf8'
        });
        await writer.writeRecords(data);
        
        // Agregar BOM para UTF-8 si el archivo es nuevo
        // const fs = require('fs');
        // const content = fs.readFileSync(filePath, 'utf8');
        // if (!content.startsWith('\uFEFF')) {
        //     fs.writeFileSync(filePath, '\uFEFF' + content, 'utf8');
        // }
        
        console.log(`💾 Escritos ${data.length} registros en ${filePath}`);
    } catch (error) {
        console.error(`❌ Error escribiendo ${filePath}:`, error);
        throw error;
    }
}

// Función específica para escribir attendance con UTF-8 correcto
// Función específica para escribir attendance SIN BOM UTF-8
async function writeAttendanceCSV(filePath, data, headers) {
    try {
        // Si no hay datos, solo crear header
        if (data.length === 0) {
            const fs = require('fs');
            const headerLine = headers.map(h => h.title).join(',');
            fs.writeFileSync(filePath, headerLine + '\n', 'utf8');
            console.log(`💾 Archivo ${filePath} inicializado sin BOM`);
            return;
        }
        
        // Para datos reales, usar el writer normal SIN BOM
        const writer = createCsvWriter({
            path: filePath,
            header: headers,
            encoding: 'utf8'
        });
        
        await writer.writeRecords(data);
        console.log(`💾 Escritos ${data.length} registros en ${filePath} sin BOM`);
    } catch (error) {
        console.error(`❌ Error escribiendo ${filePath}:`, error);
        throw error;
    }
}

// Middleware de autenticación para admin
async function authenticateAdmin(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Token requerido' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        console.error('❌ Error de autenticación:', error);
        res.status(403).json({ error: 'Token inválido' });
    }
}

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    res.status(500).json({ 
        error: 'Error interno del servidor',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// RUTAS

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Servidor funcionando correctamente'
    });
});

// Login de administrador
app.post('/api/admin/login', async (req, res) => {
    try {
        console.log('🔐 Intento de login admin');
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        }
        
        const admins = await readCSV(ADMIN_FILE);
        console.log(`📖 ${admins.length} administradores encontrados`);
        
        const admin = admins.find(a => a.username === username);
        if (!admin) {
            console.log(`⚠️ Usuario no encontrado: ${username}`);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        const isValidPassword = await bcrypt.compare(password, admin.password);
        if (!isValidPassword) {
            console.log(`⚠️ Contraseña incorrecta para: ${username}`);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
        console.log(`✅ Login exitoso para: ${username}`);
        res.json({ token });
    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ error: 'Error del servidor en login' });
    }
});


// Registrar asistencia
app.post('/api/attendance', async (req, res) => {
    try {
        console.log('📝 Intento de registro de asistencia');
        const { matricula } = req.body;
        
        if (!matricula || matricula.trim() === '') {
            return res.status(400).json({ error: 'Matrícula requerida' });
        }

        const cleanMatricula = matricula.trim().toUpperCase().replace(/[\s\-]/g, '');
        console.log(`🔍 Procesando matrícula: ${cleanMatricula}`);

        // Leer estudiantes registrados
        const students = await readCSV(STUDENTS_FILE);
        
        // Filtrar estudiantes válidos (que tengan matrícula)
        // Limpiar BOM y normalizar datos
        const cleanedStudents = students.map(s => {
            // Buscar cualquier clave que contenga 'matricula'
            const matriculaKey = Object.keys(s).find(key => key.includes('matricula'));
            return {
                matricula: s.matricula || s[matriculaKey] || '',
                nombre: s.nombre || '',
                grupo: s.grupo || ''
            };
        });

        const validStudents = cleanedStudents.filter(s => s.matricula && s.matricula.trim() !== '');

        const student = validStudents.find(s => 
            s.matricula && s.matricula.toUpperCase().trim() === cleanMatricula
        );

        // Debug: resultado de búsqueda
        console.log('DEBUG: Estudiante encontrado:', student);

        
        // Si no está en la lista, rechazar inmediatamente
        if (!student) {
            console.log(`❌ Estudiante NO encontrado en lista: ${cleanMatricula}`);
            return res.status(404).json({ 
                error: 'Su matrícula no se encuentra registrada. Por favor acérquese al personal de Jefes de la Escuela Superior de Guerra.',
                status: 'not_registered'
            });
        }

        console.log(`✅ Estudiante encontrado: ${student.nombre}`);
        
        // Leer asistencias existentes
        const attendances = await readCSV(ATTENDANCE_FILE);
        
        // Filtrar asistencias válidas
        const validAttendances = attendances.filter(a => {
            const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
            return matricula && a.timestamp;
        });
        
        // Verificar si ya se registró hoy
        const today = new Date().toISOString().split('T')[0];
        const alreadyRegistered = validAttendances.find(a => {
            const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
            return matricula && matricula.toUpperCase().trim() === cleanMatricula && 
                a.timestamp && a.timestamp.startsWith(today);
        });
        
        if (alreadyRegistered) {
            console.log(`⚠️ Ya registrado hoy: ${cleanMatricula}`);
            return res.status(409).json({ 
                error: `Ya se ha registró su asistencia hoy a las ${new Date(alreadyRegistered.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`,
                timestamp: alreadyRegistered.timestamp,
                status: 'already_registered'
            });
        }

        // Crear registro de asistencia        
        const attendanceRecord = {
            matricula: cleanMatricula,
            nombre: student.nombre,
            grupo: student.grupo || '',
            timestamp: new Date().toISOString(),
            status: 'registered'
        };

        // CAMBIO CRÍTICO: Crear array completo sin perder registros existentes
        const allAttendances = [...validAttendances, attendanceRecord];
       // console.log(`📊 Registros existentes: ${validAttendances.length}, Nuevo total: ${allAttendances.length}`);

        await writeAttendanceCSV(ATTENDANCE_FILE, allAttendances, [
            { id: 'matricula', title: 'matricula' },
            { id: 'nombre', title: 'nombre' },
            { id: 'grupo', title: 'grupo' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'status', title: 'status' }
        ]);

        // Debug: verificar que se escribió correctamente
        //console.log('DEBUG: Registros escritos:', allAttendances.length);
        //console.log('DEBUG: Último registro:', allAttendances[allAttendances.length - 1]);

        // Verificar que se puede leer inmediatamente después
        const verifyRead = await readCSV(ATTENDANCE_FILE);
        //console.log('DEBUG: Verificación lectura después de escribir:', verifyRead.length, 'registros');

        const message = `¡Asistencia registrada exitosamente!<br>Grado y Nombre: <strong>${student.nombre}</strong><br>Grupo: <strong>${student.grupo.toUpperCase()}</strong>`;

        // console.log(`✅ Asistencia registrada: ${cleanMatricula} - ${student.nombre}`);
        
        res.json({ 
            success: true, 
            message,
            status: 'registered', 
            student: {
                nombre: student.nombre,
                grupo: student.grupo
            }
        });
    } catch (error) {
        //console.error('❌ Error registrando asistencia:', error);
        res.status(500).json({ error: 'Error del servidor al registrar asistencia' });
    }
});

// Obtener estadísticas (solo admin)
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
       // console.log('📊 Calculando estadísticas');
        const studentsRaw = await readCSV(STUDENTS_FILE);
        // Debug: ver las claves reales del primer estudiante
        if (studentsRaw.length > 0) {
          //  console.log('DEBUG - Claves del primer estudiante:', Object.keys(studentsRaw[0]));
            //console.log('DEBUG - Primer estudiante completo:', studentsRaw[0]);
        }

        const students = studentsRaw.map(s => {
            // Buscar cualquier clave que contenga 'matricula'
            const matriculaKey = Object.keys(s).find(key => key.includes('matricula'));
            return {
                matricula: s.matricula || s[matriculaKey] || '',
                nombre: s.nombre || '',
                grupo: s.grupo || ''
            };
        }).filter(s => s.matricula && s.matricula.trim() !== '');
        const attendances = await readCSV(ATTENDANCE_FILE);
        console.log('DEBUG FILTRO - Attendances raw:', attendances);
        console.log('DEBUG FILTRO - Primer attendance:', attendances[0]);

        console.log('DEBUG STATS - Raw students:', studentsRaw.length);
        console.log('DEBUG STATS - Cleaned students:', students.length);
        console.log('DEBUG STATS - Raw attendances:', attendances.length);
        console.log('DEBUG STATS - Sample student:', students[0]);
        
        
        // Filtrar asistencias del día actual con validación
        const today = new Date().toISOString().split('T')[0];
        console.log('DEBUG FECHA - Today:', today);
        console.log('DEBUG FECHA - Attendance timestamps:', attendances.map(a => a.timestamp));
        const todayAttendances = attendances.filter(a => {
            const isToday = a.timestamp && a.timestamp.startsWith(today);
            const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
            const hasData = matricula && a.status;
            console.log('DEBUG FILTRO:', {
                timestamp: a.timestamp,
                isToday,
                hasData,
                matricula: a.matricula
            });
            return isToday && hasData;
        });

        console.log('DEBUG STATS - Today attendances:', todayAttendances.length);

        const totalStudents = students.length;
        const presentRegistered = todayAttendances.filter(a => a.status === 'registered').length;
        const presentNotInList = 0; // Ya no se permite registro de no registrados
        const absent = totalStudents - presentRegistered;

        const stats = {
            totalStudents,
            presentRegistered,
            presentNotInList,
            absent,
            // totalPresent: presentRegistered + presentNotInList,
            totalPresent: presentRegistered,
            date: today
        };

        console.log('📊 Estadísticas calculadas:', stats);
        res.json(stats);
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error del servidor al obtener estadísticas' });
    }
});

// Obtener lista detallada (solo admin)
app.get('/api/admin/detailed-list', authenticateAdmin, async (req, res) => {
    try {
        console.log('📋 Generando lista detallada');
        const studentsRaw = await readCSV(STUDENTS_FILE);
        const students = studentsRaw.map(s => {
            // Buscar cualquier clave que contenga 'matricula'
            const matriculaKey = Object.keys(s).find(key => key.includes('matricula'));
            return {
                matricula: s.matricula || s[matriculaKey] || '',
                nombre: s.nombre || '',
                grupo: s.grupo || ''
            };
        }).filter(s => s.matricula && s.matricula.trim() !== '');

        const attendancesRaw = await readCSV(ATTENDANCE_FILE);
        // Debug: ver qué contiene attendance.csv
        console.log('DEBUG attendancesRaw:', attendancesRaw);
        console.log('DEBUG LISTA - AttendancesRaw antes del filtro:', attendancesRaw);
        const attendances = attendancesRaw.filter(a => {
            const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
            const hasMatricula = matricula && matricula.trim() !== '';
            const hasTimestamp = a.timestamp && a.timestamp.trim() !== '';
            console.log('DEBUG LISTA - Filtro:', { matricula: a.matricula, hasMatricula, hasTimestamp });
            return hasMatricula && hasTimestamp;
        });
        console.log('DEBUG LISTA - Attendances después del filtro:', attendances);

        // Debug: mostrar qué se está leyendo
        console.log(`DEBUG: ${students.length} estudiantes encontrados:`, students.slice(0, 3));
        console.log(`DEBUG: ${attendances.length} asistencias encontradas:`, attendances.slice(0, 3));
        
        const today = new Date().toISOString().split('T')[0];
        const todayAttendances = attendances.filter(a => {
            const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
            return a.timestamp && a.timestamp.startsWith(today) && matricula && a.status;
        });

        // Estudiantes que asistieron y están en lista
        const presentRegistered = todayAttendances
            .filter(a => a.status === 'registered')
            .map(a => {
                const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
                return {
                    matricula: matricula || 'N/A',
                    nombre: a.nombre || 'N/A',
                    grupo: (a.grupo || 'N/A').toUpperCase(),
                    timestamp: a.timestamp,
                    status: 'Presente (En lista)'
                };
            });

        // Ya no hay estudiantes que asistan sin estar en lista
        const presentNotInList = [];

        // Estudiantes ausentes - filtrar estudiantes válidos
        const validStudents = students.filter(s => s.matricula && s.matricula.trim() !== '');
        const presentMatriculas = todayAttendances
            .filter(a => {
                const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
                return matricula;
            })
            .map(a => {
                const matricula = a.matricula || a["'matricula'"] || a["\uFEFFmatricula"];
                return matricula.toUpperCase().trim();
            });
            
        const absent = validStudents
            .filter(s => {
                const matricula = s.matricula;
                return matricula && !presentMatriculas.includes(matricula.toUpperCase().trim());
            })
            .map(s => ({
                matricula: s.matricula || 'N/A',
                nombre: s.nombre || 'N/A',
                grupo: (s.grupo || 'N/A').toUpperCase(),
                timestamp: null,
                status: 'Ausente'
            }));

        const detailedList = {
            presentRegistered,
            presentNotInList,
            absent,
            date: today
        };

        console.log(`📋 Lista detallada: ${presentRegistered.length} presentes, ${presentNotInList.length} no en lista, ${absent.length} ausentes`);
        res.json(detailedList);
    } catch (error) {
        console.error('❌ Error obteniendo lista detallada:', error);
        res.status(500).json({ error: 'Error del servidor al obtener lista detallada' });
    }
});

// Cambiar contraseña de admin (solo admin)
app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
    try {
        console.log('🔐 Intento de cambio de contraseña');
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }
        
        const admins = await readCSV(ADMIN_FILE);
        const adminIndex = admins.findIndex(a => a.username === req.admin.username);
        
        if (adminIndex === -1) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // Verificar contraseña actual
        const isValidPassword = await bcrypt.compare(currentPassword, admins[adminIndex].password);
        if (!isValidPassword) {
            console.log(`⚠️ Contraseña actual incorrecta para: ${req.admin.username}`);
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }
        
        // Hashear nueva contraseña
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        
        // Actualizar contraseña
        admins[adminIndex].password = hashedNewPassword;
        
        await writeCSV(ADMIN_FILE, admins, [
            { id: 'username', title: 'username' },
            { id: 'password', title: 'password' }
        ]);
        
        console.log(`✅ Contraseña cambiada exitosamente para: ${req.admin.username}`);
        res.json({ success: true, message: 'Contraseña cambiada exitosamente' });
    } catch (error) {
        console.error('❌ Error cambiando contraseña:', error);
        res.status(500).json({ error: 'Error del servidor al cambiar contraseña' });
    }
});

// Subir lista de estudiantes (solo admin) - Formato simplificado
app.post('/api/admin/upload-students', authenticateAdmin, async (req, res) => {
    try {
        console.log('📤 Subiendo lista de estudiantes');
        const { students } = req.body;
        
        if (!students || !Array.isArray(students)) {
            return res.status(400).json({ error: 'Lista de estudiantes inválida' });
        }

        // Validar estudiantes - matricula, grado, nombre y grupo son obligatorios
        const validStudents = [];
        const errors = [];

        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            
            // Limpiar y normalizar datos
            const cleanStudent = {
                matricula: (student.matricula || '').toString().trim(),
                nombre: (student.nombre || '').toString().trim(), 
                grupo: (student.grupo || '').toString().trim()
            };
            
            // Usar cleanStudent en lugar de student para las validaciones
            if (!cleanStudent.matricula || cleanStudent.matricula === '') {
                errors.push(`Fila ${i + 1}: Matrícula es requerida`);
                continue;
            }
            
            if (!cleanStudent.nombre || cleanStudent.nombre === '') {
                errors.push(`Fila ${i + 1}: Nombre es requerido`);
                continue;
            }
            
            if (!cleanStudent.grupo || cleanStudent.grupo === '') {
                errors.push(`Fila ${i + 1}: Grupo es requerido`);
                continue;
            }
            
            validStudents.push(cleanStudent);
        }

            if (validStudents.length === 0) {
                return res.status(400).json({ 
                    error: 'No hay estudiantes válidos en la lista',
                    details: errors 
                });
            }
        
        await writeCSV(STUDENTS_FILE, validStudents, [
            { id: 'matricula', title: 'matricula' },
            { id: 'nombre', title: 'nombre' },
            { id: 'grupo', title: 'grupo' }
        ]);

        const message = `${validStudents.length} estudiantes cargados exitosamente`;
        if (errors.length > 0) {
            console.log(`⚠️ ${errors.length} errores encontrados durante la carga`);
        }

        // Reiniciar archivo de asistencias para borrón y cuenta nueva
        console.log('🔄 Reiniciando archivo de asistencias...');
        await writeAttendanceCSV(ATTENDANCE_FILE, [], [
            { id: 'matricula', title: 'matricula' },
            { id: 'nombre', title: 'nombre' },
            { id: 'grupo', title: 'grupo' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'status', title: 'status' }
        ]);
        console.log('✅ Asistencias reiniciadas - borrón y cuenta nueva');
        res.json({ 
            success: true, 
            message,
            validCount: validStudents.length,
            errorCount: errors.length,
            errors: errors.slice(0, 10) // Solo mostrar primeros 10 errores
        });
    } catch (error) {
        console.error('❌ Error subiendo estudiantes:', error);
        res.status(500).json({ error: 'Error del servidor al subir estudiantes' });
    }
});

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    console.log(`⚠️ Ruta no encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar y comenzar servidor
async function startServer() {
    try {
        await initializeFiles();
        
        // app.listen(PORT, () => {
        //     console.log('🚀 ================================');
        //     console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
        //     console.log(`🌐 Interfaz estudiantes: http://localhost:${PORT}`);
        //     console.log(`👤 Panel admin: http://localhost:${PORT}/admin`);
        //     console.log(`🔐 Usuario admin: admin / admin123`);
        //     console.log('🚀 ================================');
        // });
    app.listen(PORT, () => {
        console.log('🚀 ================================');
        console.log(`🪖 Sistema de Pase de Lista Militar`);
        console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🌐 URL local: http://localhost:${PORT}`);
            console.log(`👤 Panel admin: http://localhost:${PORT}/admin`);
        }
        console.log(`🔐 Usuario admin por defecto: admin / admin123`);
        console.log('🚀 ================================');
     });
    } catch (error) {
        console.error('❌ Error fatal al iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;