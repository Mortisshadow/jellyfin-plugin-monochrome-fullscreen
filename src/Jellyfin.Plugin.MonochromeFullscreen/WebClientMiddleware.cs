using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jellyfin.Plugin.MonochromeFullscreen.Configuration;
using MediaBrowser.Controller.Configuration;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MonochromeFullscreen;

/// <summary>
/// Serves embedded client assets and transiently augments Jellyfin Web responses.
/// No file in the Jellyfin web installation is modified.
/// </summary>
public sealed class WebClientMiddleware
{
    private const string ClientRoute = "/MonochromeFullscreen/client/";
    private const string PluginSpec = "MonochromeFullscreenPlugin";
    private const string InjectionStart = "<!-- monochrome-fullscreen:start -->";
    private const string InjectionEnd = "<!-- monochrome-fullscreen:end -->";
    private static readonly Assembly PluginAssembly = typeof(WebClientMiddleware).Assembly;
    private static readonly Dictionary<string, (string Resource, string ContentType)> Assets =
        new Dictionary<string, (string Resource, string ContentType)>(StringComparer.OrdinalIgnoreCase)
        {
            ["bootstrap.js"] = ("Jellyfin.Plugin.MonochromeFullscreen.WebClient.bootstrap.js", "text/javascript; charset=utf-8"),
            ["plugin.js"] = ("Jellyfin.Plugin.MonochromeFullscreen.WebClient.plugin.js", "text/javascript; charset=utf-8"),
            ["playback-adapter.js"] = ("Jellyfin.Plugin.MonochromeFullscreen.WebClient.playback-adapter.js", "text/javascript; charset=utf-8"),
            ["overlay.js"] = ("Jellyfin.Plugin.MonochromeFullscreen.WebClient.overlay.js", "text/javascript; charset=utf-8"),
            ["input-adapter.js"] = ("Jellyfin.Plugin.MonochromeFullscreen.WebClient.input-adapter.js", "text/javascript; charset=utf-8"),
            ["visualizer.js"] = ("Jellyfin.Plugin.MonochromeFullscreen.WebClient.visualizer.js", "text/javascript; charset=utf-8"),
            ["styles.css"] = ("Jellyfin.Plugin.MonochromeFullscreen.WebClient.styles.css", "text/css; charset=utf-8")
        };
    private static readonly Action<ILogger, string, Exception?> LogIndexReadFailure = LoggerMessage.Define<string>(
        LogLevel.Error,
        new EventId(1, nameof(LogIndexReadFailure)),
        "[MonochromeFullscreen] Unable to read Jellyfin Web index at {IndexPath}");
    private static readonly Action<ILogger, Exception?> LogMissingHead = LoggerMessage.Define(
        LogLevel.Error,
        new EventId(2, nameof(LogMissingHead)),
        "[MonochromeFullscreen] Jellyfin Web index has no head element; client bootstrap was not injected");
    private static readonly Action<ILogger, string, Exception?> LogConfigReadFailure = LoggerMessage.Define<string>(
        LogLevel.Error,
        new EventId(3, nameof(LogConfigReadFailure)),
        "[MonochromeFullscreen] Unable to augment Jellyfin Web config at {ConfigPath}");

    private readonly RequestDelegate _next;
    private readonly IServerConfigurationManager _configurationManager;
    private readonly ILogger<WebClientMiddleware> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="WebClientMiddleware"/> class.
    /// </summary>
    public WebClientMiddleware(
        RequestDelegate next,
        IServerConfigurationManager configurationManager,
        ILogger<WebClientMiddleware> logger)
    {
        _next = next;
        _configurationManager = configurationManager;
        _logger = logger;
    }

    /// <summary>
    /// Handles a request when it belongs to the client adapter.
    /// </summary>
    public async Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        var configuration = MonochromeFullscreenPlugin.Instance?.Configuration;
        if (configuration?.Enabled != true)
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        var assetIndex = path.LastIndexOf(ClientRoute, StringComparison.OrdinalIgnoreCase);
        if (assetIndex >= 0)
        {
            var assetName = path[(assetIndex + ClientRoute.Length)..];
            if (assetName.Contains('/', StringComparison.Ordinal))
            {
                await _next(context).ConfigureAwait(false);
                return;
            }

            if (assetName.Equals("config.json", StringComparison.OrdinalIgnoreCase))
            {
                await ServeClientConfigurationAsync(context, configuration).ConfigureAwait(false);
                return;
            }

            if (Assets.TryGetValue(assetName, out var asset))
            {
                await ServeEmbeddedAssetAsync(context, asset).ConfigureAwait(false);
                return;
            }
        }

        if (TryGetWebResource(path, out var webPrefix, out var resourceName))
        {
            if (resourceName.Equals("index.html", StringComparison.OrdinalIgnoreCase))
            {
                await ServeInjectedIndexAsync(context, webPrefix).ConfigureAwait(false);
                return;
            }

            if (resourceName.Equals("config.json", StringComparison.OrdinalIgnoreCase))
            {
                await ServeAugmentedWebConfigurationAsync(context).ConfigureAwait(false);
                return;
            }
        }

        await _next(context).ConfigureAwait(false);
    }

    private static bool TryGetWebResource(string path, out string prefix, out string resourceName)
    {
        const string WebSegment = "/web/";
        var webIndex = path.LastIndexOf(WebSegment, StringComparison.OrdinalIgnoreCase);
        if (webIndex < 0)
        {
            prefix = string.Empty;
            resourceName = string.Empty;
            return false;
        }

        prefix = path[..webIndex];
        resourceName = path[(webIndex + WebSegment.Length)..];
        if (resourceName.Length == 0)
        {
            resourceName = "index.html";
        }

        return resourceName.Equals("index.html", StringComparison.OrdinalIgnoreCase)
            || resourceName.Equals("config.json", StringComparison.OrdinalIgnoreCase);
    }

    private async Task ServeInjectedIndexAsync(HttpContext context, string prefix)
    {
        var indexPath = Path.Combine(_configurationManager.ApplicationPaths.WebPath, "index.html");
        string content;
        try
        {
            content = await File.ReadAllTextAsync(indexPath, context.RequestAborted).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            LogIndexReadFailure(_logger, indexPath, exception);
            await _next(context).ConfigureAwait(false);
            return;
        }

        if (!content.Contains(InjectionStart, StringComparison.Ordinal))
        {
            var version = MonochromeFullscreenPlugin.Instance?.Version?.ToString() ?? "1.0.0.0";
            var assetRoot = string.Concat(prefix, ClientRoute);
            var injection = string.Concat(
                InjectionStart,
                "<link rel=\"stylesheet\" href=\"", WebUtility.HtmlEncode(assetRoot), "styles.css?v=", WebUtility.UrlEncode(version), "\">",
                "<script defer src=\"", WebUtility.HtmlEncode(assetRoot), "bootstrap.js?v=", WebUtility.UrlEncode(version), "\"></script>",
                InjectionEnd);

            var headIndex = content.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
            if (headIndex < 0)
            {
                LogMissingHead(_logger, null);
            }
            else
            {
                headIndex += "<head>".Length;
                content = content.Insert(headIndex, injection);
            }
        }

        await WriteTextAsync(context, content, "text/html; charset=utf-8", "no-cache").ConfigureAwait(false);
    }

    private async Task ServeAugmentedWebConfigurationAsync(HttpContext context)
    {
        var configPath = Path.Combine(_configurationManager.ApplicationPaths.WebPath, "config.json");
        try
        {
            var content = await File.ReadAllTextAsync(configPath, context.RequestAborted).ConfigureAwait(false);
            var root = JsonNode.Parse(content) as JsonObject ?? new JsonObject();
            var plugins = root["plugins"] as JsonArray;
            if (plugins is null)
            {
                plugins = new JsonArray();
                root["plugins"] = plugins;
            }

            if (!plugins.Any(node => string.Equals(node?.GetValue<string>(), PluginSpec, StringComparison.Ordinal)))
            {
                plugins.Add(PluginSpec);
            }

            await WriteTextAsync(context, root.ToJsonString(), "application/json; charset=utf-8", "no-store").ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            LogConfigReadFailure(_logger, configPath, exception);
            await _next(context).ConfigureAwait(false);
        }
    }

    private static Task ServeClientConfigurationAsync(HttpContext context, PluginConfiguration configuration)
    {
        var payload = JsonSerializer.Serialize(new
        {
            enabled = configuration.Enabled,
            autoOpen = configuration.AutoOpen,
            fpsLimit = configuration.FpsLimit,
            backgroundEffect = configuration.BackgroundEffect,
            reducedMotion = configuration.ReducedMotion,
            lowPowerMode = configuration.LowPowerMode
        });

        return WriteTextAsync(context, payload, "application/json; charset=utf-8", "no-store");
    }

    private static async Task ServeEmbeddedAssetAsync(
        HttpContext context,
        (string Resource, string ContentType) asset)
    {
        using var resource = PluginAssembly.GetManifestResourceStream(asset.Resource);
        if (resource is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = asset.ContentType;
        context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        context.Response.ContentLength = resource.Length;
        if (!HttpMethods.IsHead(context.Request.Method))
        {
            await resource.CopyToAsync(context.Response.Body, context.RequestAborted).ConfigureAwait(false);
        }
    }

    private static async Task WriteTextAsync(HttpContext context, string content, string contentType, string cacheControl)
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = contentType;
        context.Response.Headers.CacheControl = cacheControl;
        context.Response.ContentLength = bytes.Length;
        if (!HttpMethods.IsHead(context.Request.Method))
        {
            await context.Response.Body.WriteAsync(bytes, context.RequestAborted).ConfigureAwait(false);
        }
    }
}
