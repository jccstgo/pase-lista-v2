/**
 * Middleware de logging de requests
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Capturar información del request
    const requestInfo = {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date().toISOString()
    };
    
    // Log del request entrante
    console.log(`📥 ${requestInfo.method} ${requestInfo.url} - IP: ${requestInfo.ip}`);
    
    // Interceptar el final de la respuesta
    const originalEnd = res.end;
    
    res.end = function(...args) {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;
        
        // Determinar el emoji y nivel de log según el status
        let emoji = '✅';
        let logLevel = 'info';
        
        if (statusCode >= 400 && statusCode < 500) {
            emoji = '⚠️';
            logLevel = 'warn';
        } else if (statusCode >= 500) {
            emoji = '❌';
            logLevel = 'error';
        }
        
        // Log de la respuesta
        const responseInfo = {
            ...requestInfo,
            statusCode,
            duration,
            responseSize: res.getHeader('content-length') || 0
        };
        
        console.log(`${emoji} ${responseInfo.method} ${responseInfo.url} - ${statusCode} - ${duration}ms`);
        
        // Para desarrollo, mostrar más detalles en errores
        if (process.env.NODE_ENV === 'development' && statusCode >= 400) {
            console.log('   Details:', {
                ip: responseInfo.ip,
                userAgent: responseInfo.userAgent.substring(0, 50),
                body: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 200) : undefined
            });
        }
        
        // Llamar al método original
        originalEnd.apply(this, args);
    };
    
    next();
};

/**
 * Logger de actividad específica (para eventos importantes)
 */
const activityLogger = (action, details = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        ...details
    };
    
    console.log(`📋 Activity: ${action}`, details);
    
    // En un sistema más robusto, aquí guardaríamos en archivo o base de datos
    return logEntry;
};

/**
 * Logger de seguridad (para eventos relacionados con seguridad)
 */
const securityLogger = (event, details = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        securityEvent: event,
        severity: details.severity || 'medium',
        ...details
    };
    
    const emoji = details.severity === 'high' ? '🚨' : 
                  details.severity === 'medium' ? '⚠️' : 'ℹ️';
    
    console.log(`${emoji} Security: ${event}`, {
        severity: logEntry.severity,
        ip: details.ip,
        user: details.user,
        additional: details.additional
    });
    
    // En producción, estos eventos deberían ir a un sistema de monitoreo
    return logEntry;
};

/**
 * Logger de errores (para errores de aplicación)
 */
const errorLogger = (error, req = null, additional = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        request: req ? {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        } : null,
        ...additional
    };
    
    console.error('❌ Error:', logEntry.error.message);
    
    // En desarrollo, mostrar stack trace
    if (process.env.NODE_ENV === 'development') {
        console.error('   Stack:', logEntry.error.stack);
        if (logEntry.request) {
            console.error('   Request:', logEntry.request);
        }
    }
    
    return logEntry;
};

/**
 * Logger de performance (para operaciones que toman mucho tiempo)
 */
const performanceLogger = (operation, duration, details = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        operation,
        duration,
        ...details
    };
    
    let emoji = '⚡';
    let level = 'info';
    
    if (duration > 5000) { // Más de 5 segundos
        emoji = '🐌';
        level = 'warn';
    } else if (duration > 1000) { // Más de 1 segundo
        emoji = '⏰';
        level = 'info';
    }
    
    console.log(`${emoji} Performance: ${operation} took ${duration}ms`, details);
    
    return logEntry;
};

/**
 * Wrapper para medir tiempo de operaciones
 */
const timeOperation = async (operation, fn, details = {}) => {
    const start = Date.now();
    
    try {
        const result = await fn();
        const duration = Date.now() - start;
        
        performanceLogger(operation, duration, {
            success: true,
            ...details
        });
        
        return result;
    } catch (error) {
        const duration = Date.now() - start;
        
        performanceLogger(operation, duration, {
            success: false,
            error: error.message,
            ...details
        });
        
        throw error;
    }
};

/**
 * Logger de datos sensibles (para auditoría)
 */
const auditLogger = (action, user, resource, details = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        auditAction: action,
        user,
        resource,
        ...details
    };
    
    console.log(`📋 Audit: ${action} by ${user} on ${resource}`, details);
    
    // En un sistema real, esto iría a un log de auditoría inmutable
    return logEntry;
};

/**
 * Configurar niveles de log según el entorno
 */
const getLogLevel = () => {
    const level = process.env.LOG_LEVEL || 'info';
    
    const levels = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };
    
    return levels[level] || levels.info;
};

/**
 * Logger condicional según el nivel
 */
const conditionalLog = (level, message, data = {}) => {
    const currentLevel = getLogLevel();
    const messageLevels = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };
    
    if (messageLevels[level] <= currentLevel) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
    }
};

module.exports = {
    requestLogger,
    activityLogger,
    securityLogger,
    errorLogger,
    performanceLogger,
    timeOperation,
    auditLogger,
    conditionalLog,
    getLogLevel
};