export function insertAd() {
    return `
---

## **AI 账号极速发货: [爱窝啦 Aivora ⬆️](https://aivora.cn)**

想快速体验 ChatGPT、Cursor、Claude、Gemini、Codex、Grok、Perplexity 等主流 AI 工具？**爱窝啦 Aivora** 提供 AI 账号、镜像入口、中转额度和编程工具方案。

✅ **24h 自助**：官网下单，卡密秒发，适合先低成本试用。
✅ **按场景选**：官方号、镜像站、Cursor 激活器/换号器、Codex/Claude 中转、三合一额度包。
✅ **覆盖开发与内容**：Codex、Cursor、Claude、Gemini、ChatGPT、Grok、Perplexity、Consensus 等常用方向。
✅ **中文售后**：教程、入口、额度和常见问题有说明，遇到问题可联系群主处理。

🚀 **访问 [aivora.cn](https://aivora.cn) 查看当前可下单商品。**
    `;
}

const MID_SOFT_AD = `> 💡 **提示**：想体验文中提到的 GPT、Claude、Gemini、Codex、Cursor、Grok 等工具，但不想折腾海外支付、注册、额度和教程？来 [**爱窝啦 Aivora**](https://aivora.cn?utm_source=daily_news&utm_medium=mid_ad&utm_campaign=content) 按场景选择官方号、镜像、Cursor 方案或中转入口，官网自助下单，卡密秒发。`;

/**
 * 将中插软广注入到 AI 生成的 Markdown 中：
 * - 如果已有 mid_ad UTM 则不重复插入
 * - 默认插入在 “产品与功能更新” 标题后；若未找到，则追加在文首
 */
export function insertMidAd(markdown = '') {
    if (typeof markdown !== 'string' || markdown.includes('utm_medium=mid_ad')) {
        return markdown;
    }
    const heading = '### **产品与功能更新**';
    const midAdBlock = `${heading}\n\n${MID_SOFT_AD}\n`;

    if (markdown.includes(heading)) {
        return markdown.replace(heading, midAdBlock);
    }
    return `${MID_SOFT_AD}\n\n${markdown}`;
}
