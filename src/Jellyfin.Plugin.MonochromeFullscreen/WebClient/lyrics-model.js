const TRACK_TYPES = new Set(['main', 'translation', 'phonetic', 'other']);

function value(object, ...names) {
    if (!object || typeof object !== 'object') return undefined;
    for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(object, name)) return object[name];
    }
    return undefined;
}

export function safeString(input, fallback = '') {
    return typeof input === 'string' ? input.replaceAll('\0', '') : fallback;
}

function optionalString(input) {
    const text = safeString(input).trim();
    return text || null;
}

function ticks(input) {
    const number = typeof input === 'number' ? input : Number(input);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function strings(input) {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.map(item => optionalString(item)).filter(Boolean))];
}

function normalizePart(raw, lineStart, index) {
    if (!raw || typeof raw !== 'object') return null;
    const rawText = value(raw, 'Text', 'text', 'Value', 'value');
    const text = safeString(rawText);
    const startTicks = ticks(value(raw, 'StartTicks', 'startTicks', 'StartTimeTicks', 'startTimeTicks', 'Start', 'start', 'OffsetTicks', 'offsetTicks'));
    const endTicks = ticks(value(raw, 'EndTicks', 'endTicks', 'EndTimeTicks', 'endTimeTicks', 'End', 'end'));
    if (typeof rawText !== 'string' && startTicks === null && endTicks === null) return null;
    return {
        text,
        startTicks: startTicks ?? (index === 0 ? lineStart : null),
        endTicks,
        background: Boolean(value(raw, 'Background', 'background', 'IsBackground', 'isBackground'))
    };
}

function finishParts(parts, lineStart, lineEnd) {
    const sorted = parts
        .map((part, order) => ({ ...part, _order: order }))
        .sort((a, b) => (a.startTicks ?? Number.MAX_SAFE_INTEGER) - (b.startTicks ?? Number.MAX_SAFE_INTEGER) || a._order - b._order);

    for (let index = 0; index < sorted.length; index++) {
        const part = sorted[index];
        const previous = sorted[index - 1];
        if (part.startTicks === null) part.startTicks = previous?.endTicks ?? previous?.startTicks ?? lineStart;
        const nextStart = sorted[index + 1]?.startTicks;
        if (part.endTicks === null || part.endTicks < part.startTicks) {
            part.endTicks = nextStart !== null && nextStart !== undefined && nextStart >= part.startTicks
                ? nextStart
                : Math.max(part.startTicks, lineEnd);
        }
        delete part._order;
    }
    return sorted;
}

function normalizeLine(raw, trackIndex, lineIndex) {
    if (typeof raw === 'string') raw = { Text: raw };
    if (!raw || typeof raw !== 'object') return null;

    const rawText = value(raw, 'Text', 'text', 'Value', 'value');
    const startTicks = ticks(value(raw, 'StartTicks', 'startTicks', 'StartTimeTicks', 'startTimeTicks', 'Start', 'start', 'TimeTicks', 'timeTicks')) ?? 0;
    const explicitEnd = ticks(value(raw, 'EndTicks', 'endTicks', 'EndTimeTicks', 'endTimeTicks', 'End', 'end'));
    const rawParts = value(raw, 'Syllables', 'syllables', 'Parts', 'parts', 'Words', 'words');
    const parts = Array.isArray(rawParts)
        ? rawParts.map((part, index) => normalizePart(part, startTicks, index)).filter(Boolean)
        : [];
    if (typeof rawText !== 'string' && !parts.length) return null;
    const partEnd = parts.reduce((maximum, part) => Math.max(maximum, part.endTicks ?? 0), startTicks);
    const id = optionalString(value(raw, 'Id', 'id')) || `lyric-${trackIndex}-${lineIndex}`;

    return {
        id,
        startTicks,
        endTicks: explicitEnd !== null && explicitEnd >= startTicks ? explicitEnd : Math.max(startTicks, partEnd),
        text: safeString(rawText),
        agentIds: strings(value(raw, 'AgentIds', 'agentIds', 'Agents', 'agents')),
        background: Boolean(value(raw, 'Background', 'background', 'IsBackground', 'isBackground')),
        parts,
        _hasExplicitEnd: explicitEnd !== null && explicitEnd >= startTicks,
        _order: lineIndex
    };
}

function finishLines(lines) {
    lines.sort((a, b) => a.startTicks - b.startTicks || a._order - b._order);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const nextStart = lines[index + 1]?.startTicks;
        if (!line._hasExplicitEnd) {
            const partEnd = line.parts.reduce((maximum, part) => Math.max(maximum, part.endTicks ?? 0), line.startTicks);
            line.endTicks = Math.max(line.startTicks, partEnd, nextStart ?? line.startTicks);
        }
        line.parts = finishParts(line.parts, line.startTicks, line.endTicks);
        delete line._hasExplicitEnd;
        delete line._order;
    }
    return lines;
}

function trackType(raw, index) {
    const candidate = safeString(value(raw, 'Type', 'type', 'TrackType', 'trackType', 'Kind', 'kind')).toLowerCase();
    if (TRACK_TYPES.has(candidate)) return candidate;
    return index === 0 ? 'main' : 'other';
}

function normalizeTrack(raw, index, fallbackLanguage) {
    const rawLines = value(raw, 'Lines', 'lines', 'Cues', 'cues', 'Lyrics', 'lyrics');
    if (!Array.isArray(rawLines)) return null;
    const lines = finishLines(rawLines.map((line, lineIndex) => normalizeLine(line, index, lineIndex)).filter(Boolean));
    if (!lines.length) return null;
    return {
        type: trackType(raw, index),
        language: optionalString(value(raw, 'Language', 'language')) || fallbackLanguage,
        lines
    };
}

function inferSyncType(tracks, supplied) {
    const normalized = safeString(supplied).toLowerCase();
    if (normalized) return normalized;
    if (tracks.some(track => track.lines.some(line => line.parts.some(part => part.endTicks > part.startTicks)))) return 'word';
    if (tracks.some(track => track.lines.some(line => line.startTicks > 0))) return 'line';
    return 'unsynced';
}

/** Normalize current Jellyfin lyric DTOs and future multi-track DTOs. */
export function normalizeLyricDocument(raw, defaults = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const language = optionalString(value(raw, 'Language', 'language')) || optionalString(defaults.language);
    const rawTracks = value(raw, 'Tracks', 'tracks');
    let trackInputs;
    if (Array.isArray(rawTracks)) {
        trackInputs = rawTracks;
    } else {
        const nestedLyrics = value(raw, 'Lyrics', 'lyrics');
        const cues = value(raw, 'Cues', 'cues')
            ?? (nestedLyrics && typeof nestedLyrics === 'object' && !Array.isArray(nestedLyrics)
                ? value(nestedLyrics, 'Cues', 'cues', 'Lines', 'lines', 'Lyrics', 'lyrics')
                : undefined);
        const lines = Array.isArray(cues) ? cues : (Array.isArray(nestedLyrics) ? nestedLyrics : null);
        trackInputs = lines ? [{ Type: 'main', Language: language, Lines: lines }] : [];
    }

    const tracks = trackInputs.map((track, index) => normalizeTrack(track, index, language)).filter(Boolean);
    if (!tracks.length) return null;
    if (!tracks.some(track => track.type === 'main')) tracks[0].type = 'main';

    const metadataValue = value(raw, 'Metadata', 'metadata');
    const metadata = metadataValue && typeof metadataValue === 'object' && !Array.isArray(metadataValue)
        ? { ...metadataValue }
        : {};
    return {
        schemaVersion: 1,
        source: optionalString(value(raw, 'Source', 'source')) || optionalString(defaults.source) || 'jellyfin',
        language,
        syncType: inferSyncType(tracks, value(raw, 'SyncType', 'syncType')),
        tracks,
        rawTtml: optionalString(value(raw, 'RawTtml', 'rawTtml', 'Ttml', 'ttml')),
        metadata
    };
}
