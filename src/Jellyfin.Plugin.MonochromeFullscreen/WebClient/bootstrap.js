(() => {
    'use strict';

    const currentScript = document.currentScript;
    if (!currentScript?.src || window.MonochromeFullscreenPlugin) {
        return;
    }

    const pluginUrl = new URL('plugin.js', currentScript.src).href;
    window.MonochromeFullscreenPlugin = async () => {
        const pluginModule = await import(pluginUrl);
        return pluginModule.default;
    };
})();
