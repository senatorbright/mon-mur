"use strict";
const $ = s => document.querySelector(s), msg = (text, error=false) => { $("#message").textContent=text; $("#message").className=error?"error":""; };
let tab, page, links=[], extensionState, pendingSource, globalSiteAccess=false;
function permissionOriginPattern(url) { const u=new URL(url); return `${u.protocol}//${u.host}/*`; }
function domainPermission(url) { return globalSiteAccess ? Promise.resolve(true) : browser.permissions.request({origins:[permissionOriginPattern(url)]}); }
function friendlyError(error){const original=String(error||"Erreur inconnue"),s=original.toLowerCase();if(/^permission refused$/.test(s)||/^autorisation du site refusée\.?$/.test(s))return"Firefox n’a pas accordé l’accès à cette page.";if(/certificate|certificat|ssl|tls|cert_common_name_invalid|sec_error|err_cert/.test(s))return"Connexion sécurisée impossible. Le certificat du site présente un problème.";if(/dns|network|failed to fetch|inaccessible|timeout|timed out|http 4\d\d|http 5\d\d/.test(s))return"Impossible de contacter ce site. Vérifiez son adresse ou réessayez plus tard.";if(/no usable|no articles/.test(s))return"Aucune fiche exploitable n'a pu être trouvée sur ce site.";return`La vérification a échoué : ${original.slice(0,400)}`;}
function showError(error,diagnostic=""){console.error("Échec de l'ajout ou de la validation de source",error,{globalSiteAccess,tabUrl:tab?.url,diagnostic});msg(`${friendlyError(error)}${diagnostic?` [${diagnostic}; accès global vu par le panneau : ${globalSiteAccess?"oui":"non"}]`:""}`,true);}
async function openWall() {
  const button=$("#openWall"), wallUrl=browser.runtime.getURL("wall.html"), target=new URL(wallUrl);
  button.disabled=true;
  button.textContent="Ouverture…";
  try {
    const tabs=await browser.tabs.query({});
    const existing=tabs.find(candidate=>{
      try { const url=new URL(candidate.url); return url.origin===target.origin&&url.pathname===target.pathname; }
      catch { return false; }
    });
    if(existing) await browser.tabs.update(existing.id,{active:true});
    else await browser.tabs.create({url:wallUrl,active:true});
    window.close();
  } catch(error) {
    button.disabled=false;
    button.textContent="Ouvrir Mon Mur";
    msg(`Impossible d’ouvrir Mon Mur : ${error.message||error}`,true);
  }
}
async function init() {
  globalSiteAccess=await browser.permissions.contains({origins:["<all_urls>"]});
  extensionState=await browser.runtime.sendMessage({type:"state"});
  $("#openWall").textContent="Ouvrir Mon Mur";
  // L’ouverture du mur doit fonctionner quelle que soit la page active,
  // y compris about:newtab ou une page interne de Firefox.
  $("#openWall").onclick=openWall;
  [tab] = await browser.tabs.query({active:true,currentWindow:true});
  if (!tab?.url || !/^https?:/.test(tab.url)) { $("#activeUrl").textContent="Cette page ne peut pas être suivie."; return; }
  $("#activeUrl").textContent=tab.url; $("#follow").disabled=false;
  $("#follow").onclick=follow;
  $("#manual").onclick=async()=>{const url=prompt("URL de la page ou du flux RSS/Atom à suivre :"); if(url) await addManual(url);};
}
async function getLinks() {
  try { const [res]=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>({title:document.querySelector('meta[property="og:title"]')?.content||document.title,siteName:document.querySelector('meta[property="og:site_name"]')?.content||"",html:document.documentElement.outerHTML.slice(0,4000000),links:[...document.querySelectorAll('link[rel~="alternate"][href]')].filter(l=>/rss|atom|xml/i.test(l.type+" "+l.href)).map(l=>({url:l.href,title:l.title||"Flux RSS/Atom",type:/atom/i.test(l.type+l.href)?"Atom":"RSS"}))})}); return res.result; }
  catch { return {title:new URL(tab.url).hostname,links:[]}; }
}
async function youtubeChannel(tabUrl, html, title) {
  let url;
  try { url = new URL(tabUrl); } catch { return null; }
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
  const path = url.pathname.replace(/\/$/, "");
  const channelPath = path.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/(?:videos|shorts))?$/i);
  const isHandle = /^\/@[^/]+(?:\/(?:videos|shorts))?$/i.test(path);
  if (!channelPath && !isHandle) return null;
  let channelId = channelPath?.[1] || "";
  if (!channelId && html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const canonical = doc.querySelector('link[rel~="canonical"][href]')?.href || "";
    channelId = doc.querySelector('meta[itemprop="channelId"][content]')?.content?.match(/UC[A-Za-z0-9_-]{22}/)?.[0] ||
      canonical.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1] ||
      doc.querySelector('meta[property="og:url"][content]')?.content?.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1] ||
      html.match(/"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/)?.[1] || "";
  }
  let channelName = MMP.decodeHtmlEntities((title || "").replace(/\s*[-–|]\s*YouTube\s*$/i, "").trim()) || "Chaîne YouTube";
  if (!channelId) {
    const result = await browser.runtime.sendMessage({ type: "resolveYouTubeChannel", pageUrl: url.href });
    if (result?.error) throw new Error(result.error);
    channelId = result?.channelId || "";
    channelName = result?.channelName || channelName;
  }
  if (!channelId) throw new Error("YouTube n’a pas fourni l’identifiant de cette chaîne. Rechargez la page de la chaîne puis réessayez.");
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  return { channelId, channelName, pageUrl: `https://www.youtube.com/channel/${channelId}`, feedUrl };
}
async function preview(url,title,feeds,pageHtml) {
  const p=await browser.runtime.sendMessage({type:"preview",pageUrl:url,links:feeds,pageHtml,tabId:tab?.id}); if(p.error) throw new Error(p.error);
  page={...p,title:title||p.title,pageHtml};
  const isYouTubeChannel=/^www\.youtube\.com$/i.test(new URL(url).hostname)&&/^\/channel\/UC[A-Za-z0-9_-]{22}(?:\/|$)/.test(new URL(url).pathname);
  const feedCandidates=(p.feeds.length?p.feeds:feeds).map(f=>({url:f.url,type:f.type}));
  const htmlHasMoreCatalogCards=!isYouTubeChannel&&p.htmlCount>=3&&p.feeds.some(feed=>p.htmlCount>feed.count);
  if(!p.feeds.length||htmlHasMoreCatalogCards) { if(p.htmlCount&&!isYouTubeChannel) { await chooseWalls({name:page.title,pageUrl:url,method:"html",feedCandidates}); } else { const d=p.feedDiagnostics||{}, paths=d.paths?.length?` ; chemins repérés : ${d.paths.join(", ")}`:"", failures=d.failures?.length?` ; erreurs : ${d.failures.slice(0,3).join(" | ")}`:""; throw new Error(`Aucun flux valide ni liste d’articles fiable détecté. Recherche RSS : ${d.candidates??0} candidat(s), ${d.checked??0} testés, ${d.inaccessible??0} sans autorisation${paths}${failures}.`); } return; }
  if(p.feeds.length===1) { const f=p.feeds[0]; await chooseWalls({name:f.channelName||page.title,pageUrl:url,feedUrl:f.url,method:f.type.toLowerCase(),feedCandidates}); return; }
  const box=$("#choices"); box.innerHTML=""; p.feeds.forEach((f,i)=>{const b=document.createElement("button");b.className="choice";b.textContent=`${f.channelName||f.title} — ${f.count} articles`;b.onclick=()=>chooseWalls({name:f.channelName||`${page.title} · ${f.title}`,pageUrl:url,feedUrl:f.url,method:f.type.toLowerCase(),feedCandidates});box.append(b);});
  msg("Choisissez le flux à suivre.");
}
async function follow() {
  $("#follow").disabled=true; msg("Recherche et validation des flux…"); let stage="vérification de l’accès Firefox";
  try { if(!await domainPermission(tab.url)) throw new Error("Firefox n’a pas accordé l’accès à cette page."); stage="lecture de la page"; const detected=await getLinks(); const youtube=await youtubeChannel(tab.url,detected.html,detected.title); if(youtube){stage="validation du flux Atom YouTube";await preview(youtube.pageUrl,youtube.channelName,[{url:youtube.feedUrl,title:youtube.channelName,type:"Atom"}],detected.html);return;} const feeds=detected.links; for(const path of ["/feed","/rss","/feed.xml","/rss.xml","/atom.xml","/feed.json"]) feeds.push({url:new URL(path,tab.url).href,title:`Flux ${path}`,type:path.endsWith(".json")?"JSON Feed":"RSS"}); stage="découverte et validation des flux"; await preview(tab.url,detected.siteName||detected.title,feeds,detected.html); }
  catch(e){showError(e,stage);} finally{$("#follow").disabled=false;}
}
async function chooseWalls(source, selectedWallIds=null) {
  pendingSource=source;if(page?.pageUrl&&MMP.cleanUrl(page.pageUrl)===MMP.cleanUrl(source.pageUrl)){pendingSource.pageTabId=tab?.id;if(page.pageHtml)pendingSource.pageHtml=page.pageHtml;}const id=MMP.stableId(source.pageUrl+"|"+(source.feedUrl||"html")),existing=extensionState.sources.find(item=>item.id===id);
  const box=$("#choices");box.replaceChildren();const title=document.createElement("p");title.textContent="Ajouter la source dans :";box.append(title);
  const defaultSelection=existing?(existing.wallIds||[]):[extensionState.walls.some(w=>w.id===extensionState.activeWallId)?extensionState.activeWallId:extensionState.walls[0]?.id].filter(Boolean);
  const selected=selectedWallIds===null?(defaultSelection[0]||""):(selectedWallIds[0]||"");
  for(const wall of extensionState.walls){const label=document.createElement("label"),input=document.createElement("input");input.type="radio";input.name="sourceWall";input.value=wall.id;input.checked=selected===wall.id;label.append(input,document.createTextNode(wall.name));box.append(label);}
  const create=document.createElement("button");create.type="button";create.className="choice";create.textContent="Créer un nouveau mur";create.disabled=extensionState.walls.length>=10;create.onclick=()=>{
    const selectedBeforeCreate=box.querySelector('input[type="radio"]:checked')?.value||"";
    const wallLabels=[...box.querySelectorAll(":scope > label")];
    const form=document.createElement("form");form.className="wall-create-form";
    const label=document.createElement("label"),input=document.createElement("input"),actions=document.createElement("div"),cancel=document.createElement("button"),submit=document.createElement("button"),error=document.createElement("p");
    label.textContent="Nom du mur";label.htmlFor="newWallName";input.id="newWallName";input.name="name";input.type="text";input.maxLength=40;input.required=true;input.placeholder="Nom du mur";
    actions.className="wall-create-actions";cancel.type="button";cancel.className="subtle";cancel.textContent="Annuler";submit.type="submit";submit.className="primary";submit.textContent="Créer le mur";error.className="error";error.setAttribute("role","status");
    actions.append(cancel,submit);form.append(label,input,error,actions);box.replaceChildren(title,...wallLabels,create,form);
    cancel.onclick=()=>chooseWalls(pendingSource,selectedBeforeCreate?[selectedBeforeCreate]:[]);
    form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;error.textContent="";try{const before=new Set(extensionState.walls.map(wall=>wall.id)),result=await browser.runtime.sendMessage({type:"manageWalls",action:"create",name:input.value});if(result?.error)throw new Error(result.error);extensionState=await browser.runtime.sendMessage({type:"state"});const created=extensionState.walls.find(wall=>!before.has(wall.id));if(!created)throw new Error("Le nouveau mur n’a pas été retrouvé.");chooseWalls(pendingSource,[created.id]);}catch(problem){error.textContent=problem.message;submit.disabled=false;input.focus();}};
    input.focus();
  };box.append(create);
  const confirm=document.createElement("button");confirm.className="primary full";confirm.textContent=existing?"Enregistrer les associations":"Confirmer l’abonnement";confirm.onclick=()=>{confirm.disabled=true;addSource(pendingSource).finally(()=>{if(confirm.isConnected)confirm.disabled=false;});};box.append(confirm);
  msg(existing?"Cette source est déjà suivie. Choisissez son mur puis confirmez.":"Sélectionnez un mur.");
}
async function addSource(source) {
  msg("Vérification de la source…");
  try {const wallId=$("#choices").querySelector('input[type="radio"]:checked')?.value;if(!wallId){msg("Choisissez un mur.",true);return;}const wallIds=[wallId],id=MMP.stableId(source.pageUrl+"|"+(source.feedUrl||"html")),existing=extensionState.sources.find(item=>item.id===id);if(existing){const result=await browser.runtime.sendMessage({type:"setSourceWalls",sourceId:id,wallIds});if(result?.error)throw new Error(result.error);extensionState=await browser.runtime.sendMessage({type:"state"});msg("Mur associé mis à jour.");$("#choices").replaceChildren();return;}
    if(source.feedUrl&&new URL(source.feedUrl).origin!==new URL(source.pageUrl).origin){const allowed=await domainPermission(source.feedUrl);if(!allowed)throw new Error("permission refused");}
    const result=await browser.runtime.sendMessage({type:"addSource",source,wallIds});if(result?.needsPermission){offerArticlePermission(source,wallIds,result.needsPermission);return;}if(result?.error)throw new Error(result.error);extensionState=await browser.runtime.sendMessage({type:"state"});msg(result.extractionProfile?.refreshable===false?"Élément ajouté ; actualisation automatique désactivée car aucune liste répétitive n’a été confirmée.":"Source ajoutée après vérification.");$("#choices").replaceChildren();}
  catch(e){showError(e,"validation et enregistrement de la source");}
}
function offerArticlePermission(source,wallIds,origin){const button=document.createElement("button");button.className="primary full";button.textContent="Autoriser et réessayer";button.onclick=()=>{button.disabled=true;let request;try{request=browser.permissions.request({origins:[permissionOriginPattern(origin)]});}catch(error){showError(error);return;}request.then(granted=>{if(!granted)throw new Error("permission refused");return browser.runtime.sendMessage({type:"addSource",source,wallIds});}).then(async result=>{if(result?.needsPermission){offerArticlePermission(source,wallIds,result.needsPermission);return;}if(result?.error)throw new Error(result.error);extensionState=await browser.runtime.sendMessage({type:"state"});msg(result.extractionProfile?.refreshable===false?"Élément ajouté ; actualisation automatique désactivée car aucune liste répétitive n’a été confirmée.":"Source ajoutée après vérification.");$("#choices").replaceChildren();}).catch(showError);};$("#choices").append(button);msg("Cette source renvoie vers un autre site. Autorisez son accès pour terminer la vérification.");}
async function addManual(value) {
  try { const url=new URL(value); if(!/^https?:$/.test(url.protocol)) throw new Error("invalid URL"); const permission=domainPermission(url.href);if(!await permission)throw new Error("permission refused"); const route=url.pathname+url.search,isFeed=/rss|atom|feed|\.xml|\.json/i.test(route); const source={name:url.hostname,pageUrl:isFeed?url.origin:url.href,feedUrl:isFeed?url.href:"",method:isFeed?(/json/i.test(route)?"jsonfeed":/atom/i.test(route)?"atom":"rss"):"html"}; await chooseWalls(source); } catch(e){showError(e);}
}
if(new URLSearchParams(location.search).has("onboarding-preview")){
  document.body.dataset.preview="true";const activeUrl=$("#activeUrl"),choices=$("#choices");
  activeUrl.textContent="https://exemple.fr/";activeUrl.classList.add("preview-zone");
  $("#follow").disabled=false;$("#follow").classList.add("preview-zone");
  choices.classList.add("preview-zone");const title=document.createElement("p");title.textContent="Ajouter la source dans :";choices.append(title);
  for(const [name,checked] of [["Actus",true],["Info locale",false]]){const label=document.createElement("label"),input=document.createElement("input");input.type="radio";input.name="sourceWall";input.checked=checked;input.disabled=true;label.append(input,document.createTextNode(name));choices.append(label);}
  const confirm=document.createElement("button");confirm.className="primary full";confirm.textContent="Confirmer l’abonnement";confirm.disabled=true;choices.append(confirm);
  $("#message").textContent="La source sera ajoutée au mur sélectionné.";$("#openWall").disabled=true;$("#manual").disabled=true;
}else init().catch(showError);
