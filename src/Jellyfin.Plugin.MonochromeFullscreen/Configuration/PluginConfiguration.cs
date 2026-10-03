using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.MonochromeFullscreen.Configuration;

/// <summary>
/// Persistent settings for the fullscreen music client.
/// </summary>
public sealed class PluginConfiguration : BasePluginConfiguration
{
    private int _fpsLimit = 30;

    /// <summary>
    /// Gets or sets a value indicating whether the client extension is enabled.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether audio playback opens the overlay.
    /// </summary>
    public bool AutoOpen { get; set; } = true;

    /// <summary>
    /// Gets or sets the maximum visualizer frame rate.
    /// </summary>
    public int FpsLimit
    {
        get => _fpsLimit;
        set => _fpsLimit = value is 24 or 30 or 60 ? value : 30;
    }

    /// <summary>
    /// Gets or sets a value indicating whether the animated background is enabled.
    /// </summary>
    public bool BackgroundEffect { get; set; } = true;

    /// <summary>
    /// Gets or sets a value indicating whether motion is reduced independently of the OS preference.
    /// </summary>
    public bool ReducedMotion { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether the low-power quality profile is forced.
    /// </summary>
    public bool LowPowerMode { get; set; }
}
