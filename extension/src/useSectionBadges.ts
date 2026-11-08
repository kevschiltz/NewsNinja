import {useEffect,useState} from 'react';
import type {Analysis} from './types';
export type Section='overview'|'missing'|'comparisons'|'bigger_picture';

// Count actual findings/articles; never show a notification for an empty section.
export function sectionCounts(result:Analysis|null):Record<Section,number>{
  if(!result)return {overview:0,missing:0,comparisons:0,bigger_picture:0};
  const report=result.report;
  const original=report.original_analysis;
  const originalCount=original?Object.values(original).reduce((sum,findings)=>sum+findings.length,0):0;
  return {
    overview:originalCount+report.overview.length,
    missing:report.missing.length+(report.additional_context?.length||0),
    comparisons:report.comparisons.length+result.sources.length+(result.broader_sources?.length||0),
    bigger_picture:report.bigger_picture.length,
  };
}
export function useSectionBadges(result:Analysis|null){
  const [viewed,setViewed]=useState<Set<Section>>(()=>new Set());
  useEffect(()=>{setViewed(new Set())},[result]);
  const counts=sectionCounts(result);
  return {
    unread:(section:Section)=>viewed.has(section)?0:counts[section],
    markRead:(section:Section)=>setViewed(previous=>new Set([...previous,section])),
    resetUnread:()=>setViewed(new Set<Section>()),
  };
}
