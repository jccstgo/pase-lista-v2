const { TextDecoder } = require('util');

const EXPRESION_ARTEFACTOS_CODIFICACION = /Ã.|Â./;
const CODIFICACIONES_A_PROBAR = ['utf-8', 'windows-1252', 'iso-8859-1', 'latin1'];

function tieneArtefactosCodificacion(texto) {
    if (!texto || typeof texto !== 'string') {
        return false;
    }

    return texto.includes('\uFFFD') || EXPRESION_ARTEFACTOS_CODIFICACION.test(texto);
}

function decodificarTexto(bytes, codificacion) {
    try {
        const decodificador = new TextDecoder(codificacion, { fatal: false });
        return decodificador.decode(bytes);
    } catch (error) {
        return null;
    }
}

function decodificarTextoPotencialmenteIncorrecto(valor) {
    if (!valor || typeof valor !== 'string') {
        return valor;
    }

    if (valor.includes('\uFFFD')) {
        return valor;
    }

    if (!tieneArtefactosCodificacion(valor)) {
        return valor;
    }

    const bytes = Uint8Array.from(Buffer.from(valor, 'binary'));

    for (const codificacion of CODIFICACIONES_A_PROBAR) {
        const decodificado = decodificarTexto(bytes, codificacion);
        if (decodificado && !tieneArtefactosCodificacion(decodificado)) {
            return decodificado;
        }
    }

    return valor;
}

function decodificarBufferATexto(buffer) {
    if (!buffer) {
        return '';
    }

    let bytes;

    if (buffer instanceof Uint8Array) {
        bytes = buffer;
    } else if (Buffer.isBuffer(buffer)) {
        bytes = new Uint8Array(buffer);
    } else {
        bytes = Uint8Array.from(buffer);
    }

    for (const codificacion of CODIFICACIONES_A_PROBAR) {
        const decodificado = decodificarTexto(bytes, codificacion);
        if (decodificado && !tieneArtefactosCodificacion(decodificado)) {
            return decodificado;
        }
    }

    const alternativa = decodificarTexto(bytes, 'utf-8');
    return alternativa || '';
}

module.exports = {
    tieneArtefactosCodificacion,
    decodificarTextoPotencialmenteIncorrecto,
    decodificarBufferATexto
};
