// src/handlers/commitToGitHub.js
import { getISODate, formatDateToChinese, formatMarkdownText } from '../helpers.js';
import { buildDailyContentWithFrontMatter, getYearMonth, updateHomeIndexContent, buildMonthDirectoryIndex } from '../contentUtils.js';
import { getGitHubFileContent, getGitHubFileSha, createOrUpdateGitHubFile } from '../github.js';
import { storeInKV } from '../kv.js';
import { marked } from '../marked.esm.js';

export async function handleCommitToGitHub(request, env) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }
    try {
        const formData = await request.formData();
        const dateStr = formData.get('date') || getISODate();
        const dailyMd = formData.get('daily_summary_markdown');
        const podcastMd = formData.get('podcast_script_markdown');


        const filesToCommit = [];

        if (dailyMd) {
            const normalizedDailyMd = formatMarkdownText(dailyMd);
            const yearMonth = getYearMonth(dateStr);
            const dailyPagePath = `content/cn/${yearMonth}/${dateStr}.md`;
            const monthDirectoryIndexPath = `content/cn/${yearMonth}/_index.md`;
            const dailyPageTitle = `${env.DAILY_TITLE} ${formatDateToChinese(dateStr)}`;
            const dailyPageContent = buildDailyContentWithFrontMatter(dateStr, normalizedDailyMd, { title: dailyPageTitle });

            let existingHomeContent = '';
            try {
                existingHomeContent = await getGitHubFileContent(env, 'content/cn/_index.md');
            } catch (error) {
                console.warn('[commitToGitHub] Home page not found, will create a new one.');
            }
            const homeTitle = dailyPageTitle;
            // Use configured min title or full title for the linkTitle in _index.md
            const linkTitle = env.DAILY_TITLE_MIN || env.DAILY_TITLE || 'BioAI 生命科学日报';
            const homeContent = updateHomeIndexContent(existingHomeContent, normalizedDailyMd, dateStr, {
                title: homeTitle,
                linkTitle: linkTitle
            });

            filesToCommit.push({ path: `daily/${dateStr}.md`, content: normalizedDailyMd, description: "Daily Summary File" });
            filesToCommit.push({ path: dailyPagePath, content: dailyPageContent, description: "Daily Page File" });
            filesToCommit.push({ path: monthDirectoryIndexPath, content: buildMonthDirectoryIndex(yearMonth, { sidebarOpen: true }), description: "Month Directory Index File" });
            filesToCommit.push({ path: 'content/cn/_index.md', content: homeContent, description: "Home Page File" });
        }
        if (podcastMd) {
            filesToCommit.push({ path: `content/cn/podcast/${dateStr}.md`, content: podcastMd, description: "Podcast Script File" });
        }

        if (filesToCommit.length === 0) {
            throw new Error("No markdown content provided for GitHub commit.");
        }

        const results = [];
        for (const file of filesToCommit) {
            try {
                const existingSha = await getGitHubFileSha(env, file.path);
                const commitMessage = `${existingSha ? 'Update' : 'Create'} ${file.description.toLowerCase()} for ${dateStr}`;
                await createOrUpdateGitHubFile(env, file.path, file.content, commitMessage, existingSha);
                results.push({ file: file.path, status: 'Success', message: `Successfully ${existingSha ? 'updated' : 'created'}.` });
                console.log(`GitHub commit success for ${file.path}`);
            } catch (err) {
                console.error(`Failed to commit ${file.path} to GitHub:`, err);
                results.push({ file: file.path, status: 'Failed', message: err.message });
            }
        }

        return new Response(JSON.stringify({ status: 'success', date: dateStr, results: results }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /commitToGitHub:", error);
        return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
}
