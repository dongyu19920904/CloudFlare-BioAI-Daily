import { pathToFileURL } from 'node:url';

export function resolveSelfHealDate({ targetDate = '', eventName = 'workflow_dispatch', now = new Date().toISOString() } = {}) {
    if (targetDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)
            || new Date(`${targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== targetDate) throw new Error('Invalid target date');
        return targetDate;
    }
    const current = new Date(now);
    if (!Number.isFinite(current.getTime())) throw new Error('Invalid execution timestamp');
    let target = current;
    if (eventName === 'schedule') {
        // Anchor to the most recent 13:45 UTC schedule, even after Shanghai midnight.
        target = new Date(current);
        target.setUTCHours(13, 45, 0, 0);
        if (target > current) target.setUTCDate(target.getUTCDate() - 1);
    }
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(target);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(resolveSelfHealDate({ targetDate: process.argv[2], eventName: process.argv[3], now: process.argv[4] }));
}
