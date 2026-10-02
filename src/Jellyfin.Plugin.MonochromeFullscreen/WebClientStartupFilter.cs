using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.MonochromeFullscreen;

/// <summary>
/// Adds the web-client adapter ahead of Jellyfin's static file middleware.
/// </summary>
public sealed class WebClientStartupFilter : IStartupFilter
{
    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        ArgumentNullException.ThrowIfNull(next);

        return applicationBuilder =>
        {
            applicationBuilder.UseMiddleware<WebClientMiddleware>();
            next(applicationBuilder);
        };
    }
}
