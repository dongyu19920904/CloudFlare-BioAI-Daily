// src/handlers/writeData.js
import { getISODate, getFetchDate, setFetchDate } from '../helpers.js';
import { fetchAllData, fetchDataByCategory, dataSources } from '../dataFetchers.js'; // 导入 fetchDataByCategory 和 dataSources
import { storeInKV } from '../kv.js';

export async function handleWriteData(request, env) {
    // Always anchor to当天日期（上海时区），避免出现 1970-01-01 之类的错误值。
    // 如需指定其他日期，可后续再扩展请求体参数。
    const dateParam = getFetchDate();
    const todayStr = getISODate();
    const dateStr =
        (dateParam && dateParam !== '1970-01-01') ? dateParam : todayStr;
    setFetchDate(dateStr);
    console.log(`Starting /writeData process for date: ${dateStr}`);
    let category = null;
    let foloCookie = null;
    
    try {
        // 尝试解析请求体，获取 category 参数
        if (request.headers.get('Content-Type')?.includes('application/json')) {
            const requestBody = await request.json();
            category = requestBody.category;
            foloCookie = requestBody.foloCookie; // 获取 foloCookie
        }

        // 如果前端提供了 Folo Cookie，则持久化到 KV，供定时任务自动抓取使用
        if (foloCookie && env.FOLO_COOKIE_KV_KEY) {
            try {
                await storeInKV(env.DATA_KV, env.FOLO_COOKIE_KV_KEY, foloCookie, 86400 * 30); // 30 天
                console.log(`Saved Folo cookie to KV with key: ${env.FOLO_COOKIE_KV_KEY}`);
            } catch (err) {
                console.warn(`Failed to save Folo cookie to KV: ${err.message}`);
            }
        }

        console.log(`Starting /writeData process for category: ${category || 'all'} with foloCookie presence: ${!!foloCookie}`);

        let dataToStore = {};
        let fetchPromises = [];
        let successMessage = '';

        if (category) {
            // 只抓取指定分类的数据
            const fetchedData = await fetchDataByCategory(env, category, foloCookie); // 传递 foloCookie
            dataToStore[category] = fetchedData;
            fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${category}`, fetchedData));
            successMessage = `Data for category '${category}' fetched and stored.`;
            console.log(`Transformed ${category}: ${fetchedData.length} items.`);
        } else {
            // 抓取所有分类的数据 (现有逻辑)
            const allUnifiedData = await fetchAllData(env, foloCookie); // 传递 foloCookie
            
            for (const sourceType in dataSources) {
                if (Object.hasOwnProperty.call(dataSources, sourceType)) {
                    dataToStore[sourceType] = allUnifiedData[sourceType] || [];
                    fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, dataToStore[sourceType]));
                    console.log(`Transformed ${sourceType}: ${dataToStore[sourceType].length} items.`);
                }
            }
            successMessage = `All data categories fetched and stored.`;
        }

        await Promise.all(fetchPromises);

        const errors = []; // Placeholder for potential future error aggregation from fetchAllData or fetchDataByCategory

        if (errors.length > 0) {
            console.warn("/writeData completed with errors:", errors);
            return new Response(JSON.stringify({ 
                success: false, 
                message: `${successMessage} Some errors occurred.`, 
                errors: errors, 
                ...Object.fromEntries(Object.entries(dataToStore).map(([key, value]) => [`${key}ItemCount`, value.length]))
            }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        } else {
            console.log("/writeData process completed successfully.");
            return new Response(JSON.stringify({ 
                success: true, 
                message: successMessage,
                ...Object.fromEntries(Object.entries(dataToStore).map(([key, value]) => [`${key}ItemCount`, value.length]))
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        console.error("Unhandled error in /writeData:", error);
        return new Response(JSON.stringify({ success: false, message: "An unhandled error occurred during data processing.", error: error.message, details: error.stack }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
