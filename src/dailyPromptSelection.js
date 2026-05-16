function parsePositiveInteger(value, defaultValue) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function resolveDailyPromptItemCap(env = {}, isManualRun = false) {
    const manualCap = isManualRun ? env.MANUAL_DAILY_PROMPT_ITEM_CAP : null;
    return parsePositiveInteger(manualCap || env.DAILY_PROMPT_ITEM_CAP, 8);
}

export function selectDailyPromptItems(itemsWithMedia = [], itemsWithoutMedia = [], cap = 8) {
    const normalizedCap = parsePositiveInteger(cap, 8);
    return [...itemsWithMedia, ...itemsWithoutMedia].slice(0, normalizedCap);
}
