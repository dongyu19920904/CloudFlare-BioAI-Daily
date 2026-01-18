export async function handleTestTriggerBlog(request, env, ctx, blogHandler) {
    const url = new URL(request.url);
    const secretKey = url.searchParams.get('key');
    const expectedKey = env.TEST_TRIGGER_SECRET || 'test-secret-key-change-me';
    if (secretKey !== expectedKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const dateParam = url.searchParams.get('date');
    const forceSync = url.searchParams.get('sync') === '1';
    const specifiedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
    const fakeEvent = { scheduledTime: Date.now(), cron: '0 16 * * *' };

    const handler = blogHandler;
    const waitUntil = ctx && typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : null;
    if (waitUntil && !forceSync) {
        waitUntil(handler(fakeEvent, env, ctx, specifiedDate));
        return new Response(JSON.stringify({
            success: true,
            message: `Blog task started${specifiedDate ? ` for date: ${specifiedDate}` : ''}`,
            date: specifiedDate || 'today',
            async: true,
            timestamp: new Date().toISOString()
        }), {
            status: 202,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    try {
        const fakeCtx = { waitUntil: (promise) => promise };
        const result = await handler(fakeEvent, env, fakeCtx, specifiedDate);
        return new Response(JSON.stringify({
            success: result?.success ?? true,
            message: `Blog task completed${specifiedDate ? ` for date: ${specifiedDate}` : ''}`,
            date: specifiedDate || 'today',
            async: false,
            result,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
