export function resolveManualScheduledMode(path, requestedMode) {
    if (path.endsWith('ProjectOpportunity')) return 'project-opportunity';
    if (path.endsWith('Opportunity')) {
        return requestedMode === 'opportunity' ? 'opportunity' : 'opportunity-batch';
    }

    const mode = String(requestedMode || '').trim();
    if (['daily', 'opportunity', 'project-opportunity', 'opportunity-batch', 'all'].includes(mode)) {
        return mode;
    }

    return 'daily';
}
