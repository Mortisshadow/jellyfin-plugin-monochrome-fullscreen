using System.Diagnostics.CodeAnalysis;
using System.Security.Claims;
using System.Text;
using System.Xml;
using Jellyfin.Plugin.MonochromeFullscreen.Lyrics;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.MonochromeFullscreen.Api;

/// <summary>
/// Exposes normalized TTML sidecars for audio items the current user may access.
/// </summary>
[ApiController]
[Authorize]
[Route("MonochromeFullscreen/Audio")]
public sealed class TtmlLyricsController : ControllerBase
{
    private const string JellyfinUserIdClaim = "Jellyfin-UserId";
    private readonly ILibraryManager _libraryManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="TtmlLyricsController"/> class.
    /// </summary>
    /// <param name="libraryManager">Jellyfin library access service.</param>
    public TtmlLyricsController(ILibraryManager libraryManager)
    {
        _libraryManager = libraryManager;
    }

    /// <summary>
    /// Gets a normalized TTML sidecar for an authorized audio item.
    /// </summary>
    /// <param name="itemId">The audio item identifier.</param>
    /// <returns>The normalized lyric document, or 404 when no usable TTML exists.</returns>
    [HttpGet("{itemId:guid}/Lyrics")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [SuppressMessage(
        "Security",
        "CA3003:Review code for file path injection vulnerabilities",
        Justification = "The path comes from Jellyfin's user-authorized Audio entity, not from the route value; discovery is restricted to matching same-directory sidecars and rejects links.")]
    public IActionResult GetLyrics(Guid itemId)
    {
        var claim = User.FindFirstValue(JellyfinUserIdClaim);
        if (!Guid.TryParse(claim, out var userId))
        {
            return Unauthorized();
        }

        var item = _libraryManager.GetItemById<Audio>(itemId, userId);
        var path = item?.Path;
        if (string.IsNullOrWhiteSpace(path))
        {
            return NotFound();
        }

        foreach (var sidecar in FindSidecars(path))
        {
            try
            {
                var info = new FileInfo(sidecar);
                if (!info.Exists || info.LinkTarget is not null || info.Length is <= 0 or > TtmlLyricParser.MaxDocumentBytes)
                {
                    continue;
                }

                string rawTtml;
                using (var reader = new StreamReader(
                    info.OpenRead(),
                    Encoding.UTF8,
                    detectEncodingFromByteOrderMarks: true))
                {
                    rawTtml = reader.ReadToEnd();
                }

                using var stream = new MemoryStream(Encoding.UTF8.GetBytes(rawTtml), writable: false);
                var document = TtmlLyricParser.Parse(stream);
                if (document is not null)
                {
                    return Ok(document with { RawTtml = rawTtml });
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or XmlException)
            {
                // A malformed/unreadable sidecar behaves like a missing lyric file.
            }
        }

        return NotFound();
    }

    [SuppressMessage(
        "Security",
        "CA3003:Review code for file path injection vulnerabilities",
        Justification = "This private helper receives only a path from Jellyfin's user-authorized Audio entity and returns canonical matching children from that directory.")]
    private static string[] FindSidecars(string audioPath)
    {
        try
        {
            var fullAudioPath = Path.GetFullPath(audioPath);
            var directory = Path.GetDirectoryName(fullAudioPath);
            var baseName = Path.GetFileNameWithoutExtension(fullAudioPath);
            if (string.IsNullOrEmpty(directory) || string.IsNullOrEmpty(baseName) || !Directory.Exists(directory))
            {
                return Array.Empty<string>();
            }

            var directoryPrefix = Path.TrimEndingDirectorySeparator(Path.GetFullPath(directory)) + Path.DirectorySeparatorChar;
            var pathComparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
            return Directory.EnumerateFiles(directory, "*.ttml", SearchOption.TopDirectoryOnly)
                .Where(candidate =>
                {
                    var candidateName = Path.GetFileNameWithoutExtension(candidate);
                    return candidateName.Equals(baseName, StringComparison.OrdinalIgnoreCase)
                        || candidateName.StartsWith(baseName + ".", StringComparison.OrdinalIgnoreCase);
                })
                .Select(Path.GetFullPath)
                .Where(candidate => candidate.StartsWith(directoryPrefix, pathComparison))
                .OrderBy(candidate => candidate, StringComparer.OrdinalIgnoreCase)
                .Take(8)
                .ToArray();
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return Array.Empty<string>();
        }
    }
}
