export async function runIndependentBioTasks(tasks = {}) {
    const results = {};
    for (const [name, task] of Object.entries(tasks)) {
        try {
            results[name] = await task();
        } catch (error) {
            results[name] = { success: false, error: error.message };
        }
    }
    return results;
}
