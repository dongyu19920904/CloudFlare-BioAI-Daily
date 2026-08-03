export function createScheduledRunEnvironment(env, mode, dryRunRequested = false) {
    if (!dryRunRequested || mode !== 'daily') return env;

    // Cloudflare bindings can be non-serializable. Inherit them without copying or
    // mutating the production environment, then override only this invocation.
    const runEnvironment = Object.create(env || null);
    Object.defineProperty(runEnvironment, 'DAILY_DRY_RUN', {
        value: 'true',
        enumerable: true,
        configurable: false,
        writable: false,
    });
    return runEnvironment;
}
