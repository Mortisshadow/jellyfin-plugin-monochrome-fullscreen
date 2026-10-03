namespace Jellyfin.Plugin.MonochromeFullscreen.Lyrics;

internal sealed record TtmlLyricDocument(
    int SchemaVersion,
    string Source,
    string? Language,
    string SyncType,
    IReadOnlyList<TtmlLyricTrack> Tracks,
    IReadOnlyDictionary<string, string> Metadata,
    string? RawTtml = null);

internal sealed record TtmlLyricTrack(
    string Type,
    string? Language,
    IReadOnlyList<TtmlLyricLine> Lines);

internal sealed record TtmlLyricLine(
    string Id,
    long StartTicks,
    long EndTicks,
    string Text,
    IReadOnlyList<string> AgentIds,
    bool Background,
    IReadOnlyList<TtmlLyricPart> Parts);

internal sealed record TtmlLyricPart(
    string Text,
    long StartTicks,
    long EndTicks,
    bool Background);
