// ================================
// FUNCIONES DE DATOS Y RENDERIZADO
// ================================
let ultimaListaDetallada = null;
let filtroListaDetallada = '';
let valorBusquedaListaDetallada = '';

const ZONA_HORARIA_CDMX = 'America/Mexico_City';
const TIENE_INTL = typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function';
const FORMATEADOR_FECHA_LARGA_CDMX = TIENE_INTL
    ? new Intl.DateTimeFormat('es-MX', {
        timeZone: ZONA_HORARIA_CDMX,
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
    : null;
const FORMATEADOR_HORA_CDMX = TIENE_INTL
    ? new Intl.DateTimeFormat('es-MX', {
        timeZone: ZONA_HORARIA_CDMX,
        hour: '2-digit',
        minute: '2-digit'
    })
    : null;
const FORMATEADOR_HORA_SEGUNDOS_CDMX = TIENE_INTL
    ? new Intl.DateTimeFormat('es-MX', {
        timeZone: ZONA_HORARIA_CDMX,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })
    : null;
const FORMATEADOR_FECHA_ISO_CDMX = TIENE_INTL
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_HORARIA_CDMX,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
    : null;
const FORMATEADOR_FECHA_HORA_COMPLETA_CDMX = TIENE_INTL
    ? new Intl.DateTimeFormat('es-MX', {
        timeZone: ZONA_HORARIA_CDMX,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })
    : null;

function esFechaValida(fecha) {
    return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function crearFechaLocal(fechaValor) {
    if (!fechaValor) {
        return null;
    }

    if (fechaValor instanceof Date && esFechaValida(fechaValor)) {
        return new Date(fechaValor.getTime());
    }

    if (typeof fechaValor === 'string') {
        const coincidenciaISO = fechaValor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (coincidenciaISO) {
            const [, anio, mes, dia] = coincidenciaISO;
            const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia), 12));
            return esFechaValida(fecha) ? fecha : null;
        }
    }

    const fecha = new Date(fechaValor);
    return esFechaValida(fecha) ? fecha : null;
}

function formatearFechaMexico(fecha) {
    if (!esFechaValida(fecha)) {
        return null;
    }
    if (FORMATEADOR_FECHA_LARGA_CDMX) {
        return FORMATEADOR_FECHA_LARGA_CDMX.format(fecha);
    }
    return fecha.toLocaleDateString('es-MX');
}

function formatearHoraMexico(fecha, incluirSegundos = false) {
    if (!esFechaValida(fecha)) {
        return null;
    }
    const formateador = incluirSegundos ? FORMATEADOR_HORA_SEGUNDOS_CDMX : FORMATEADOR_HORA_CDMX;
    if (formateador) {
        return formateador.format(fecha);
    }
    return fecha.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        second: incluirSegundos ? '2-digit' : undefined
    });
}

function formatearFechaHoraMexico(fecha) {
    if (!esFechaValida(fecha)) {
        return null;
    }
    if (FORMATEADOR_FECHA_HORA_COMPLETA_CDMX) {
        return FORMATEADOR_FECHA_HORA_COMPLETA_CDMX.format(fecha);
    }
    return fecha.toLocaleString('es-MX');
}

function obtenerFechaISOMexico(fecha) {
    if (!esFechaValida(fecha)) {
        return null;
    }
    if (FORMATEADOR_FECHA_ISO_CDMX) {
        return FORMATEADOR_FECHA_ISO_CDMX.format(fecha);
    }
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function escaparHTML(texto) {
    const mapaCaracteres = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return String(texto ?? '').replace(/[&<>"']/g, caracter => mapaCaracteres[caracter] || caracter);
}

async function cargarPanelAdministrativo() {
    if (typeof tieneAccesoTecnico === 'function' && tieneAccesoTecnico()) {
        await cargarConfiguracionSistema();
    } else {
        configuracionSistema = {};
    }

    await cargarEstadisticas();
    await cargarListaDetallada();
    asegurarActualizacionEstadisticas();
}

async function cargarConfiguracionSistema() {
    if (!authToken) return;
    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        return;
    }

    try {
        const response = await fetch('/api/admin/config', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            configuracionSistema = await response.json();
            llenarFormularioRestricciones();
        } else if (response.status === 401) {
            cerrarSesion();
        } else if (response.status === 403) {
            mostrarMensaje('techAccessMessage', 'Tu sesión no tiene acceso técnico. Ingresa la contraseña técnica para continuar.', 'error');
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

async function cargarEstadisticas() {
    if (!authToken) return;

    const indicadorCargaResumen = document.getElementById('cargaResumen');
    if (indicadorCargaResumen) {
        indicadorCargaResumen.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar estadísticas');
        }

        const payload = await response.json();
        const estadisticas = payload?.data ?? payload ?? {};
        const totalEstudiantes = estadisticas.totalEstudiantes ?? estadisticas.totalStudents ?? 0;
        const presentesRegistrados = estadisticas.presentesRegistrados ?? estadisticas.presentRegistered ?? 0;
        const totalPresentes = estadisticas.totalPresentes ?? estadisticas.totalPresent ?? presentesRegistrados;
        document.getElementById('totalEstudiantes').textContent = totalEstudiantes;
        document.getElementById('presentesRegistrados').textContent = presentesRegistrados;
        const porcentajeAsistencia = totalEstudiantes > 0
            ? ((presentesRegistrados / totalEstudiantes) * 100).toFixed(1)
            : '0.0';
        document.getElementById('porcentajeAsistencia').textContent = `${porcentajeAsistencia}%`;
        document.getElementById('faltistas').textContent = estadisticas.faltistas ?? estadisticas.absent ?? '-';

        const contenedorResumen = document.getElementById('contenidoResumen');
        if (contenedorResumen) {
            const fechaValor = estadisticas.fecha ?? estadisticas.date ?? null;
            const fechaObjeto = crearFechaLocal(fechaValor) ?? new Date();
            const fechaFormateada = formatearFechaMexico(fechaObjeto) ?? fechaObjeto.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            contenedorResumen.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #2ecc71; margin-bottom: 10px;">✅ Asistencia Total</h3>
                        <p style="font-size: 24px; font-weight: bold;">${totalPresentes}</p>
                        <p style="color: #666; font-size: 14px;">${((totalPresentes / Math.max(totalEstudiantes || 1, 1)) * 100).toFixed(1)}% del total</p>
                    </div>
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #3498db; margin-bottom: 10px;">🛡️ Restricciones Activas</h3>
                        <p style="font-size: 16px;">
                            ${configuracionSistema.location_restriction_enabled === 'true' ? '📍 Ubicación ' : ''}
                            ${configuracionSistema.device_restriction_enabled === 'true' ? '📱 Dispositivo ' : ''}
                            ${configuracionSistema.admin_key_bypass_enabled === 'true' ? '🔑 Claves de supervisor ' : ''}
                            ${configuracionSistema.location_restriction_enabled !== 'true' && configuracionSistema.device_restriction_enabled !== 'true' && configuracionSistema.admin_key_bypass_enabled !== 'true' ? 'Ninguna' : ''}
                        </p>
                        <p style="color: #666; font-size: 12px;">Estado actual</p>
                    </div>
                    <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 10px;">
                        <p style="margin: 0;"><strong>Fecha:</strong> ${fechaFormateada}</p>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    } finally {
        if (indicadorCargaResumen) {
            indicadorCargaResumen.style.display = 'none';
        }
    }
}

async function cargarListaDetallada() {
    if (!authToken) return;

    const indicadorCargaDetalle = document.getElementById('cargaDetalle');
    if (indicadorCargaDetalle) {
        indicadorCargaDetalle.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/detailed-list', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar lista detallada');
        }

        const payload = await response.json();
        const informacionDetallada = payload?.data ?? payload ?? {};
        mostrarListaDetallada(informacionDetallada);
    } catch (error) {
        console.error('Error al cargar la lista detallada:', error);
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    } finally {
        if (indicadorCargaDetalle) {
            indicadorCargaDetalle.style.display = 'none';
        }
    }
}

function mostrarListaDetallada(datos) {
    ultimaListaDetallada = datos ?? {};
    valorBusquedaListaDetallada = filtroListaDetallada;
    renderizarListaDetallada();
}

function normalizarValorBusqueda(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    const texto = typeof valor === 'string' ? decodificarCaracteresEspeciales(valor) : valor;
    return String(texto).toLowerCase();
}

function filtrarRegistrosDetallados(registros, termino) {
    if (!Array.isArray(registros)) {
        return [];
    }

    const terminoNormalizado = termino.trim().toLowerCase();

    if (terminoNormalizado === '') {
        return registros;
    }

    return registros.filter(registro => {
        const campos = [registro.matricula, registro.nombre, registro.grupo, registro.status];
        return campos.some(campo => normalizarValorBusqueda(campo).includes(terminoNormalizado));
    });
}

function obtenerContextoListaDetallada() {
    const informacion = ultimaListaDetallada ?? {};
    const fechaValor = informacion?.fecha ?? informacion?.date ?? null;
    const fechaObjeto = crearFechaLocal(fechaValor) ?? (fechaValor ? null : new Date());
    const fechaValida = fechaObjeto instanceof Date && !Number.isNaN(fechaObjeto?.getTime?.());
    const fechaBase = fechaValida ? fechaObjeto : new Date();
    const fechaLegible = fechaValida
        ? (formatearFechaMexico(fechaObjeto) ?? fechaObjeto.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }))
        : 'Sin fecha disponible';
    const fechaISO = obtenerFechaISOMexico(fechaBase)
        ?? `${fechaBase.getFullYear()}-${String(fechaBase.getMonth() + 1).padStart(2, '0')}-${String(fechaBase.getDate()).padStart(2, '0')}`;

    const registrosPresentesOriginales = Array.isArray(informacion.presentesRegistrados ?? informacion.presentRegistered)
        ? (informacion.presentesRegistrados ?? informacion.presentRegistered)
        : [];
    const registrosFaltantesOriginales = Array.isArray(informacion.faltistas ?? informacion.absent)
        ? (informacion.faltistas ?? informacion.absent)
        : [];

    const filtroActual = (filtroListaDetallada || '').trim();
    const filtroEscapado = escaparHTML(filtroActual);
    const presentesFiltrados = filtrarRegistrosDetallados(registrosPresentesOriginales, filtroActual);
    const faltistasFiltrados = filtrarRegistrosDetallados(registrosFaltantesOriginales, filtroActual);

    const hayRegistrosOriginales = registrosPresentesOriginales.length > 0 || registrosFaltantesOriginales.length > 0;
    const hayCoincidencias = presentesFiltrados.length > 0 || faltistasFiltrados.length > 0;
    const totalCoincidencias = presentesFiltrados.length + faltistasFiltrados.length;

    return {
        informacion,
        fechaObjeto,
        fechaBase,
        fechaValida,
        fechaLegible,
        fechaISO,
        registrosPresentesOriginales,
        registrosFaltantesOriginales,
        presentesFiltrados,
        faltistasFiltrados,
        filtroActual,
        filtroEscapado,
        hayRegistrosOriginales,
        hayCoincidencias,
        totalCoincidencias,
        filtroActivo: filtroActual !== ''
    };
}

function renderizarListaDetallada() {
    const contenedor = document.getElementById('contenidoDetalle');
    if (!contenedor) return;

    const contexto = obtenerContextoListaDetallada();
    const {
        fechaLegible,
        fechaISO,
        registrosPresentesOriginales,
        registrosFaltantesOriginales,
        presentesFiltrados,
        faltistasFiltrados,
        filtroActual,
        filtroEscapado,
        hayRegistrosOriginales,
        hayCoincidencias,
        totalCoincidencias,
        filtroActivo
    } = contexto;

    let html = `
        <div class="detailed-list-header">
            <div>
                <h3 class="detailed-list-title">Fecha: ${fechaLegible}</h3>
                <p class="detailed-list-subtitle">Descarga archivos en PDF con los presentes y faltistas mostrados en esta sección.</p>
            </div>
            <div class="detailed-list-actions">
                <div class="detailed-list-search">
                    <label for="filtroListaDetallada">🔍 Buscar en la lista</label>
                    <div class="detailed-list-search-controls">
                        <input type="search" id="filtroListaDetallada" placeholder="Buscar por nombre o matrícula" autocomplete="off" spellcheck="false" />
                        <button type="button" id="aplicarFiltroListaDetalladaBtn" class="btn btn-primary detailed-list-search-button">Buscar</button>
                        <button type="button" id="limpiarFiltroListaDetalladaBtn" class="btn btn-light detailed-list-clear-button">Limpiar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (filtroActivo) {
        html += `<p class="detailed-list-filter-info">Mostrando ${totalCoincidencias} coincidencia(s) para "<strong>${filtroEscapado}</strong>".</p>`;
    }

    if (presentesFiltrados.length > 0) {
        html += `
            <div class="detailed-section-header detailed-section-header-presentes">
                <h3 class="detailed-section-title detailed-section-title-presentes">✅ Presentes — ${presentesFiltrados.length}</h3>
                <button
                    type="button"
                    class="detailed-section-download-button detailed-section-download-presentes"
                    id="descargarPresentesPDFBtn"
                    title="Descargar presentes en PDF"
                    aria-label="Descargar presentes en PDF"
                >⬇️</button>
            </div>
        `;
        html += crearTablaDetallada(presentesFiltrados);
    } else if (filtroActivo && registrosPresentesOriginales.length > 0) {
        html += '<p class="detailed-list-empty-section">No hay presentes que coincidan con la búsqueda.</p>';
    }

    if (faltistasFiltrados.length > 0) {
        html += `
            <div class="detailed-section-header detailed-section-header-faltistas">
                <h3 class="detailed-section-title detailed-section-title-faltistas">❌ Faltistas — ${faltistasFiltrados.length}</h3>
                <button
                    type="button"
                    class="detailed-section-download-button detailed-section-download-faltistas"
                    id="descargarFaltistasPDFBtn"
                    title="Descargar faltistas en PDF"
                    aria-label="Descargar faltistas en PDF"
                >⬇️</button>
            </div>
        `;
        html += crearTablaDetallada(faltistasFiltrados);
    } else if (filtroActivo && registrosFaltantesOriginales.length > 0) {
        html += '<p class="detailed-list-empty-section">No hay faltistas que coincidan con la búsqueda.</p>';
    }

    if (!hayRegistrosOriginales) {
        html += '<p>No hay registros disponibles para la fecha seleccionada.</p>';
    } else if (filtroActivo && !hayCoincidencias) {
        html += `<p class="detailed-list-empty-results">No se encontraron coincidencias para "<strong>${filtroEscapado}</strong>".</p>`;
    }

    contenedor.innerHTML = html;

    const botonDescargaGeneral = document.getElementById('descargarListaDetalladaBtn');
    if (botonDescargaGeneral) {
        if (!botonDescargaGeneral.dataset.listenerAsignado) {
            botonDescargaGeneral.addEventListener('click', descargarListaDetallada);
            botonDescargaGeneral.dataset.listenerAsignado = 'true';
        }
        if (!hayRegistrosOriginales) {
            botonDescargaGeneral.disabled = true;
            botonDescargaGeneral.title = 'No hay registros para descargar.';
        } else {
            botonDescargaGeneral.disabled = false;
            botonDescargaGeneral.title = 'Descargar archivo con presentes y faltistas.';
        }
    }

    const botonDescargaPresentes = document.getElementById('descargarPresentesPDFBtn');
    if (botonDescargaPresentes) {
        botonDescargaPresentes.addEventListener('click', () => {
            descargarRegistrosEnPDF(presentesFiltrados, {
                titulo: 'Presentes (En Lista)',
                prefijoArchivo: 'presentes',
                fechaLegible,
                fechaISO,
                filtro: filtroActual
            });
        });
    }

    const botonDescargaFaltistas = document.getElementById('descargarFaltistasPDFBtn');
    if (botonDescargaFaltistas) {
        botonDescargaFaltistas.addEventListener('click', () => {
            descargarRegistrosEnPDF(faltistasFiltrados, {
                titulo: 'Faltistas',
                prefijoArchivo: 'faltistas',
                fechaLegible,
                fechaISO,
                filtro: filtroActual
            });
        });
    }

    const campoBusqueda = document.getElementById('filtroListaDetallada');
    if (campoBusqueda) {
        campoBusqueda.value = valorBusquedaListaDetallada;
        campoBusqueda.addEventListener('input', event => {
            valorBusquedaListaDetallada = event.target.value;
        });
        campoBusqueda.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                aplicarFiltroListaDetallada();
            }
        });
    }

    const botonAplicarFiltro = document.getElementById('aplicarFiltroListaDetalladaBtn');
    if (botonAplicarFiltro) {
        botonAplicarFiltro.addEventListener('click', aplicarFiltroListaDetallada);
    }

    const botonLimpiarFiltro = document.getElementById('limpiarFiltroListaDetalladaBtn');
    if (botonLimpiarFiltro) {
        botonLimpiarFiltro.addEventListener('click', limpiarFiltroListaDetallada);
        botonLimpiarFiltro.disabled = !filtroActivo && valorBusquedaListaDetallada.trim() === '';
    }
}

function aplicarFiltroListaDetallada() {
    const nuevoFiltro = (valorBusquedaListaDetallada || '').trim();
    filtroListaDetallada = nuevoFiltro;
    valorBusquedaListaDetallada = nuevoFiltro;
    renderizarListaDetallada();
}

function limpiarFiltroListaDetallada() {
    filtroListaDetallada = '';
    valorBusquedaListaDetallada = '';
    renderizarListaDetallada();
    const campoBusqueda = document.getElementById('filtroListaDetallada');
    if (campoBusqueda) {
        campoBusqueda.focus();
    }
}

function crearTablaDetallada(registros) {
    if (!registros || registros.length === 0) {
        return '<p>No hay registros</p>';
    }

    let html = '<div class="table-container"><table><thead><tr>';
    html += '<th>Matrícula</th><th>Nombre</th><th>Grupo</th><th>Estado</th><th>Hora</th><th>Ubicación</th><th>Dispositivo</th>';
    html += '</tr></thead><tbody>';

    registros.forEach(registro => {
        const claseEstado = registro.status?.includes('Presente') ? 'status-present' : 'status-absent';
        const fechaRegistro = registro.timestamp ? new Date(registro.timestamp) : null;
        const horaFormateada = fechaRegistro
            ? (formatearHoraMexico(fechaRegistro) ?? fechaRegistro.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))
            : '-';

        html += `
            <tr>
                <td>${registro.matricula || '-'}</td>
                <td>${decodificarCaracteresEspeciales(registro.nombre || '-')}</td>
                <td>${decodificarCaracteresEspeciales((registro.grupo || '-')).toUpperCase()}</td>
                <td><span class="status-badge ${claseEstado}">${registro.status || '-'}</span></td>
                <td>${horaFormateada}</td>
                <td style="font-size: 12px;">${registro.location || 'N/D'}</td>
                <td style="font-size: 12px; font-family: monospace;">${registro.device || 'N/D'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    return html;
}

function obtenerTextoPlano(valor, opciones = {}) {
    const { uppercase = false, fallback = '-' } = opciones;
    if (valor === null || valor === undefined) {
        return fallback;
    }

    let texto = typeof valor === 'string' ? valor : String(valor);
    if (typeof decodificarCaracteresEspeciales === 'function') {
        texto = decodificarCaracteresEspeciales(texto);
    }

    texto = texto.replace(/\s+/g, ' ').trim();

    if (texto === '') {
        return fallback;
    }

    return uppercase ? texto.toUpperCase() : texto;
}

function prepararTablaPDF(registros) {
    if (!Array.isArray(registros) || registros.length === 0) {
        return null;
    }

    const columnas = [
        { header: 'Matrícula', dataKey: 'matricula' },
        { header: 'Nombre completo', dataKey: 'nombre' },
        { header: 'Grupo', dataKey: 'grupo' },
        { header: 'Estado', dataKey: 'estado' },
        { header: 'Hora de registro', dataKey: 'hora' },
        { header: 'Ubicación', dataKey: 'ubicacion' },
        { header: 'Dispositivo', dataKey: 'dispositivo' }
    ];

    const filas = registros.map(registro => {
        const fechaRegistro = registro?.timestamp ? new Date(registro.timestamp) : null;
        const horaFormateada = fechaRegistro
            ? (formatearFechaHoraMexico(fechaRegistro) || fechaRegistro.toLocaleString('es-MX'))
            : '-';

        return {
            matricula: obtenerTextoPlano(registro?.matricula, { fallback: '-' }),
            nombre: obtenerTextoPlano(registro?.nombre || '-', { fallback: '-' }),
            grupo: obtenerTextoPlano(registro?.grupo || '-', { uppercase: true, fallback: '-' }),
            estado: obtenerTextoPlano(registro?.status || '-', { fallback: '-' }),
            hora: obtenerTextoPlano(horaFormateada, { fallback: '-' }),
            ubicacion: obtenerTextoPlano(registro?.location ?? 'N/D', { fallback: 'N/D' }),
            dispositivo: obtenerTextoPlano(registro?.device ?? 'N/D', { fallback: 'N/D' })
        };
    });

    return { columnas, filas };
}

function generarPDFTablaEjecutiva({ titulo, subtitulo, columnas, filas }) {
    const namespaceJsPDF = typeof window !== 'undefined' ? window.jspdf : null;
    const ConstructorJsPDF = namespaceJsPDF && typeof namespaceJsPDF.jsPDF === 'function'
        ? namespaceJsPDF.jsPDF
        : null;

    if (!ConstructorJsPDF) {
        console.warn('No se pudo cargar jsPDF.');
        return null;
    }

    const doc = new ConstructorJsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        console.warn('La extensión autoTable de jsPDF no está disponible.');
        return null;
    }
    const margenHorizontal = 48;
    const posicionTitulo = 56;
    const espacioTrasTitulo = subtitulo ? 24 : 16;
    const inicioTabla = posicionTitulo + espacioTrasTitulo + 24;
    const totalPagesExp = '{total_pages_count_string}';
    const fechaGeneracion = formatearFechaHoraMexico(new Date()) || new Date().toLocaleString('es-MX');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(28, 69, 135);
    doc.text(titulo, margenHorizontal, posicionTitulo, { baseline: 'alphabetic' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(60);
    if (subtitulo) {
        doc.text(subtitulo, margenHorizontal, posicionTitulo + 20, { baseline: 'alphabetic' });
    }

    const columnStyles = {
        matricula: { cellWidth: 80 },
        nombre: { cellWidth: 160 },
        grupo: { cellWidth: 70 },
        estado: { cellWidth: 90 },
        hora: { cellWidth: 120 },
        ubicacion: { cellWidth: 140 },
        dispositivo: { cellWidth: 120 }
    };

    doc.autoTable({
        columns,
        body: filas,
        startY: inicioTabla,
        styles: {
            font: 'helvetica',
            fontSize: 10,
            textColor: 40,
            cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: [28, 69, 135],
            textColor: 255,
            fontSize: 11,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle'
        },
        alternateRowStyles: {
            fillColor: [245, 248, 255]
        },
        columnStyles,
        margin: { top: posicionTitulo, right: margenHorizontal, bottom: 60, left: margenHorizontal },
        didDrawPage: data => {
            const { pageNumber, settings } = data;
            const pagina = typeof doc.putTotalPages === 'function'
                ? `Página ${pageNumber} de ${totalPagesExp}`
                : `Página ${pageNumber}`;
            const altoPagina = doc.internal.pageSize.getHeight();
            const anchoPagina = doc.internal.pageSize.getWidth();
            const posicionFooterY = altoPagina - 30;

            doc.setFontSize(9);
            doc.setTextColor(90);
            doc.text(`Generado: ${fechaGeneracion}`, settings.margin.left, posicionFooterY, { baseline: 'alphabetic' });
            doc.text(pagina, anchoPagina - settings.margin.right, posicionFooterY, { align: 'right', baseline: 'alphabetic' });
        }
    });

    if (typeof doc.putTotalPages === 'function') {
        doc.putTotalPages(totalPagesExp);
    }

    let contenidoPDF;
    try {
        contenidoPDF = doc.output('arraybuffer');
    } catch (error) {
        console.error('Error al generar la salida del PDF:', error);
        return null;
    }

    if (!contenidoPDF) {
        console.warn('La salida del PDF está vacía.');
        return null;
    }

    if (contenidoPDF && typeof contenidoPDF.then === 'function') {
        return contenidoPDF
            .then(buffer => new Blob([buffer], { type: 'application/pdf' }))
            .catch(error => {
                console.error('Error al resolver la generación del PDF:', error);
                return null;
            });
    }

    return new Blob([contenidoPDF], { type: 'application/pdf' });
}

function normalizarTextoParaArchivo(texto) {
    if (!texto) {
        return '';
    }

    return texto
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .toLowerCase();
}

function descargarBlobComoArchivo(blob, nombreArchivo) {
    if (!(blob instanceof Blob)) {
        return;
    }

    const url = URL.createObjectURL(blob);
    const enlaceDescarga = document.createElement('a');
    enlaceDescarga.href = url;
    enlaceDescarga.download = nombreArchivo;
    document.body.appendChild(enlaceDescarga);
    enlaceDescarga.click();
    document.body.removeChild(enlaceDescarga);
    URL.revokeObjectURL(url);
}

async function descargarRegistrosEnPDF(registros, opciones = {}) {
    const lista = Array.isArray(registros) ? registros : [];
    if (lista.length === 0) {
        return;
    }

    const {
        titulo = 'Registros',
        prefijoArchivo = 'registros',
        fechaLegible,
        fechaISO,
        filtro
    } = opciones;

    const tabla = prepararTablaPDF(lista);
    if (!tabla) {
        return;
    }

    const partesSubtitulo = [];
    if (fechaLegible) {
        partesSubtitulo.push(`Fecha: ${fechaLegible}`);
    }

    partesSubtitulo.push(`Registros: ${lista.length}`);

    if (filtro && filtro.trim() !== '') {
        partesSubtitulo.push(`Filtro: "${filtro.trim()}"`);
    }

    const subtitulo = partesSubtitulo.join(' — ');
    const blobPDF = await Promise.resolve(generarPDFTablaEjecutiva({
        titulo,
        subtitulo,
        columnas: tabla.columnas,
        filas: tabla.filas
    }));

    if (!blobPDF) {
        console.warn('No se pudo generar el archivo PDF.');
        return;
    }

    if (!(blobPDF instanceof Blob)) {
        console.warn('La generación del PDF no devolvió un Blob válido.');
        return;
    }

    const fechaParaArchivo = fechaISO || new Date().toISOString().split('T')[0];
    const sufijoFiltro = filtro ? normalizarTextoParaArchivo(filtro) : '';
    const nombreArchivo = `${prefijoArchivo}-${fechaParaArchivo}${sufijoFiltro ? `-${sufijoFiltro}` : ''}.pdf`;

    descargarBlobComoArchivo(blobPDF, nombreArchivo);
}

function prepararCampoCSV(valor) {
    if (valor === null || valor === undefined) {
        return '""';
    }

    const texto = String(valor).replace(/\r?\n|\r/g, ' ').trim();
    const escapado = texto.replace(/"/g, '""');
    return `"${escapado}"`;
}

function descargarListaDetallada() {
    if (!ultimaListaDetallada) {
        return;
    }

    const contexto = obtenerContextoListaDetallada();
    const registrosPresentes = contexto.registrosPresentesOriginales ?? [];
    const registrosFaltantes = contexto.registrosFaltantesOriginales ?? [];
    const fechaISO = contexto.fechaISO ?? new Date().toISOString().split('T')[0];

    const lineas = [];
    lineas.push('Tipo,Matrícula,Nombre,Grupo,Estado,Hora,Ubicación,Dispositivo');

    const agregarRegistros = (registros, tipo) => {
        registros.forEach(registro => {
            const fechaRegistro = registro.timestamp ? new Date(registro.timestamp) : null;
            const horaFormateada = fechaRegistro
                ? (formatearHoraMexico(fechaRegistro, true)
                    ?? fechaRegistro.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
                : '';
            const fila = [
                prepararCampoCSV(tipo),
                prepararCampoCSV(registro.matricula || ''),
                prepararCampoCSV(decodificarCaracteresEspeciales(registro.nombre || '')),
                prepararCampoCSV(decodificarCaracteresEspeciales((registro.grupo || '')).toUpperCase()),
                prepararCampoCSV(registro.status || ''),
                prepararCampoCSV(horaFormateada),
                prepararCampoCSV(registro.location || ''),
                prepararCampoCSV(registro.device || '')
            ].join(',');
            lineas.push(fila);
        });
    };

    if (registrosPresentes.length > 0) {
        agregarRegistros(registrosPresentes, 'Presente');
    }

    if (registrosFaltantes.length > 0) {
        agregarRegistros(registrosFaltantes, 'Faltista');
    }

    const contenido = lineas.join('\n');
    const blob = new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8;' });
    descargarBlobComoArchivo(blob, `lista-detallada-${fechaISO}.csv`);
}

async function cargarDispositivos() {
    if (!authToken) return;
    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Acceso técnico requerido para consultar dispositivos.', 'error');
        return;
    }

    const indicadorDispositivos = document.getElementById('cargaDispositivos');
    if (indicadorDispositivos) {
        indicadorDispositivos.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/devices', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 403) {
                mostrarMensaje('techAccessMessage', 'Tu sesión no cuenta con acceso técnico para ver los dispositivos.', 'error');
                return;
            }
            throw new Error('Error al cargar dispositivos');
        }

        const dispositivos = await response.json();
        mostrarDispositivos(dispositivos);
    } catch (error) {
        console.error('Error al cargar dispositivos:', error);
        const contenedor = document.getElementById('devicesContent');
        if (contenedor) {
            contenedor.innerHTML = '<p style="color: #e74c3c;">Error cargando dispositivos</p>';
        }
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    } finally {
        if (indicadorDispositivos) {
            indicadorDispositivos.style.display = 'none';
        }
    }
}

function mostrarDispositivos(dispositivos) {
    const contenedor = document.getElementById('devicesContent');
    if (!contenedor) return;

    if (!dispositivos || dispositivos.length === 0) {
        contenedor.innerHTML = '<p>No hay dispositivos registrados</p>';
        return;
    }

    let html = '<div class="table-container"><table><thead><tr>';
    html += '<th>Huella Digital</th><th>Matrícula</th><th>Primer Registro</th><th>Último Uso</th><th>Navegador</th>';
    html += '</tr></thead><tbody>';

    dispositivos.forEach(dispositivo => {
        const primerRegistroFecha = dispositivo.first_registration ? new Date(dispositivo.first_registration) : null;
        const ultimoUsoFecha = dispositivo.last_used ? new Date(dispositivo.last_used) : null;
        const primerRegistro = primerRegistroFecha
            ? (formatearFechaHoraMexico(primerRegistroFecha) ?? primerRegistroFecha.toLocaleString('es-MX'))
            : '-';
        const ultimoUso = ultimoUsoFecha
            ? (formatearFechaHoraMexico(ultimoUsoFecha) ?? ultimoUsoFecha.toLocaleString('es-MX'))
            : '-';

        html += `
            <tr>
                <td style="font-family: monospace; font-size: 12px;">${dispositivo.device_fingerprint}</td>
                <td><strong>${dispositivo.matricula}</strong></td>
                <td>${primerRegistro}</td>
                <td>${ultimoUso}</td>
                <td style="font-size: 12px;">${dispositivo.user_agent || 'Desconocido'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    contenedor.innerHTML = html;
}

async function cargarClavesAdministrativas() {
    if (!authToken) return;
    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Acceso técnico requerido para gestionar claves administrativas.', 'error');
        return;
    }

    const contenedor = document.getElementById('adminKeysList');
    if (contenedor) {
        contenedor.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Cargando claves administrativas...</p>
            </div>
        `;
    }

    try {
        const response = await fetch('/api/admin/admin-keys', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 403) {
                mostrarMensaje('techAccessMessage', 'Tu sesión no cuenta con acceso técnico para ver las claves.', 'error');
                return;
            }
            throw new Error('Error al cargar claves administrativas');
        }

        const claves = await response.json();
        mostrarClavesAdministrativas(claves);
    } catch (error) {
        console.error('Error al cargar claves administrativas:', error);
        if (contenedor) {
            contenedor.innerHTML = '<p style="color: #e74c3c;">Error cargando claves administrativas</p>';
        }
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    }
}

function mostrarClavesAdministrativas(claves) {
    const contenedor = document.getElementById('adminKeysList');
    if (!contenedor) return;

    if (!claves || claves.length === 0) {
        contenedor.innerHTML = '<p>No hay claves administrativas configuradas</p>';
        return;
    }

    let html = '';
    claves.forEach(clave => {
        const activa = clave.is_active === 'true';
        const fechaCreacionFecha = clave.created_at ? new Date(clave.created_at) : null;
        const fechaCreacion = fechaCreacionFecha
            ? (formatearFechaMexico(fechaCreacionFecha) ?? fechaCreacionFecha.toLocaleDateString('es-MX'))
            : '-';

        html += `
            <div class="admin-key-item ${activa ? '' : 'inactive'}">
                <div class="admin-key-info">
                    <div style="font-weight: bold; font-family: monospace;">${clave.key}</div>
                    <div style="color: #666; font-size: 14px;">${decodificarCaracteresEspeciales(clave.description || '')}</div>
                    <div style="color: #999; font-size: 12px;">Creada: ${fechaCreacion} | Estado: ${activa ? '✅ Activa' : '❌ Inactiva'}</div>
                </div>
                <div class="admin-key-actions">
                    ${activa
                        ? `<button class="btn btn-danger btn-small" onclick="desactivarClaveAdministrativa('${clave.key}')">Desactivar</button>`
                        : '<span style="color: #999;">Inactiva</span>'}
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

// Exponer funciones necesarias globalmente
window.cargarPanelAdministrativo = cargarPanelAdministrativo;
window.cargarConfiguracionSistema = cargarConfiguracionSistema;
window.cargarEstadisticas = cargarEstadisticas;
window.cargarListaDetallada = cargarListaDetallada;
window.cargarDispositivos = cargarDispositivos;
window.cargarClavesAdministrativas = cargarClavesAdministrativas;
window.mostrarClavesAdministrativas = mostrarClavesAdministrativas;
window.loadDashboard = cargarPanelAdministrativo;
window.loadSystemConfig = cargarConfiguracionSistema;
window.loadStats = cargarEstadisticas;
window.loadDetailedList = cargarListaDetallada;
window.loadDevices = cargarDispositivos;
window.loadAdminKeys = cargarClavesAdministrativas;
window.displayAdminKeys = mostrarClavesAdministrativas;
window.descargarListaDetallada = descargarListaDetallada;
