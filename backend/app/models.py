from typing import Literal
from pydantic import BaseModel, Field, HttpUrl, field_validator

class Article(BaseModel):
    title: str = Field(min_length=3, max_length=500)
    url: HttpUrl
    publisher: str = Field(default='', max_length=200)
    author: str = Field(default='', max_length=300)
    date: str = Field(default='', max_length=100)
    text: str = Field(default='', max_length=60000)
    full_text: bool = False

class AnalyzeRequest(BaseModel):
    article: Article

class Evidence(BaseModel):
    source_id: str
    quote: str
    excerpt_id: str | None = None

class Finding(BaseModel):
    title: str
    detail: str
    evidence: list[Evidence]

class Source(Article):
    id: str
    summary: str = ''
    same_publisher: bool = False
    content_kind: Literal['extracted', 'snippet'] = 'snippet'

class EntityFinding(Finding):
    category: Literal['person','organization','place','date','other'] = 'other'

class ArticleAnalysis(BaseModel):
    summary: list[Finding]
    takeaways: list[Finding]
    entities: list[EntityFinding]
    claims: list[Finding]
    language: list[Finding]
    uncertainties: list[Finding]

    @field_validator('entities', mode='before')
    @classmethod
    def accept_legacy_findings(cls, value):
        if isinstance(value, list):
            return [item.model_dump() if isinstance(item, Finding) else item for item in value]
        return value

class Report(BaseModel):
    original_analysis: ArticleAnalysis | None = None
    overview: list[Finding]
    missing: list[Finding]
    additional_context: list[Finding] = Field(default_factory=list)
    comparisons: list[Finding]
    bigger_picture: list[Finding]

class Analysis(BaseModel):
    mode: Literal['live', 'demo']
    article: Article
    sources: list[Source]
    report: Report
    limitations: list[str]
    broader_sources: list[Source] = Field(default_factory=list)
    discovery_diagnostics: dict | None = None

class Topic(BaseModel):
    query: str

class Selection(BaseModel):
    source_ids: list[str]

class SourceSummary(BaseModel):
    source_id: str
    summary: str

class Draft(BaseModel):
    report: Report
    summaries: list[SourceSummary]
