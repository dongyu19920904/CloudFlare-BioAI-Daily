function normalizeCron(cron) {
    return String(cron || '').trim();
}

function isEnabled(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}

export function resolveScheduledModeFromCron(cronValue, env = {}) {
    const cron = normalizeCron(cronValue);
    const blogCrons = new Set(['30 12 * * *', '0 23 * * *', '0 10 * * *']);
    if (blogCrons.has(cron)) return 'blog';

    const dailyCron = normalizeCron(env.DAILY_CRON_SCHEDULE || '0 11 * * *');
    const opportunityCron = normalizeCron(env.OPPORTUNITY_CRON_SCHEDULE || '30 11 * * *');
    const projectOpportunityCron = normalizeCron(env.PROJECT_OPPORTUNITY_CRON_SCHEDULE || opportunityCron);
    const shareProjectWithOpportunity = isEnabled(env.PROJECT_OPPORTUNITY_SHARED_WITH_OPPORTUNITY_CRON);

    if (cron === opportunityCron && (shareProjectWithOpportunity || projectOpportunityCron === opportunityCron)) {
        return 'opportunity-batch';
    }
    if (cron === opportunityCron) return 'opportunity';
    if (cron === projectOpportunityCron) return 'project-opportunity';
    if (cron === dailyCron || cron) return 'daily';

    return 'daily';
}
