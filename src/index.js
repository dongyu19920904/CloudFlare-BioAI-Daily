// src/index.js
import { handleWriteData } from './handlers/writeData.js';
import { handleGetContent } from './handlers/getContent.js';
import { handleGetContentHtml } from './handlers/getContentHtml.js';
import { handleGenAIContent, handleGenAIPodcastScript, handleGenAIDailyAnalysis } from './handlers/genAIContent.js';
import { handleGenAIDailyPage } from './handlers/genAIDailyPage.js'; // Import handleGenAIDailyPage
import { handleCommitToGitHub } from './handlers/commitToGitHub.js';
import { handleRss } from './handlers/getRss.js';
import { handleWriteRssData } from './handlers/writeRssData.js';
import { handleUpdateAllMonthIndexes } from './handlers/updateAllMonthIndexes.js'; 
import { dataSources } from './dataFetchers.js';
import { handleLogin, isAuthenticated, handleLogout } from './auth.js';
import { handleScheduled } from './handlers/scheduled.js';
import { handleScheduledBlog } from './handlers/scheduledBlog.js';

export default {
    async scheduled(event, env, ctx) {
        // 根据不同的 cron 执行不同的任务
        if (event.cron === '0 16 * * *') {
            // 博客生成任务 - UTC 16:00 (北京时间 00:00)
            await handleScheduledBlog(event, env, ctx);
        } else {
            // 每日日报任务 - UTC 18:00 (北京时间 02:00)
            await handleScheduled(event, env, ctx);
        }
    },
    async fetch(request, env, ctx) {
        // Check essential environment variables
        const requiredEnvVars = [
            'DATA_KV', 'OPEN_TRANSLATE', 'USE_MODEL_PLATFORM',
            'GITHUB_TOKEN', 'GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME', 'GITHUB_BRANCH',
            'LOGIN_USERNAME', 'LOGIN_PASSWORD',
            'PODCAST_TITLE', 'PODCAST_BEGIN', 'PODCAST_END',
            'FOLO_COOKIE_KV_KEY', 'FOLO_DATA_API', 'FOLO_FILTER_DAYS',
        ];

        const platform = String(env.USE_MODEL_PLATFORM || '').toUpperCase();
        if (platform.startsWith('OPEN')) {
            requiredEnvVars.push('OPENAI_API_URL', 'DEFAULT_OPEN_MODEL', 'OPENAI_API_KEY');
        } else if (platform.startsWith('ANTHROPIC')) {
            requiredEnvVars.push('ANTHROPIC_API_URL', 'DEFAULT_ANTHROPIC_MODEL', 'ANTHROPIC_API_KEY');
        } else {
            requiredEnvVars.push('GEMINI_API_URL', 'DEFAULT_GEMINI_MODEL');
        }

        const missingVars = requiredEnvVars.filter(varName => !env[varName]);

        // Gemini can reuse the same key as other platforms in some proxy setups.
        if (!platform.startsWith('OPEN') && !platform.startsWith('ANTHROPIC')) {
            const hasGeminiKey = Boolean(env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
            if (!hasGeminiKey) missingVars.push('GEMINI_API_KEY');
        }

        if (missingVars.length > 0) {
            console.error(`CRITICAL: Missing environment variables/bindings: ${missingVars.join(', ')}`);
            const errorPage = `
                <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Configuration Error</title></head>
                <body style="font-family: sans-serif; padding: 20px;"><h1>Server Configuration Error</h1>
                <p>Essential environment variables or bindings are missing: ${missingVars.join(', ')}. The service cannot operate.</p>
                <p>Please contact the administrator.</p></body></html>`;
            return new Response(errorPage, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        
        const url = new URL(request.url);
        const path = url.pathname;
        console.log(`Request received: ${request.method} ${path}`);

        // Handle login path specifically
        if (path === '/login') {
            return await handleLogin(request, env);
        } else if (path === '/logout') { // Handle logout path
            return await handleLogout(request, env);
        } else if (path === '/getContent' && request.method === 'GET') {
            return await handleGetContent(request, env);
        } else if (path.startsWith('/rss') && request.method === 'GET') {
            return await handleRss(request, env);
        } else if (path === '/writeRssData' && request.method === 'GET') {
            return await handleWriteRssData(request, env);
        } else if (path === '/updateAllMonthIndexes' && request.method === 'GET') {
            // Batch update all month directory _index.md files to fix sorting
            // Protected by simple secret key check
            const secretKey = url.searchParams.get('key');
            const expectedKey = env.TEST_TRIGGER_SECRET || 'test-secret-key-change-me';
            if (secretKey !== expectedKey) {
                return new Response(JSON.stringify({ 
                    error: 'Unauthorized. Please provide correct secret key.' 
                }), { 
                    status: 401, 
                    headers: { 'Content-Type': 'application/json; charset=utf-8' } 
                });
            }
            return await handleUpdateAllMonthIndexes(request, env);
        } else if (path === '/testTriggerScheduled' && request.method === 'GET') {
            // Test endpoint for triggering scheduled task with date parameter
            // Protected by simple secret key check
            const secretKey = url.searchParams.get('key');
            const expectedKey = env.TEST_TRIGGER_SECRET || 'test-secret-key-change-me';
            if (secretKey !== expectedKey) {
                return new Response(JSON.stringify({ 
                    error: 'Unauthorized. Please provide correct secret key.' 
                }), { 
                    status: 401, 
                    headers: { 'Content-Type': 'application/json; charset=utf-8' } 
                });
            }
            const dateParam = url.searchParams.get('date');
            const specifiedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
            const fakeEvent = { scheduledTime: Date.now(), cron: '0 23 * * *' };
            try {
                const waitUntil = ctx && typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : null;
                if (waitUntil) {
                    waitUntil(handleScheduled(fakeEvent, env, ctx, specifiedDate));
                    return new Response(JSON.stringify({ 
                        success: true, 
                        message: `Scheduled task started${specifiedDate ? ` for date: ${specifiedDate}` : ''}`,
                        date: specifiedDate || 'current date',
                        async: true,
                        timestamp: new Date().toISOString()
                    }), { 
                        status: 202, 
                        headers: { 'Content-Type': 'application/json; charset=utf-8' } 
                    });
                }
                const fakeCtx = { waitUntil: (promise) => promise };
                await handleScheduled(fakeEvent, env, fakeCtx, specifiedDate);
                return new Response(JSON.stringify({ 
                    success: true, 
                    message: `Scheduled task completed${specifiedDate ? ` for date: ${specifiedDate}` : ' for current date'}`,
                    date: specifiedDate || 'current date',
                    async: false,
                    timestamp: new Date().toISOString()
                }), { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json; charset=utf-8' } 
                });
            } catch (error) {
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: error.message,
                    date: specifiedDate || 'current date',
                    timestamp: new Date().toISOString()
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json; charset=utf-8' } 
                });
            }
        } else if (path === '/testTriggerBlog' && request.method === 'GET') {
            // Test endpoint for triggering blog generation task
            const secretKey = url.searchParams.get('key');
            const expectedKey = env.TEST_TRIGGER_SECRET || 'test-secret-key-change-me';
            if (secretKey !== expectedKey) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
            const dateParam = url.searchParams.get('date');
            const specifiedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
            const fakeEvent = { scheduledTime: Date.now(), cron: '0 16 * * *' };
            const fakeCtx = { waitUntil: (p) => p };
            try {
                await handleScheduledBlog(fakeEvent, env, fakeCtx, specifiedDate);
                return new Response(JSON.stringify({ success: true, message: 'Blog task done', date: specifiedDate || 'today' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // Authentication check for all other paths
        const { authenticated, cookie: newCookie } = await isAuthenticated(request, env);
        if (!authenticated) {
            // Redirect to login page, passing the original URL as a redirect parameter
            const loginUrl = new URL('/login', url.origin);
            loginUrl.searchParams.set('redirect', url.pathname + url.search);
            return Response.redirect(loginUrl.toString(), 302);
        }

        // Original routing logic for authenticated requests
        let response;
        try {
            if (path === '/writeData' && request.method === 'POST') {
                response = await handleWriteData(request, env);
            } else if ((path === '/getContentHtml' || path === '/') && request.method === 'GET') {
                // Prepare dataCategories for the HTML generation
                const dataCategories = Object.keys(dataSources).map(key => ({
                    id: key,
                    name: dataSources[key].name
                }));
                response = await handleGetContentHtml(request, env, dataCategories);
            } else if (path === '/genAIContent' && request.method === 'POST') {
                response = await handleGenAIContent(request, env);
            } else if (path === '/genAIPodcastScript' && request.method === 'POST') { // New route for podcast script
                response = await handleGenAIPodcastScript(request, env);
            } else if (path === '/genAIDailyAnalysis' && request.method === 'POST') { // New route for AI Daily Analysis
                response = await handleGenAIDailyAnalysis(request, env);
            } else if (path === '/genAIDailyPage' && request.method === 'GET') { // New route for AI Daily Page
                response = await handleGenAIDailyPage(request, env);
            } else if (path === '/commitToGitHub' && request.method === 'POST') {
                response = await handleCommitToGitHub(request, env);
            } else if (path === '/triggerScheduled' && request.method === 'GET') {
                // Manual trigger for scheduled task (for testing)
                // Support date parameter: ?date=2026-01-02
                const dateParam = url.searchParams.get('date');
                const specifiedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
                const fakeEvent = { scheduledTime: Date.now(), cron: '0 23 * * *' };
                const fakeCtx = { waitUntil: (promise) => promise };
                await handleScheduled(fakeEvent, env, fakeCtx, specifiedDate);
                response = new Response(JSON.stringify({ 
                    success: true, 
                    message: `Scheduled task triggered successfully${specifiedDate ? ` for date: ${specifiedDate}` : ''}`,
                    date: specifiedDate || 'current date',
                    timestamp: new Date().toISOString()
                }), { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json; charset=utf-8' } 
                });
            } else {
                return new Response(null, { status: 404, headers: {'Content-Type': 'text/plain; charset=utf-8'} });
            }
        } catch (e) {
            console.error("Unhandled error in fetch handler:", e);
            return new Response(`Internal Server Error: ${e.message}`, { status: 500 });
        }

        // Renew cookie for authenticated requests
        if (newCookie) {
            response.headers.append('Set-Cookie', newCookie);
        }
        return response;
    }
};
