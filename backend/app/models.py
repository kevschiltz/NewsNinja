from typing import Literal
from pydantic import BaseModel, Field, HttpUrl

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

class Finding(BaseModel):
    title: str
    detail: str
    evidence: list[Evidence]

class Source(Article):
    id: str
    summary: str = ''
    content_kind: Literal['extracted', 'snippet'] = 'snippet'

class Report(BaseModel):
    overview: list[Finding]
    missing: list[Finding]
    comparisons: list[Finding]
    bigger_picture: list[Finding]

class Analysis(BaseModel):
    mode: Literal['live', 'demo']
    article: Article
    sources: list[Source]
    report: Report
    limitations: list[str]

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
