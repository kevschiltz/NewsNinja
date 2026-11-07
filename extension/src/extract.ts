import type { Article } from './types';
export async function extractArticle(): Promise<Article> {
  if (!globalThis.chrome?.scripting) throw new Error('Open NewsNinja from the Chrome toolbar on a news article. You can also explore the demo below.');
  const sourceTabId = Number(new URLSearchParams(location.search).get('sourceTab'));
  if (!sourceTabId) throw new Error('Open a news article and click the NewsNinja toolbar icon.');
  const results = await chrome.scripting.executeScript({ target: { tabId: sourceTabId }, func: () => {
    const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
    const root = document.querySelector('article') || document.querySelector('main');
    const text = Array.from(root?.querySelectorAll('p') || []).map(p => p.textContent?.trim()).filter(Boolean).join('\n').slice(0, 50000);
    return { title: meta('og:title') || document.querySelector('h1')?.textContent?.trim() || document.title,
      publisher: meta('og:site_name') || location.hostname, author: meta('author'),
      date: meta('article:published_time') || document.querySelector('time')?.getAttribute('datetime') || '',
      url: location.href, text, full_text: false };
  }});
  const article = results[0]?.result;
  if (!article || article.text.length < 200) throw new Error('Not enough readable article text. The page may be paywalled, blocked, or not an article. Try another news page.');
  return article;
}
