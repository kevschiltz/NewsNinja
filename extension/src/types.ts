export interface Article { title: string; url: string; publisher: string; author: string; date: string; text: string; full_text: boolean }
export interface Source extends Article { id: string; summary: string; content_kind?: 'extracted'|'snippet'; same_publisher?: boolean }
export interface Finding { title: string; detail: string; evidence: { source_id: string; quote: string }[] }
export interface EntityFinding extends Finding { category?: 'person'|'organization'|'place'|'date'|'other' }
export interface ArticleAnalysis { summary: Finding[]; takeaways: Finding[]; entities: EntityFinding[]; claims: Finding[]; language: Finding[]; uncertainties: Finding[] }
export type Report = Record<'overview'|'missing'|'comparisons'|'bigger_picture', Finding[]> & {original_analysis?: ArticleAnalysis|null; additional_context?: Finding[]};
export interface Analysis { mode: 'live'|'demo'; article: Article; sources: Source[]; report: Report; limitations: string[]; broader_sources?: Source[] }
