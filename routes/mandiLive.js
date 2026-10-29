const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const RESOURCE = '35985678-0d79-46b4-9ed6-6f13308a1d24';
const cache = new Map();
const fs = require("fs");
const path = require("path");

// MANDI_DISK_FALLBACK_V1
const mandiCacheDir = path.join(__dirname, "../data/mandi-cache");

function fallbackFile(cacheKey) {
  const hash = require("crypto")
    .createHash("sha256")
    .update(cacheKey)
    .digest("hex");

  return path.join(mandiCacheDir, hash + ".json");
}

function saveLastSuccessful(cacheKey, value) {
  try {
    fs.mkdirSync(mandiCacheDir, { recursive: true });
    fs.writeFileSync(
      fallbackFile(cacheKey),
      JSON.stringify(value),
      { mode: 0o600 }
    );
  } catch (error) {
    console.error("Mandi cache save failed:", error.message);
  }
}

function getLastSuccessful(cacheKey) {
  try {
    const file = fallbackFile(cacheKey);
    if (!fs.existsSync(file)) return null;

    const value = JSON.parse(fs.readFileSync(file, "utf8"));

    if (!Array.isArray(value.records) || !value.fetchedAt) {
      return null;
    }

    return {
      ...value,
      cached: true,
      stale: true,
      temporarilyUnavailable: true,
      sourceType: "previously fetched official published data",
      warning: "Official mandi API is unavailable. Showing previously fetched data, NOT live prices."
    };
  } catch (error) {
    console.error("Mandi fallback read failed:", error.message);
    return null;
  }
}
router.get('/', requireAuth, async (req,res) => {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) return res.status(503).json({error:'DATA_GOV_IN_API_KEY is not configured on the server.'});
  const crop = String(req.query.crop||'').trim();
  const offset = Math.min(100000,Math.max(0,parseInt(req.query.offset,10)||0));
  const limit = 100;
  const state = String(req.query.state||'').trim();
  const district = String(req.query.district||'').trim();
  const market = String(req.query.market||'').trim();
  const selectedDate = String(req.query.date||'').trim();
  if (selectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return res.status(400).json({error:'Invalid date format. Use YYYY-MM-DD.'});
  }
  if (selectedDate) {
    const parsed = new Date(selectedDate + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==selectedDate) {
      return res.status(400).json({error:'Invalid calendar date.'});
    }
  }
  if (crop.length>80 || [state,district,market].some(s=>s.length>80)) return res.status(400).json({error:'Filter values must be up to 80 characters.'});
  const resource = process.env.DATA_GOV_IN_RESOURCE_ID || RESOURCE;
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(resource)) return res.status(503).json({error:'Invalid mandi dataset resource ID configuration.'});
  const params = new URLSearchParams({ 'api-key':key, format:'json', limit:String(limit), offset:String(offset) });
  if (crop) params.set('filters[Commodity]',crop);
  if (state) params.set('filters[State]',state);
  if (district) params.set('filters[District]',district);
  if (market) params.set('filters[Market]',market);
  params.set('sort[Arrival_Date]', 'desc');
  if (selectedDate) {
    const [yyyy,mm,dd] = selectedDate.split('-');
    params.set('filters[Arrival_Date]', `${dd}/${mm}/${yyyy}`);
  }
  const cacheKey = resource + ':' + params.toString().replace(key,'[REDACTED]');
  const cached=cache.get(cacheKey);
  if (cached && Date.now()-cached.at < 15*60*1000) return res.json({...cached.value, cached:true});
  try {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    let response;
    try { response=await fetch(`https://api.data.gov.in/resource/${resource}?${params}`,{signal:controller.signal,headers:{Accept:'application/json'}}); }
    finally { clearTimeout(timeout); }
    if (!response.ok) {
  console.error("Official Mandi API HTTP error:", response.status);

  if (response.status >= 500) {
    const fallback = getLastSuccessful(cacheKey);
    if (fallback) return res.json(fallback);
  }

  return res.status(502).json({
    success: false,
    source: "data.gov.in",
    upstreamStatus: response.status,
    temporarilyUnavailable: response.status >= 500,
    error: response.status >= 500
      ? "Official government mandi data service is temporarily unavailable. Please try again later."
      : "Unable to retrieve mandi prices from the official data source."
  });
}
    const data=await response.json();
    if (!Array.isArray(data.records)) return res.status(502).json({error:'Unexpected response from official data source. Check dataset API URL/resource ID.'});
    const records=data.records.map(r=>({state:r.State||'',district:r.District||'',market:r.Market||'',commodity:r.Commodity||'',variety:r.Variety||'',arrivalDate:r.Arrival_Date||'',minPrice:r.Min_Price??null,maxPrice:r.Max_Price??null,modalPrice:r.Modal_Price??null}));
    const value={source:'data.gov.in',sourceType:'latest available published data (not streaming real-time)',fetchedAt:new Date().toISOString(),total:data.total??null,count:records.length,offset,limit,hasMore:records.length===limit && (data.total==null || offset+records.length<Number(data.total)),records};
    if(cache.size>100)cache.clear();
cache.set(cacheKey,{at:Date.now(),value});
saveLastSuccessful(cacheKey,value);
    return res.json(value);
  } catch(e) {
    console.error("Mandi fetch failed:", e.message);

    const fallback = getLastSuccessful(cacheKey);
    if (fallback) return res.json(fallback);

    return res.status(502).json({
      success: false,
      temporarilyUnavailable: true,
      error: "Official mandi data is currently unavailable. No previously fetched prices are saved for these filters."
    });
  }
});
// Dedicated state-dependent district selector. Names are drawn from published mandi records,
// not represented as a complete administrative district directory.
router.get('/districts',requireAuth,async(req,res)=>{
  const key=process.env.DATA_GOV_IN_API_KEY, state=String(req.query.state||'').trim();
  if(!key)return res.status(503).json({error:'Mandi API key not configured.'});
  if(!state || state.length>80)return res.status(400).json({error:'Choose a valid state.'});
  const resource=process.env.DATA_GOV_IN_RESOURCE_ID||RESOURCE;
  if(!/^[a-zA-Z0-9-]{20,80}$/.test(resource))return res.status(503).json({error:'Invalid resource ID.'});
  const cacheKey='districts:'+resource+':'+state.toLowerCase(), old=cache.get(cacheKey);
  if(old && Date.now()-old.at<60*60*1000)return res.json({...old.value,cached:true});
  try{
    const fetchPage=async(offset)=>{
      const params=new URLSearchParams({'api-key':key,format:'json',limit:'1000',offset:String(offset),'filters[State]':state});
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
      try{const response=await fetch(`https://api.data.gov.in/resource/${resource}?${params}`,{signal:controller.signal,headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error('Official API returned HTTP '+response.status);
        const data=await response.json();if(!Array.isArray(data.records))throw new Error('Unexpected official API response');return data;
      }finally{clearTimeout(timer);}
    };
    const first=await fetchPage(0), total=Number(first.total)||first.records.length;
    const pages=[first];
    // Fetch a bounded sample in parallel; no claim that this is a complete district directory.
    if(first.records.length>=1000){const offsets=[1000,2000,3000,4000].filter(n=>n<total);const more=await Promise.allSettled(offsets.map(fetchPage));more.forEach(x=>{if(x.status==='fulfilled')pages.push(x.value);});}
    const names=[...new Set(pages.flatMap(x=>x.records).map(x=>String(x.District||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const sampled=pages.reduce((n,x)=>n+x.records.length,0);
    const value={state,districts:names,source:'data.gov.in published mandi records',sampled,partial:sampled<total};
    if(cache.size>100)cache.clear();
cache.set(cacheKey,{at:Date.now(),value});
res.json(value);
  }catch(e){console.error('Mandi district fetch failed:',e.message);res.status(502).json({error:'District suggestions unavailable from official mandi records. Use manual entry.'});}
});
module.exports=router;




