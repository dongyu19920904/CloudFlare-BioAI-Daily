/** Run both sections against the caller's shared snapshot; isolate failures. */
export async function runOpportunityBatch(date, jobs) {
    const results = {};
    for (const name of ['opportunity', 'projectOpportunity']) {
        try {
            results[name] = await jobs[name]();
        } catch (error) {
            results[name] = { success: false, date, error: String(error?.message || error) };
        }
    }
    const failedSections = Object.keys(results).filter(name => results[name]?.success !== true);
    return {
        success: failedSections.length === 0,
        partialSuccess: failedSections.length === 1,
        date,
        ...results,
        failedSections,
    };
}
