/**
 * Middleware de registro de solicitudes HTTP.
 */
const registradorSolicitudes = (req, res, next) => {
    const inicio = Date.now();

    const infoSolicitud = {
        metodo: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress || 'desconocida',
        agenteUsuario: req.headers['user-agent'] || 'desconocido',
        marcaTiempo: new Date().toISOString()
    };

    console.log(`📥 ${infoSolicitud.metodo} ${infoSolicitud.url} - IP: ${infoSolicitud.ip}`);

    const finOriginal = res.end;

    res.end = function(...args) {
        const duracion = Date.now() - inicio;
        const codigoEstado = res.statusCode;

    let emoji = '✅';

    if (codigoEstado >= 400 && codigoEstado < 500) {
        emoji = '⚠️';
    } else if (codigoEstado >= 500) {
        emoji = '❌';
    }

        const infoRespuesta = {
            ...infoSolicitud,
            codigoEstado,
            duracion,
            tamanoRespuesta: res.getHeader('content-length') || 0
        };

        console.log(`${emoji} ${infoRespuesta.metodo} ${infoRespuesta.url} - ${codigoEstado} - ${duracion}ms`);

        if (process.env.NODE_ENV === 'development' && codigoEstado >= 400) {
            console.log('   Detalles:', {
                ip: infoRespuesta.ip,
                agenteUsuario: infoRespuesta.agenteUsuario.substring(0, 50),
                cuerpo: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 200) : undefined
            });
        }

        finOriginal.apply(this, args);
    };

    next();
};

/**
 * Registro de actividades relevantes del sistema.
 */
const registradorActividades = (accion, detalles = {}) => {
    const registro = {
        marcaTiempo: new Date().toISOString(),
        accion,
        ...detalles
    };

    console.log(`📋 Actividad: ${accion}`, detalles);
    return registro;
};

/**
 * Registro de eventos de seguridad.
 */
const registradorSeguridad = (evento, detalles = {}) => {
    const registro = {
        marcaTiempo: new Date().toISOString(),
        eventoSeguridad: evento,
        severidad: detalles.severidad || 'media',
        ...detalles
    };

    const emoji = detalles.severidad === 'alta' ? '🚨' :
                  detalles.severidad === 'media' ? '⚠️' : 'ℹ️';

    console.log(`${emoji} Seguridad: ${evento}`, {
        severidad: registro.severidad,
        ip: detalles.ip,
        usuario: detalles.user,
        adicional: detalles.additional
    });

    return registro;
};

/**
 * Registro de errores de la aplicación.
 */
const registradorErrores = (error, req = null, adicionales = {}) => {
    const registro = {
        marcaTiempo: new Date().toISOString(),
        error: {
            nombre: error.name,
            mensaje: error.message,
            pila: error.stack
        },
        solicitud: req ? {
            metodo: req.method,
            url: req.originalUrl,
            ip: req.ip,
            agenteUsuario: req.headers['user-agent']
        } : null,
        ...adicionales
    };

    console.error('❌ Error:', registro.error.mensaje);

    if (process.env.NODE_ENV === 'development') {
        console.error('   Pila:', registro.error.pila);
        if (registro.solicitud) {
            console.error('   Solicitud:', registro.solicitud);
        }
    }

    return registro;
};

/**
 * Registro de rendimiento para operaciones costosas.
 */
const registradorRendimiento = (operacion, duracion, detalles = {}) => {
    const registro = {
        marcaTiempo: new Date().toISOString(),
        operacion,
        duracion,
        ...detalles
    };

    let emoji = '⚡';

    if (duracion > 5000) {
        emoji = '🐌';
    } else if (duracion > 1000) {
        emoji = '⏰';
    }

    console.log(`${emoji} Rendimiento: ${operacion} tomó ${duracion}ms`, detalles);

    return registro;
};

/**
 * Envuelve una operación para medir su duración.
 */
const temporizadorOperacion = async (operacion, fn, detalles = {}) => {
    const inicio = Date.now();

    try {
        const resultado = await fn();
        const duracion = Date.now() - inicio;

        registradorRendimiento(operacion, duracion, {
            exito: true,
            ...detalles
        });

        return resultado;
    } catch (error) {
        const duracion = Date.now() - inicio;

        registradorRendimiento(operacion, duracion, {
            exito: false,
            error: error.message,
            ...detalles
        });

        throw error;
    }
};

/**
 * Registro de auditoría para acciones sensibles.
 */
const registradorAuditoria = (accion, usuario, recurso, detalles = {}) => {
    const registro = {
        marcaTiempo: new Date().toISOString(),
        accionAuditoria: accion,
        usuario,
        recurso,
        ...detalles
    };

    console.log(`📋 Auditoría: ${accion} por ${usuario} en ${recurso}`, detalles);

    return registro;
};

/**
 * Determina el nivel de registro permitido según la configuración.
 */
const obtenerNivelRegistro = () => {
    const nivel = process.env.LOG_LEVEL || 'info';

    const niveles = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };

    return niveles[nivel] || niveles.info;
};

/**
 * Realiza un registro condicional en función del nivel permitido.
 */
const registroCondicional = (nivel, mensaje, datos = {}) => {
    const nivelActual = obtenerNivelRegistro();
    const nivelesMensaje = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };

    if (nivelesMensaje[nivel] <= nivelActual) {
        const marcaTiempo = new Date().toISOString();
        console.log(`[${marcaTiempo}] [${nivel.toUpperCase()}] ${mensaje}`, datos);
    }
};

module.exports = {
    registradorSolicitudes,
    registradorActividades,
    registradorSeguridad,
    registradorErrores,
    registradorRendimiento,
    temporizadorOperacion,
    registradorAuditoria,
    registroCondicional,
    obtenerNivelRegistro
};
