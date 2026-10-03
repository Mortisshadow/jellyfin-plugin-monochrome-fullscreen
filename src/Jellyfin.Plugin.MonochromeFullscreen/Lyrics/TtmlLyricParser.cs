using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace Jellyfin.Plugin.MonochromeFullscreen.Lyrics;

internal static partial class TtmlLyricParser
{
    internal const long MaxDocumentBytes = 2 * 1024 * 1024;
    private const long TicksPerSecond = 10_000_000;

    internal static TtmlLyricDocument? Parse(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = MaxDocumentBytes,
            IgnoreComments = true,
            IgnoreProcessingInstructions = true
        };

        using var reader = XmlReader.Create(stream, settings);
        var xml = XDocument.Load(reader, LoadOptions.None);
        var root = xml.Root;
        if (root is null || !root.Name.LocalName.Equals("tt", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var timing = TimingContext.From(root);
        var language = Attribute(root, "lang");
        var body = root.Descendants().FirstOrDefault(node => node.Name.LocalName.Equals("body", StringComparison.OrdinalIgnoreCase));
        if (body is null)
        {
            return null;
        }

        var containers = body.Descendants()
            .Where(node => node.Name.LocalName.Equals("div", StringComparison.OrdinalIgnoreCase))
            .Where(node => node.Descendants().Any(child => child.Name.LocalName.Equals("p", StringComparison.OrdinalIgnoreCase)))
            .Where(node => !node.Ancestors().Any(parent => parent != body
                && parent.Name.LocalName.Equals("div", StringComparison.OrdinalIgnoreCase)))
            .ToList();
        if (containers.Count == 0)
        {
            containers.Add(body);
        }

        var tracks = new List<TtmlLyricTrack>();
        for (var trackIndex = 0; trackIndex < containers.Count; trackIndex++)
        {
            var container = containers[trackIndex];
            var lines = ParseLines(container, timing, trackIndex);
            if (lines.Count == 0)
            {
                continue;
            }

            var type = InferTrackType(container, trackIndex);
            tracks.Add(new TtmlLyricTrack(type, Attribute(container, "lang") ?? language, lines));
        }

        if (tracks.Count == 0)
        {
            return null;
        }

        if (!tracks.Any(track => track.Type.Equals("main", StringComparison.Ordinal)))
        {
            tracks[0] = tracks[0] with { Type = "main" };
        }

        var syncType = tracks.Any(track => track.Lines.Any(line => line.Parts.Count > 0))
            ? "word"
            : tracks.Any(track => track.Lines.Any(line => line.StartTicks > 0)) ? "line" : "unsynced";
        return new TtmlLyricDocument(
            1,
            "ttml",
            language,
            syncType,
            tracks,
            new Dictionary<string, string>(StringComparer.Ordinal) { ["format"] = "ttml" });
    }

    private static IReadOnlyList<TtmlLyricLine> ParseLines(XElement container, TimingContext timing, int trackIndex)
    {
        var parsed = new List<MutableLine>();
        var lineIndex = 0;
        foreach (var paragraph in container.Descendants().Where(node => node.Name.LocalName.Equals("p", StringComparison.OrdinalIgnoreCase)))
        {
            var text = NormalizeText(paragraph.Value);
            if (text.Length == 0)
            {
                continue;
            }

            var parentStart = ResolveAncestorStart(paragraph, timing);
            var start = ResolveTime(Attribute(paragraph, "begin"), parentStart, timing) ?? parentStart;
            var end = ResolveEnd(paragraph, start, parentStart, timing);
            var parts = ParseParts(paragraph, start, end, timing);
            AlignPartText(parts, text);
            parsed.Add(new MutableLine(
                $"ttml-{trackIndex}-{lineIndex++}",
                start,
                end,
                text,
                SplitTokens(Attribute(paragraph, "agent")),
                IsBackground(paragraph),
                parts));
        }

        parsed.Sort(static (left, right) => left.StartTicks.CompareTo(right.StartTicks));
        for (var index = 0; index < parsed.Count; index++)
        {
            var line = parsed[index];
            var nextStart = index + 1 < parsed.Count ? parsed[index + 1].StartTicks : line.StartTicks;
            var partEnd = line.Parts.Count > 0 ? line.Parts.Max(part => part.EndTicks) : line.StartTicks;
            if (line.EndTicks <= line.StartTicks)
            {
                line.EndTicks = Math.Max(line.StartTicks, Math.Max(nextStart, partEnd));
            }

            FinishParts(line.Parts, line.StartTicks, line.EndTicks);
        }

        return parsed.Select(line => new TtmlLyricLine(
            line.Id,
            line.StartTicks,
            line.EndTicks,
            line.Text,
            line.AgentIds,
            line.Background,
            line.Parts.Select(part => new TtmlLyricPart(part.Text, part.StartTicks, part.EndTicks, part.Background)).ToList()))
            .ToList();
    }

    private static List<MutablePart> ParseParts(XElement paragraph, long lineStart, long lineEnd, TimingContext timing)
    {
        var parts = new List<MutablePart>();
        foreach (var span in paragraph.Descendants().Where(node => node.Name.LocalName.Equals("span", StringComparison.OrdinalIgnoreCase)))
        {
            if (span.Descendants().Any(node => node.Name.LocalName.Equals("span", StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            var text = NormalizeText(span.Value);
            var beginValue = Attribute(span, "begin");
            var endValue = Attribute(span, "end");
            var durationValue = Attribute(span, "dur");
            if (text.Length == 0 || (beginValue is null && endValue is null && durationValue is null))
            {
                continue;
            }

            var start = ResolveTime(beginValue, lineStart, timing) ?? lineStart;
            var end = ResolveTime(endValue, lineStart, timing)
                ?? (ParseTime(durationValue, timing) is long duration ? start + duration : lineEnd);
            parts.Add(new MutablePart(text, start, Math.Max(start, end), IsBackground(span)));
        }

        parts.Sort(static (left, right) => left.StartTicks.CompareTo(right.StartTicks));
        return parts;
    }

    private static void FinishParts(List<MutablePart> parts, long lineStart, long lineEnd)
    {
        for (var index = 0; index < parts.Count; index++)
        {
            var part = parts[index];
            if (part.StartTicks < lineStart)
            {
                part.StartTicks = lineStart;
            }

            if (part.EndTicks <= part.StartTicks)
            {
                part.EndTicks = index + 1 < parts.Count ? parts[index + 1].StartTicks : lineEnd;
            }

            part.EndTicks = Math.Max(part.StartTicks, part.EndTicks);
        }
    }

    private static void AlignPartText(List<MutablePart> parts, string lineText)
    {
        var cursor = 0;
        for (var index = 0; index < parts.Count; index++)
        {
            var token = parts[index].Text.Trim();
            if (token.Length == 0)
            {
                continue;
            }

            var match = lineText.IndexOf(token, cursor, StringComparison.Ordinal);
            if (match < 0)
            {
                continue;
            }

            parts[index].Text = lineText[cursor..(match + token.Length)];
            cursor = match + token.Length;
        }

        if (parts.Count > 0 && cursor < lineText.Length)
        {
            parts[^1].Text += lineText[cursor..];
        }
    }

    private static long ResolveAncestorStart(XElement element, TimingContext timing)
    {
        var start = 0L;
        foreach (var ancestor in element.Ancestors().Reverse())
        {
            var parsed = ParseTime(Attribute(ancestor, "begin"), timing);
            if (parsed is not null)
            {
                start = ResolveRelative(parsed.Value, start);
            }
        }

        return start;
    }

    private static long ResolveEnd(XElement element, long start, long parentStart, TimingContext timing)
    {
        var end = ResolveTime(Attribute(element, "end"), parentStart, timing);
        if (end is not null)
        {
            return Math.Max(start, end.Value);
        }

        var duration = ParseTime(Attribute(element, "dur"), timing);
        return duration is null ? start : start + duration.Value;
    }

    private static long? ResolveTime(string? value, long parentStart, TimingContext timing)
    {
        var parsed = ParseTime(value, timing);
        return parsed is null ? null : ResolveRelative(parsed.Value, parentStart);
    }

    // Apple-style TTML often repeats absolute times inside a timed paragraph,
    // while other TTML producers use parent-relative offsets. This accepts both.
    private static long ResolveRelative(long value, long parentStart) => value >= parentStart ? value : parentStart + value;

    private static long? ParseTime(string? value, TimingContext timing)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        var offset = OffsetTimeRegex().Match(trimmed);
        if (offset.Success && double.TryParse(offset.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var amount))
        {
            var seconds = offset.Groups[2].Value.ToLowerInvariant() switch
            {
                "h" => amount * 3600,
                "m" => amount * 60,
                "s" => amount,
                "ms" => amount / 1000,
                "f" => amount / timing.FrameRate,
                "t" => amount / timing.TickRate,
                _ => double.NaN
            };
            return ToTicks(seconds);
        }

        var components = trimmed.Split(':');
        if (components.Length is 3 or 4
            && double.TryParse(components[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var hours)
            && double.TryParse(components[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var minutes)
            && double.TryParse(components[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var secondsPart))
        {
            var seconds = (hours * 3600) + (minutes * 60) + secondsPart;
            if (components.Length == 4
                && double.TryParse(components[3], NumberStyles.Float, CultureInfo.InvariantCulture, out var frames))
            {
                seconds += frames / timing.FrameRate;
            }

            return ToTicks(seconds);
        }

        return null;
    }

    private static long? ToTicks(double seconds)
    {
        if (!double.IsFinite(seconds) || seconds < 0 || seconds > (long.MaxValue / (double)TicksPerSecond))
        {
            return null;
        }

        return checked((long)Math.Round(seconds * TicksPerSecond, MidpointRounding.AwayFromZero));
    }

    private static string InferTrackType(XElement container, int index)
    {
        var hints = string.Join(' ', container.Attributes().Select(attribute => attribute.Value)).ToLowerInvariant();
        if (hints.Contains("translation", StringComparison.Ordinal))
        {
            return "translation";
        }

        if (hints.Contains("transliteration", StringComparison.Ordinal)
            || hints.Contains("roman", StringComparison.Ordinal)
            || hints.Contains("phonetic", StringComparison.Ordinal))
        {
            return "phonetic";
        }

        return index == 0 ? "main" : "other";
    }

    private static bool IsBackground(XElement element)
    {
        var hints = string.Join(' ', element.Attributes().Select(attribute => attribute.Value));
        return hints.Contains("background", StringComparison.OrdinalIgnoreCase);
    }

    private static string? Attribute(XElement element, string localName)
        => element.Attributes().FirstOrDefault(attribute => attribute.Name.LocalName.Equals(localName, StringComparison.OrdinalIgnoreCase))?.Value;

    private static IReadOnlyList<string> SplitTokens(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? Array.Empty<string>()
            : value.Split([' ', ',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.Ordinal)
                .ToArray();

    private static string NormalizeText(string value) => WhitespaceRegex().Replace(value, " ").Trim();

    [GeneratedRegex(@"^([0-9]+(?:\.[0-9]+)?)(h|m|s|ms|f|t)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex OffsetTimeRegex();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespaceRegex();

    private sealed record TimingContext(double FrameRate, double TickRate)
    {
        internal static TimingContext From(XElement root)
        {
            var frameRate = ParsePositiveDouble(Attribute(root, "frameRate"), 30);
            var multiplier = Attribute(root, "frameRateMultiplier")?.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (multiplier is { Length: 2 }
                && double.TryParse(multiplier[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var numerator)
                && double.TryParse(multiplier[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var denominator)
                && numerator > 0
                && denominator > 0)
            {
                frameRate *= numerator / denominator;
            }

            return new TimingContext(frameRate, ParsePositiveDouble(Attribute(root, "tickRate"), 1));
        }

        private static double ParsePositiveDouble(string? value, double fallback)
            => double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) && parsed > 0
                ? parsed
                : fallback;
    }

    private sealed class MutableLine(
        string id,
        long startTicks,
        long endTicks,
        string text,
        IReadOnlyList<string> agentIds,
        bool background,
        List<MutablePart> parts)
    {
        internal string Id { get; } = id;
        internal long StartTicks { get; } = startTicks;
        internal long EndTicks { get; set; } = endTicks;
        internal string Text { get; set; } = text;
        internal IReadOnlyList<string> AgentIds { get; } = agentIds;
        internal bool Background { get; } = background;
        internal List<MutablePart> Parts { get; } = parts;
    }

    private sealed class MutablePart(string text, long startTicks, long endTicks, bool background)
    {
        internal string Text { get; } = text;
        internal long StartTicks { get; set; } = startTicks;
        internal long EndTicks { get; set; } = endTicks;
        internal bool Background { get; } = background;
    }
}
