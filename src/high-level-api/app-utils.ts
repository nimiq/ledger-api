export function isAppSupported(
    app: string,
    requiredApp: string,
    allowLegacyApp: boolean,
    allowSpeculos: boolean,
): boolean {
    return app === requiredApp
        || (allowLegacyApp && app === getLegacyApp(requiredApp))
        || (allowSpeculos && app === 'app'); // speculos reports 'app' as appName
}

export function isAppVersionSupported(versionString: string, minRequiredVersion: string): boolean {
    const version = versionString.split('.').map((part) => parseInt(part, 10));
    const parsedMinRequiredVersion = minRequiredVersion.split('.').map((part) => parseInt(part, 10));
    for (let i = 0; i < minRequiredVersion.length; ++i) {
        if (typeof version[i] === 'undefined' || version[i] < parsedMinRequiredVersion[i]) return false;
        if (version[i] > parsedMinRequiredVersion[i]) return true;
    }
    return true;
}

export function isLegacyApp(app: string) {
    return app.endsWith(' Legacy');
}

export function getLegacyApp(app: string) {
    // Add ' Legacy' suffix to the app name, or preserve it if it already exists.
    return app.replace(/(?: Legacy)?$/, ' Legacy');
}
