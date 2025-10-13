/**
 * Middleware de headers de seguridad para producción
 */
const encabezadosSeguridad = (req, res, next) => {
    // Prevenir sniffing de MIME types
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevenir clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Habilitar protección XSS del navegador
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Política de referrer estricta
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Content Security Policy básico
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' https://cdnjs.cloudflare.com",
        "connect-src 'self'",
        "frame-ancestors 'none'"
    ].join('; '));
    
    // Strict Transport Security (solo HTTPS)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    // Permissions Policy (antigua Feature Policy)
    res.setHeader('Permissions-Policy', [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()'
    ].join(', '));
    
    // Remover header de servidor
    res.removeHeader('X-Powered-By');
    
    next();
};

/**
 * Middleware de rate limiting básico
 */
const mapaLimiteTasa = new Map();

const limiteTasa = (opciones = {}) => {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutos
        maxRequests = 100, // máximo 100 requests por ventana
        message = 'Demasiadas solicitudes desde esta IP'
    } = opciones;

    return (req, res, next) => {
        const llave = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();

        // Limpiar entradas antiguas
        const cutoff = now - windowMs;
        for (const [ip, data] of mapaLimiteTasa.entries()) {
            data.requests = data.requests.filter(time => time > cutoff);
            if (data.requests.length === 0) {
                mapaLimiteTasa.delete(ip);
            }
        }

        // Obtener o crear entrada para esta IP
        if (!mapaLimiteTasa.has(llave)) {
            mapaLimiteTasa.set(llave, { requests: [] });
        }

        const datosIp = mapaLimiteTasa.get(llave);

        // Filtrar requests dentro de la ventana
        datosIp.requests = datosIp.requests.filter(time => time > cutoff);

        // Verificar si excede el límite
        if (datosIp.requests.length >= maxRequests) {
            console.warn(`⚠️ Límite de solicitudes excedido para IP: ${llave}`);
            return res.status(429).json({
                success: false,
                error: message,
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        // Agregar este request
        datosIp.requests.push(now);

        // Headers informativos
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', maxRequests - datosIp.requests.length);
        res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

        next();
    };
};

/**
 * Rate limiting específico para login (más estricto)
 */
const limiteTasaInicioSesion = limiteTasa({
    windowMs: 15 * 60 * 1000, // 15 minutos
    maxRequests: 5, // máximo 5 intentos de login por IP
    message: 'Demasiados intentos de login desde esta IP. Intente nuevamente en 15 minutos.'
});

/**
 * Rate limiting para rutas de API (moderado)
 */
const limiteTasaApi = limiteTasa({
    windowMs: 1 * 60 * 1000, // 1 minuto
    maxRequests: 30, // 30 requests por minuto
    message: 'Demasiadas solicitudes a la API. Intente nuevamente en un momento.'
});

/**
 * Middleware de validación de IP
 */
const listaBlancaIp = (ipsPermitidas = []) => {
    return (req, res, next) => {
        if (ipsPermitidas.length === 0) {
            return next(); // Si no hay whitelist, permitir todo
        }

        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

        if (!ipsPermitidas.includes(clientIP)) {
            console.warn(`⚠️ Acceso denegado desde IP no autorizada: ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Acceso denegado desde esta dirección IP',
                code: 'IP_NOT_ALLOWED'
            });
        }
        
        next();
    };
};

/**
 * Middleware de detección de ataques básicos
 */
const deteccionAtaques = (req, res, next) => {
    const patronesSospechosos = [
        // SQL Injection patterns
        /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
        /(\b(or|and)\s+\d+\s*=\s*\d+)/i,
        /('|\"|;|--|\/\*|\*\/)/,
        
        // XSS patterns
        /(<script[^>]*>.*?<\/script>)/i,
        /(javascript:|vbscript:|onload=|onerror=)/i,
        /(<iframe|<object|<embed)/i,
        
        // Path traversal
        /(\.\.\/|\.\.\\)/,
        /(\/etc\/passwd|\/windows\/system32)/i,
        
        // Command injection
        /(\||&|;|\$\(|\`)/
    ];

    const verificarCadena = (valor) => {
        if (typeof valor !== 'string') return false;
        return patronesSospechosos.some(patron => patron.test(valor));
    };

    // Verificar parámetros de query
    for (const [clave, valor] of Object.entries(req.query || {})) {
        if (verificarCadena(clave) || verificarCadena(valor)) {
            console.warn(`⚠️ Patrón sospechoso detectado en query: ${clave}=${valor} - IP: ${req.ip}`);
            return res.status(400).json({
                success: false,
                error: 'Solicitud contiene datos sospechosos',
                code: 'SUSPICIOUS_REQUEST'
            });
        }
    }
    
    // Verificar body
    if (req.body) {
        const cuerpoCadena = JSON.stringify(req.body);
        if (verificarCadena(cuerpoCadena)) {
            console.warn(`⚠️ Patrón sospechoso detectado en body - IP: ${req.ip}`);
            return res.status(400).json({
                success: false,
                error: 'Solicitud contiene datos sospechosos',
                code: 'SUSPICIOUS_REQUEST'
            });
        }
    }

    // Verificar headers sospechosos
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.length > 1000 || verificarCadena(userAgent)) {
        console.warn(`⚠️ User-Agent sospechoso: ${userAgent.substring(0, 100)} - IP: ${req.ip}`);
        return res.status(400).json({
            success: false,
            error: 'Headers sospechosos detectados',
            code: 'SUSPICIOUS_HEADERS'
        });
    }
    
    next();
};

/**
 * Middleware de detección de bots básico
 */
const deteccionBots = (req, res, next) => {
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    
    const botsComunes = [
        'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python-requests',
        'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
        'yandexbot', 'facebookexternalhit', 'twitterbot'
    ];

    const esBot = botsComunes.some(patronBot => userAgent.includes(patronBot));

    if (esBot) {
        console.log(`🤖 Bot detectado: ${userAgent.substring(0, 50)} - IP: ${req.ip}`);

        // Para bots legítimos, permitir solo ciertas rutas
        const rutasPermitidasParaBots = ['/api/health', '/robots.txt', '/sitemap.xml'];
        const rutaPermitida = rutasPermitidasParaBots.some(ruta => req.path.startsWith(ruta));

        if (!rutaPermitida) {
            return res.status(403).json({
                success: false,
                error: 'Acceso de bots no permitido en esta ruta',
                code: 'BOT_ACCESS_DENIED'
            });
        }
    }
    
    next();
};

/**
 * Middleware de CORS personalizado para el sistema
 */
const manejadorCors = (req, res, next) => {
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://sistema-pase-lista.edu.mx' // Dominio de ejemplo
    ];
    
    const origin = req.headers.origin;
    
    // Permitir requests sin origin (como Postman, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas
    
    // Responder a preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    next();
};

module.exports = {
    encabezadosSeguridad,
    limiteTasa,
    limiteTasaInicioSesion,
    limiteTasaApi,
    listaBlancaIp,
    deteccionAtaques,
    deteccionBots,
    manejadorCors
};
