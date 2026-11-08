import type { Article } from './types';
export async function extractArticle(): Promise<Article> {
  if (!globalThis.chrome?.runtime?.id) throw new Error('Open NewsNinja from the Chrome toolbar on a news article. You can also explore the demo below.');
  const sourceTabId = Number(new URLSearchParams(location.search).get('sourceTab'));
  if (!sourceTabId) throw new Error('Open a news article and click the NewsNinja toolbar icon.');
  let response;
  try{response=await chrome.runtime.sendMessage({type:'NN_EXTRACT',tabId:sourceTabId})}
  catch{throw new Error('Extension communication failed. Refresh the article after reloading NewsNinja, then reopen it from the toolbar.')}
  console.info('[NewsNinja access] extraction response',{received:!!response,ok:response?.ok,code:response?.code});
  if (!response?.ok) throw new Error(response?.error || 'NewsNinja was reloaded. Refresh the article and reopen the extension.');
  return response.article;
}
