import { storeInKV } from './kv.js';

export function buildBioDailyRunId(dateStr, now = new Date()) {
    return `daily-${dateStr}-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

export async function storeBioDailyStatus(env, dateStr, status) {
    if (!env?.DATA_KV) return [];
    const value = {
        task: 'daily',
        date: dateStr,
        updatedAt: new Date().toISOString(),
        ...status,
    };
    const keys = [`bio-daily-status:${dateStr}`, 'bio-daily-status:current'];
    await Promise.all(keys.map((key) => storeInKV(env.DATA_KV, key, value, 86400 * 14)));
    return keys;
}
