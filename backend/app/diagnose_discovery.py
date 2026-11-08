"""Local-only CLI: query NewsAPI without spending OpenAI credits."""
import argparse
import asyncio
import json
from dotenv import load_dotenv
load_dotenv()
import httpx
from .discovery import search, discover_news, NewsAPIError
from .models import Article

async def run(args):
    async with httpx.AsyncClient(timeout=15) as http:
        if args.url and args.title:
            found=await discover_news(Article(title=args.title,url=args.url,date=args.date),args.query,http,args.max_queries)
            print(json.dumps({'same_event_count':len(found),'broader_topic_count':len(found.broader),'same_event':[s.model_dump(mode='json') for s in found], 'broader_topic':[s.model_dump(mode='json') for s in found.broader], 'diagnostics':found.diagnostics},indent=2))
        else:
            rows,status=await search(http,args.query)
            print(json.dumps({'http_status':status,'raw_count':len(rows),'articles':[{'title':r.get('title'),'url':r.get('url'),'publishedAt':r.get('publishedAt'),'source':r.get('source')} for r in rows[:5]]},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--query',required=True);parser.add_argument('--title');parser.add_argument('--url');parser.add_argument('--date',default='');parser.add_argument('--max-queries',type=int,choices=[1,2,3],default=1)
    args=parser.parse_args()
    try: asyncio.run(run(args))
    except NewsAPIError as exc: parser.exit(1,exc.public_message+'\n')
