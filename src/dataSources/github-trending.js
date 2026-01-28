// src/dataSources/projects.js
import { fetchData, getISODate, removeMarkdownCodeBlock, formatDateToChineseWithTime, escapeHtml, isDateWithinLastDays, getFetchDate } from '../helpers.js';
import { callChatAPI } from '../chatapi.js';
import { getFromKV } from '../kv.js';

const MIN_STARS = 100;
const ACTIVE_DAYS = 30;

const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
};

const getLastActivityAt = (project) => {
    const updatedAtTime = project.updatedAt ? new Date(project.updatedAt).getTime() : null;
    const pushedAtTime = project.pushedAt ? new Date(project.pushedAt).getTime() : null;

    if (Number.isFinite(updatedAtTime) && Number.isFinite(pushedAtTime)) {
        return updatedAtTime >= pushedAtTime ? project.updatedAt : project.pushedAt;
    }
    if (Number.isFinite(updatedAtTime)) return project.updatedAt;
    if (Number.isFinite(pushedAtTime)) return project.pushedAt;
    return null;
};

const ProjectsDataSource = {
    fetch: async (env) => {
        console.log(`Fetching projects from: ${env.PROJECTS_API_URL}`);
        const resolvedDate = getFetchDate() || getISODate();
        const baseDate = new Date(`${resolvedDate}T00:00:00+08:00`);
        const yesterdayDate = getISODate(new Date(baseDate.getTime() - 24 * 60 * 60 * 1000));
        const urlList = String(env.PROJECTS_API_URL || "")
            .split(/\s*\|\s*|\r?\n/)
            .map((url) => url.trim())
            .filter(Boolean);
        const resolvedUrlList = urlList.map((url) => {
            if (!resolvedDate) return url;
            return url
                .replaceAll("{date}", resolvedDate)
                .replaceAll("{today}", resolvedDate)
                .replaceAll("{yesterday}", yesterdayDate);
        });
        if (urlList.length === 0) {
            return { error: "PROJECTS_API_URL is not set", items: [] };
        }

        const normalizeProjects = (raw) => {
            if (Array.isArray(raw)) return raw;
            if (raw && Array.isArray(raw.items)) {
                // Support GitHub Search API format: { items: [...] }
                return raw.items.map((item) => ({
                    name: item.full_name || item.name,
                    url: item.html_url || item.url,
                    description: item.description || "",
                    owner: item.owner?.login || item.owner?.name || "",
                    language: item.language || "",
                    languageColor: null,
                    totalStars: item.stargazers_count ?? item.watchers_count ?? null,
                    forks: item.forks_count ?? null,
                    starsToday: null,
                    updatedAt: item.updated_at ?? item.updatedAt ?? null,
                    pushedAt: item.pushed_at ?? item.pushedAt ?? null,
                    builtBy: []
                }));
            }
            return null;
        };

        const projectsByKey = new Map();
        const errors = [];

        for (const url of resolvedUrlList) {
            let fetchOptions = {};
            try {
                const parsedUrl = new URL(url);
                const headers = {
                    "User-Agent": "BioAI-Daily-Worker",
                    "Accept": "application/vnd.github+json"
                };
                if (parsedUrl.hostname === "api.github.com" && env.GITHUB_TOKEN) {
                    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
                }
                fetchOptions = { headers };
            } catch (e) {
                // Keep default options if URL parsing fails
            }
            let projects;
            try {
                projects = await fetchData(url, fetchOptions);
            } catch (error) {
                errors.push({ url, message: error.message });
                continue;
            }

            const normalizedProjects = normalizeProjects(projects);
            if (!normalizedProjects) {
                errors.push({ url, message: "Invalid projects data format", received: projects });
                continue;
            }

            normalizedProjects.forEach((project) => {
                const key = project.url || project.name || `${project.owner || ''}/${project.name || ''}`;
                if (key && !projectsByKey.has(key)) {
                    projectsByKey.set(key, project);
                }
            });
        }

        let projects = Array.from(projectsByKey.values());
        if (projects.length === 0) {
            console.error("No projects fetched from API.", errors);
            return { error: "No projects fetched", details: errors, items: [] };
        }

        projects = projects
            .map((project) => ({
                ...project,
                lastActivityAt: getLastActivityAt(project)
            }))
            .filter((project) => {
                if (toNumber(project.totalStars) < MIN_STARS) return false;
                if (!project.lastActivityAt) return false;
                return isDateWithinLastDays(project.lastActivityAt, ACTIVE_DAYS);
            });

        if (projects.length === 0) {
            console.warn(`No projects matched filters (stars>=${MIN_STARS}, active within ${ACTIVE_DAYS} days).`);
            return [];
        }

        if (env.DATA_KV) {
            try {
                const previousProjects = await getFromKV(env.DATA_KV, `${yesterdayDate}-project`);
                const previousUrls = new Set(
                    (previousProjects || [])
                        .map((item) => item?.url)
                        .filter(Boolean)
                );
                if (previousUrls.size > 0) {
                    const uniqueProjects = projects.filter((project) => !previousUrls.has(project.url));
                    if (uniqueProjects.length > 0) {
                        if (uniqueProjects.length < projects.length) {
                            console.log(`Filtered ${projects.length - uniqueProjects.length} projects duplicated with ${yesterdayDate}.`);
                        }
                        projects = uniqueProjects;
                    } else {
                        console.warn(`All projects duplicated with ${yesterdayDate}; keeping original list.`);
                    }
                }
            } catch (dedupeError) {
                console.warn(`Project de-duplication skipped: ${dedupeError.message}`);
            }
        }

        if (String(env.OPEN_TRANSLATE).toLowerCase() !== "true") {
            console.warn("Skipping project translations.");
            return projects.map(p => ({ ...p, description_zh: p.description || "" }));
        }

        const descriptionsToTranslate = projects
            .map(p => p.description || "")
            .filter(desc => typeof desc === 'string');

        const nonEmptyDescriptions = descriptionsToTranslate.filter(d => d.trim() !== "");
        if (nonEmptyDescriptions.length === 0) {
            console.log("No non-empty project descriptions to translate.");
            return projects.map(p => ({ ...p, description_zh: p.description || "" }));
        }
        const promptText = `Translate the following English project descriptions to Chinese.
Provide the translations as a JSON array of strings, in the exact same order as the input.
Each string in the output array must correspond to the string at the same index in the input array.
If an input description is an empty string, the corresponding translated string in the output array should also be an empty string.
Input Descriptions (JSON array of strings):
${JSON.stringify(descriptionsToTranslate)}
Respond ONLY with the JSON array of Chinese translations. Do not include any other text or explanations.
JSON Array of Chinese Translations:`;

        let translatedTexts = [];
        try {
            console.log(`Requesting translation for ${descriptionsToTranslate.length} project descriptions.`);
            const chatResponse = await callChatAPI(env, promptText);
            const parsedTranslations = JSON.parse(removeMarkdownCodeBlock(chatResponse)); // Assuming direct JSON array response

            if (parsedTranslations && Array.isArray(parsedTranslations) && parsedTranslations.length === descriptionsToTranslate.length) {
                translatedTexts = parsedTranslations;
            } else {
                console.warn(`Translation count mismatch or parsing error for project descriptions. Expected ${descriptionsToTranslate.length}, received ${parsedTranslations ? parsedTranslations.length : 'null'}. Falling back.`);
                translatedTexts = descriptionsToTranslate.map(() => null);
            }
        } catch (translationError) {
            console.error("Failed to translate project descriptions in batch:", translationError.message);
            translatedTexts = descriptionsToTranslate.map(() => null);
        }

        return projects.map((project, index) => {
            const translated = translatedTexts[index];
            return {
                ...project,
                description_zh: (typeof translated === 'string') ? translated : (project.description || "")
            };
        });
    },
    transform: (projectsData, sourceType) => {
        const unifiedProjects = [];
        const now = getISODate();
        if (Array.isArray(projectsData)) {
            projectsData.forEach((project, index) => {
                unifiedProjects.push({
                    id: index + 1, // Use project.url as ID if available
                    type: sourceType,
                    url: project.url,
                    title: project.name,
                    description: project.description_zh || project.description || "",
                    published_date: project.lastActivityAt || project.pushedAt || project.updatedAt || now,
                    authors: project.owner ? [project.owner] : [],
                    source: "GitHub Trending",
                    details: {
                        owner: project.owner,
                        name: project.name,
                        language: project.language,
                        languageColor: project.languageColor,
                        totalStars: project.totalStars,
                        forks: project.forks,
                        starsToday: project.starsToday,
                        builtBy: project.builtBy || []
                    }
                });
            });
        }
        return unifiedProjects;
    },

    generateHtml: (item) => {
        return `
            <strong>${escapeHtml(item.title)}</strong> (所有者: ${escapeHtml(item.details.owner)})<br>
            <small>星标: ${escapeHtml(item.details.totalStars)} (今日: ${escapeHtml(item.details.starsToday)}) | 语言: ${escapeHtml(item.details.language || 'N/A')}</small>
            描述: ${escapeHtml(item.description) || 'N/A'}<br>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">在 GitHub 上查看</a>
        `;
    }
};

export default ProjectsDataSource;
