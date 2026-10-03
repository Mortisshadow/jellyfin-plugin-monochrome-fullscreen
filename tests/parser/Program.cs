using System.Text;
using Jellyfin.Plugin.MonochromeFullscreen.Lyrics;

const string Xml = """
    <tt xmlns="http://www.w3.org/ns/ttml" xmlns:lrc="http://lrc.red/lyric-ttml-internal" xml:lang="en">
      <body dur="4:51.175">
        <div begin="0.010" end="11.442" lrc:songPart="Intro">
          <p begin="0.010" end="2.381"><span begin="0.010" end="0.235">First</span></p>
        </div>
        <div begin="12.398" end="46.218" lrc:songPart="Verse">
          <p begin="12.398" end="14.875"><span begin="12.398" end="12.898">Second</span> <span xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ttm:role="x-bg"><span begin="14.000" end="14.500">(echo)</span></span></p>
        </div>
        <div begin="1:08.174" end="1:54.854" lrc:songPart="Verse">
          <p begin="1:08.174" end="1:11.465"><span begin="1:08.174" end="1:08.549">Third</span></p>
        </div>
        <div data-track="translation" xml:lang="de">
          <p begin="12.398" end="14.875">Zweite Zeile</p>
        </div>
      </body>
    </tt>
    """;

using var stream = new MemoryStream(Encoding.UTF8.GetBytes(Xml));
var document = TtmlLyricParser.Parse(stream) ?? throw new InvalidOperationException("Parser returned no document.");
var main = document.Tracks.Single(track => track.Type == "main");
var translation = document.Tracks.Single(track => track.Type == "translation");

Assert(main.Lines.Count == 3, "Song-part divs must be merged into one main track.");
Assert(main.Lines[0].StartTicks == 100_000, "Bare decimal seconds must be parsed.");
Assert(main.Lines[1].StartTicks == 123_980_000, "Multi-digit bare decimal seconds must be parsed.");
Assert(main.Lines[2].StartTicks == 681_740_000, "Minute clock times must be parsed.");
Assert(main.Lines[2].Parts[0].StartTicks == 681_740_000, "Word timing must use the same minute clock parser.");
Assert(main.Lines[1].Parts.Any(part => part.Text.Contains("echo", StringComparison.Ordinal) && part.Background), "Nested x-bg spans must remain background vocals.");
Assert(translation.Language == "de" && translation.Lines.Count == 1, "Explicit translation tracks must remain separate.");

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}
