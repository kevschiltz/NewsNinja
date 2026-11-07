export interface Article { title: string; url: string; publisher: string; author: string; date: string; text: string; full_text: boolean }
export interface Source extends Article { id: string; summary: string; content_kind?: 'extracted'|'snippet' }
export interface Finding { title: string; detail: string; evidence: { source_id: string; quote: string }[] }
export type Report = Record<'overview'|'missing'|'comparisons'|'bigger_picture', Finding[]>;
export interface Analysis { mode: 'live'|'demo'; article: Article; sources: Source[]; report: Report; limitations: string[] }
