import { getISODate, escapeHtml, convertEnglishQuotesToChinese } from '../helpers.js';
import { generateGenAiPageHtml } from '../htmlGenerators.js';

export async function handleGenAIDailyPage(request, env) {
    let dateStr;
    try {
        const url = new URL(request.url);
        const dateParam = url.searchParams.get('date');
        dateStr = dateParam ? dateParam : getISODate();

        let dailySummaryMarkdownContent = '';
        dailySummaryMarkdownContent += `## 今日结论\n\n- 等待生成并通过证据校验。\n\n`;
        dailySummaryMarkdownContent += '> 阅读提示：本站内容用于信息与研究跟踪，不构成诊断、治疗、用药或抗衰建议。\n';

        const successHtml = generateGenAiPageHtml(
            env, 
            'AI日报', // Title for the page
            escapeHtml(dailySummaryMarkdownContent), 
            dateStr, 
            false, // isError
            [], // selectedItemsParams (not applicable here)
            null, null, // Call 1 prompts (not applicable here)
            null, null, // Call 2 prompts (not applicable here)
            'webbuild', // promptsMarkdownContent (not applicable here)
            convertEnglishQuotesToChinese(dailySummaryMarkdownContent), // dailySummaryMarkdownContent
            null, // podcastScriptMarkdownContent (not applicable here)
            true, // readGithub
        );
        return new Response(successHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /genAIDailyPage:", error);
        const pageDateForError = dateStr || getISODate(); 
        const errorHtml = generateGenAiPageHtml(env, '生成AI日报页面出错', `<p><strong>Unexpected error:</strong> ${escapeHtml(error.message)}</p>${error.stack ? `<pre>${escapeHtml(error.stack)}</pre>` : ''}`, pageDateForError, true, []);
        return new Response(errorHtml, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}
