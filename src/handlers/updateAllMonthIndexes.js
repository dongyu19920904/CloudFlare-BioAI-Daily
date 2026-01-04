// src/handlers/updateAllMonthIndexes.js
import { buildMonthDirectoryIndex } from '../contentUtils.js';
import { callGitHubApi, getGitHubFileSha, createOrUpdateGitHubFile } from '../github.js';

/**
 * 批量更新所有月份目录的 _index.md 文件
 * 用于修复目录排序问题（使用新的权重公式）
 */
export async function handleUpdateAllMonthIndexes(request, env) {
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }), { 
            status: 405, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    try {
        const GITHUB_BRANCH = env.GITHUB_BRANCH || 'main';
        const contentPath = 'content/cn';
        
        // 获取 content/cn 目录下的所有内容
        const directoryData = await callGitHubApi(env, `/contents/${contentPath}?ref=${GITHUB_BRANCH}`);
        
        // 过滤出符合 YYYY-MM 格式的目录（type === 'dir'）
        const monthDirectories = directoryData
            .filter(item => item.type === 'dir' && /^\d{4}-\d{2}$/.test(item.name))
            .map(item => item.name)
            .sort(); // 按字母顺序排序（即按时间顺序）
        
        if (monthDirectories.length === 0) {
            return new Response(JSON.stringify({ 
                status: 'success', 
                message: 'No month directories found',
                updated: []
            }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json; charset=utf-8' } 
            });
        }

        const results = [];
        
        // 逐个更新每个月份目录的 _index.md 文件
        for (const yearMonth of monthDirectories) {
            try {
                const monthDirectoryIndexPath = `${contentPath}/${yearMonth}/_index.md`;
                const monthDirectoryIndexContent = buildMonthDirectoryIndex(yearMonth, { sidebarOpen: true });
                
                // 获取现有文件的 SHA（如果存在）
                const existingSha = await getGitHubFileSha(env, monthDirectoryIndexPath);
                
                // 更新文件
                const commitMessage = `Update month directory index for ${yearMonth} (fix sorting weight)`;
                await createOrUpdateGitHubFile(env, monthDirectoryIndexPath, monthDirectoryIndexContent, commitMessage, existingSha);
                
                results.push({ 
                    yearMonth, 
                    status: 'success', 
                    message: existingSha ? 'Updated' : 'Created' 
                });
                
                console.log(`[UpdateAllMonthIndexes] Successfully updated ${yearMonth}`);
            } catch (error) {
                console.error(`[UpdateAllMonthIndexes] Failed to update ${yearMonth}:`, error);
                results.push({ 
                    yearMonth, 
                    status: 'error', 
                    message: error.message 
                });
            }
        }
        
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        return new Response(JSON.stringify({ 
            status: 'success', 
            message: `Updated ${successCount} month directories${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
            total: monthDirectories.length,
            success: successCount,
            errors: errorCount,
            results: results
        }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json; charset=utf-8' } 
        });

    } catch (error) {
        console.error("Error in /updateAllMonthIndexes:", error);
        return new Response(JSON.stringify({ 
            status: 'error', 
            message: error.message 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json; charset=utf-8' } 
        });
    }
}

