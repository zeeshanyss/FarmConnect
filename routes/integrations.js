"use strict";
const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const User = require("../models/User");
const fs = require("fs");
const path = require("path");

// Curated catalogue: links must be added only after checking original publisher and embedding rights.
router.get("/learning", (req,res) => {
  const file = path.join(__dirname, "../data/learning.json");
  const videos = JSON.parse(fs.readFileSync(file,"utf8"));
  res.json({ videos, updatedAt: null, note: "Only reviewed publisher links are displayed; catalogue is empty until configured." });
});

// Never treat phone OTP as proof of identity, farmer occupation, or land ownership.
router.get("/verification/me", requireAuth, async (req,res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({error:"Account not found"});
    const v = user.verification || {};
    res.set("Cache-Control","no-store");
    res.json({ role:user.role, accountId:String(user._id), checks:{
      phone: v.phone || "not_checked", identity: v.identity || "not_checked",
      farmer: v.farmer || "not_checked", landholding: v.landholding || "not_checked",
      business: v.business || "not_checked"
    }, verified: v.status === "verified", status:v.status || "not_started",
    note:"Verified status requires a server-validated authorized provider result." });
  } catch(e) { res.status(500).json({error:"Unable to load verification status"}); }
});

// PIB publishes an official RSS directory: https://www.pib.gov.in/ViewRss.aspx?lang=1&reg=1
const DEFAULT_FEED = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1";
const ALLOWED = new Set(["pib.gov.in", "www.pib.gov.in", "icar.gov.in", "www.icar.gov.in", "agriwelfare.gov.in", "www.agriwelfare.gov.in"]);
const cache = {url:null, at:0, items:[]};
function decode(s="") { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]+>/g,"").trim(); }
function tag(block,name) { const m=block.match(new RegExp("<(?:[\\w-]+:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?"+name+">","i")); return m?decode(m[1]):""; }
const agri = /agricultur|farmer|farming|kisan|crop|soil|fertili[sz]|harvest|mandi|horticultur|irrigat|rabi|kharif|icar|dare|foodgrain|natural farming|krishi|livestock|dairy|fishery|fisheries|rural development|pm-kisan|agri-/i;
router.get("/news", async (req,res) => {
  const configured=process.env.OFFICIAL_AGRI_RSS_URL || DEFAULT_FEED;
  let url;
  try {url=new URL(configured); if(url.protocol!=="https:" || !ALLOWED.has(url.hostname.toLowerCase()) || url.username || url.password) throw Error();}
  catch {return res.status(503).json({articles:[],status:"invalid_configuration",message:"Use an approved HTTPS government RSS source."});}
  if(cache.url===url.href && Date.now()-cache.at<20*60*1000) return res.json({articles:cache.items,source:url.hostname,status:"cached",fetchedAt:new Date(cache.at).toISOString()});
  try {
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),12000);
    let response;
    try { response=await fetch(url,{signal:controller.signal,redirect:"follow",headers:{Accept:"application/rss+xml, application/xml, text/xml, */*", "User-Agent":"FarmConnect/1.0 (+official-public-feed-reader)"}}); }
    finally {clearTimeout(timeout);}
    if(!response.ok || !ALLOWED.has(new URL(response.url).hostname.toLowerCase())) throw Error("Source unavailable or unexpected redirect");
    const xml=await response.text(); if(xml.length>2500000 || !/<(?:rss|rdf:RDF|feed)[\s>]/i.test(xml)) throw Error("Invalid feed");
    const blocks=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,150);
    const articles=blocks.map(x=>({title:tag(x[1],"title"),url:tag(x[1],"link"),publishedAt:tag(x[1],"pubDate"),summary:tag(x[1],"description").slice(0,350),source:"Press Information Bureau"})).filter(a=>{
      if(!a.title || !agri.test(a.title+" "+a.summary)) return false;
      try {const u=new URL(a.url); return u.protocol==="https:" && ALLOWED.has(u.hostname.toLowerCase());}catch{return false;}
    }).slice(0,30);
    cache.url=url.href;cache.at=Date.now();cache.items=articles;
    res.json({articles,source:"Press Information Bureau",status:articles.length?"updated":"no_matching_articles",fetchedAt:new Date(cache.at).toISOString(),message:articles.length?null:"No agriculture-related items in the currently returned official RSS batch."});
  } catch(e) {res.status(503).json({articles:cache.url===url.href?cache.items:[],source:"Press Information Bureau",status:"source_unavailable",fetchedAt:cache.at?new Date(cache.at).toISOString():null,message:"Official RSS feed could not be fetched. Please retry later."});}
});
module.exports=router;
