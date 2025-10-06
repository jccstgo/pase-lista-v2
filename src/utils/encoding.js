const { TextDecoder } = require('util');

const ENCODING_ARTIFACT_REGEX = /Ã.|Â./;
const ENCODINGS_TO_TRY = ['utf-8', 'windows-1252', 'iso-8859-1', 'latin1'];

function hasEncodingArtifacts(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    return text.includes('\uFFFD') || ENCODING_ARTIFACT_REGEX.test(text);
}

function decodeText(bytes, encoding) {
    try {
        const decoder = new TextDecoder(encoding, { fatal: false });
        return decoder.decode(bytes);
    } catch (error) {
        return null;
    }
}

function decodePotentiallyMisencodedText(value) {
    if (!value || typeof value !== 'string') {
        return value;
    }

    if (value.includes('\uFFFD')) {
        return value;
    }

    if (!hasEncodingArtifacts(value)) {
        return value;
    }

    const bytes = Uint8Array.from(Buffer.from(value, 'binary'));

    for (const encoding of ENCODINGS_TO_TRY) {
        const decoded = decodeText(bytes, encoding);
        if (decoded && !hasEncodingArtifacts(decoded)) {
            return decoded;
        }
    }

    return value;
}

function decodeBufferToText(buffer) {
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

    for (const encoding of ENCODINGS_TO_TRY) {
        const decoded = decodeText(bytes, encoding);
        if (decoded && !hasEncodingArtifacts(decoded)) {
            return decoded;
        }
    }

    const fallback = decodeText(bytes, 'utf-8');
    return fallback || '';
}

module.exports = {
    hasEncodingArtifacts,
    decodePotentiallyMisencodedText,
    decodeBufferToText
};
