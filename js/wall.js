"use strict";
const $=s=>document.querySelector(s);
let all=[], visible=[], rendered=0, renderFloor=0, state, pendingArticles=[];const pendingByWall=new Map();let activeWallSourceIds="";
let wallPinned=new URLSearchParams(location.search).get("separate")==="1";
const wallViewId=crypto.randomUUID();
let switchingWallId="",pendingWallSwitch=null,wallSwitchRunning=false,wallSelectionVersion=0,wallRenderRequest=0;
const GLOBAL_WALL_SETTING_KEYS=["faceFilterMode","faceDetectionThreshold","affiliateModuleEnabled","affiliateWarningsEnabled","hideAffiliatedContent","speechLanguage","speechVoiceURI","archiveRetentionDays","laterRetentionDays","retentionSplitVersion"];
const detectedArticleLanguages=new Map(),pendingLanguageDetections=new Set();let activeLanguageDetections=0;
let navManuallyExpanded=false;
let keepNavigationCollapsedAtTop=false;
let hlsLibraryPromise=null;
const articleSpeech=new MMArticleSpeech.ArticleSpeech(window);let activeSpeechArticleId="";
function configureArticleSpeech(settings=state?.settings||{}){articleSpeech.setLanguage(settings.speechLanguage||"fr-FR");articleSpeech.setVoice(settings.speechVoiceURI||"");for(const controls of document.querySelectorAll(".article-speech-controls"))controls.refreshAvailability?.();}
articleSpeech.onVoicesChanged(()=>{for(const controls of document.querySelectorAll(".article-speech-controls"))controls.refreshAvailability?.();});
function loadHlsLibrary(){if(window.Hls)return Promise.resolve(window.Hls);if(hlsLibraryPromise)return hlsLibraryPromise;hlsLibraryPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=browser.runtime.getURL("vendor/hls.min.js");script.onload=()=>window.Hls?resolve(window.Hls):reject(new Error("La bibliothèque HLS n’a pas été initialisée."));script.onerror=()=>reject(new Error("La bibliothèque HLS n’a pas pu être chargée."));document.head.append(script);}).catch(error=>{hlsLibraryPromise=null;throw error;});return hlsLibraryPromise;}
let dashLibraryPromise=null;
function loadDashLibrary(){if(window.dashjs)return Promise.resolve(window.dashjs);if(dashLibraryPromise)return dashLibraryPromise;dashLibraryPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=browser.runtime.getURL("vendor/dash.all.min.js");script.onload=()=>window.dashjs?resolve(window.dashjs):reject(new Error("La bibliothèque DASH n’a pas été initialisée."));script.onerror=()=>reject(new Error("La bibliothèque DASH n’a pas pu être chargée."));document.head.append(script);}).catch(error=>{dashLibraryPromise=null;throw error;});return dashLibraryPromise;}
function setNavigationCollapsed(){document.getElementById("wallSticky")?.classList.remove("is-collapsed");}
function updateWallTabsHeight(){const tabs=$("#wallTabs");tabs.style.setProperty("--wall-tabs-height",`${tabs.scrollHeight}px`);}
function isEligibleBluesky(article){const languages=article.blueskyLangs||[];return article.blueskyAdult!==true&&state?.socialProviders?.bluesky!==false&&(article.sourceIds||[article.sourceId]).includes("bluesky-keyword-search")&&(state?.blueskyRequireImage!==true||!!article.image)&&(state?.blueskyFrenchOnly!==true||!languages.length||languages.some(language=>/^fr(?:-|$)/i.test(String(language))));}
function isLinkedInResult(article){return (article.sourceIds||[article.sourceId]).includes("linkedin-keyword-search");}
function isEligibleLinkedIn(article){return state?.socialProviders?.linkedin===true&&isLinkedInResult(article)&&(state?.linkedinRequireImage!==true||!!article.image);}
function isEligibleVideo(article){const providers=state?.videoProviders||{youtube:true,peertube:true,crowdbunker:false,rumble:false};return (article.sourceIds||[article.sourceId]).some(id=>id==="youtube-keyword-search"&&providers.youtube!==false||id==="peertube-keyword-search"&&providers.peertube!==false||id==="crowdbunker-keyword-search"&&providers.crowdbunker===true||id==="rumble-keyword-search"&&providers.rumble===true);}
function languageTextFor(article,kind){if(kind==="youtube"||kind==="documents")return `${article.title||""} ${article.summary||""}`;return isLinkedInResult(article)?(article.title||""):(article.summary||article.title||"");}
function languageResultFor(article,kind){const input=window.MMLanguageDetection.clean(languageTextFor(article,kind));if(!input)return "und";if(detectedArticleLanguages.has(input))return detectedArticleLanguages.get(input);if(!pendingLanguageDetections.has(input)&&activeLanguageDetections<4){pendingLanguageDetections.add(input);activeLanguageDetections++;window.MMLanguageDetection.detect(input).then(language=>{detectedArticleLanguages.set(input,language);if(detectedArticleLanguages.size>1200)detectedArticleLanguages.delete(detectedArticleLanguages.keys().next().value);}).catch(()=>detectedArticleLanguages.set(input,"und")).finally(()=>{pendingLanguageDetections.delete(input);activeLanguageDetections--;if(state)filterSort();});}return null;}
function passesLanguageFilter(article,wall){if(!state.settings?.languageFilterEnabled)return true;const language=languageResultFor(article,wall.kind);return language===null?false:language==="und"?state.settings.languageFilterKeepUnknown===true:(state.settings.languageFilterLanguages||[]).includes(language);}
function iconChoiceForWall(wall){if(!wall)return"generic";if((state.walls||[]).some(item=>item.id===wall.id))return state.wallSettings?.[wall.id]?.iconFamily||"auto";if(wall.kind==="youtube")return"streaming";return"auto";}
function updateWallFavicon(wall){const link=document.querySelector('link[rel="icon"]');if(link)link.href=MMPWallIcons.faviconDataUrl(wall?.name||"Mon Mur",iconChoiceForWall(wall));}
function openWallInNewTab(wallId){const url=new URL(browser.runtime.getURL("wall.html"));url.searchParams.set("wall",wallId);url.searchParams.set("separate","1");browser.tabs.create({url:url.href}).catch(error=>text($("#status"),`Impossible d’ouvrir le mur : ${error.message}`));}
function handlePageScroll(){const button=$("#returnToTop"),feed=$(".feed");button.hidden=feed.scrollTop<=8;}
function afterWallChange(){keepNavigationCollapsedAtTop=false;navManuallyExpanded=false;}
function updateWallStatus(articleCount,sourceCount){const status=$("#status"),autoWall=state.autoWalls?.find(w=>w.id===state.activeWallId),days=autoWall?.status==="later"?(state.settings.laterRetentionDays||90):(state.settings.archiveRetentionDays||2),countLabel=autoWall?.kind==="youtube"?`${articleCount} vidéo${articleCount===1?"":"s"} · recherche par mots-clés`:autoWall?.kind==="bluesky"?`${articleCount} publication${articleCount===1?"":"s"} · sujets prioritaires`:autoWall?.kind==="documents"?`${articleCount} PDF en français · Internet Archive`:autoWall?`${articleCount} élément${articleCount===1?"":"s"} · mur automatique · conservés ${days} jours`:`${articleCount} article${articleCount===1?"":"s"} à lire · ${sourceCount} source${sourceCount===1?"":"s"} active${sourceCount===1?"":"s"}`;text(status,countLabel);status.dataset.shortStatus=autoWall?.kind==="youtube"?`${articleCount} vidéos`:autoWall?.kind==="bluesky"?`${articleCount} posts`:autoWall?.kind==="documents"?`${articleCount} PDF`:autoWall?`${articleCount} · ${days} j`:`${articleCount} à lire · ${sourceCount} src.`;status.setAttribute("aria-label",countLabel);}
function stopOtherWallVideos(wallId,exceptArticleId=""){for(const card of document.querySelectorAll(".card"))if(card.dataset.wallId===wallId&&card.dataset.articleId!==exceptArticleId)card.stopActiveVideo?.();}
function announceVideoStart(articleId){stopOtherWallVideos(state.activeWallId,articleId);browser.runtime.sendMessage({type:"videoStarted",wallId:state.activeWallId,articleId,viewId:wallViewId}).catch(()=>{});}
const FALLBACK_FAVICON=browser.runtime.getURL("icons/source-neutral.svg");
const PLATFORM_ICONS={YouTube:browser.runtime.getURL("icons/youtube.svg"),PeerTube:browser.runtime.getURL("icons/peertube.svg"),CrowdBunker:browser.runtime.getURL("icons/crowdbunker.png"),Rumble:browser.runtime.getURL("icons/rumble.svg"),Bluesky:browser.runtime.getURL("icons/bluesky.svg"),LinkedIn:browser.runtime.getURL("icons/linkedin.svg")};
function text(el,value){el.textContent=value;}
let imagePreviewDialog;
function bestImageUrl(image){
  const explicit=image.dataset.fullSrc||image.dataset.zoomImage||image.dataset.originalSrc||image.dataset.original||image.dataset.largeSrc;
  if(explicit)return MMP.cleanUrl(explicit,image.src)||image.currentSrc||image.src;
  const linked=image.closest("a[href]")?.href;
  try{if(linked&&/\.(?:avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i.test(new URL(linked).pathname))return MMP.cleanUrl(linked,image.src)||image.currentSrc||image.src;}catch{}
  return image.currentSrc||image.src;
}
function openImagePreview(image){
  if(!imagePreviewDialog){imagePreviewDialog=document.createElement("dialog");imagePreviewDialog.className="bluesky-image-dialog";imagePreviewDialog.setAttribute("aria-label","Image agrandie");const close=document.createElement("button");close.type="button";close.className="bluesky-image-close";close.textContent="×";close.setAttribute("aria-label","Fermer l’image");close.onclick=()=>imagePreviewDialog.close();const controls=document.createElement("div");controls.className="image-zoom-controls";const preview=document.createElement("img");preview.alt="Image agrandie";let zoom=1;const setZoom=value=>{zoom=Math.min(4,Math.max(1,value));preview.style.transform=`scale(${zoom})`;};for(const [label,delta,title] of [["−",-.25,"Réduire"],["100 %",0,"Réinitialiser le zoom"],["+",.25,"Agrandir"]]){const button=document.createElement("button");button.type="button";button.textContent=label;button.title=title;button.setAttribute("aria-label",title);button.onclick=()=>setZoom(delta?zoom+delta:1);controls.append(button);}preview.addEventListener("wheel",event=>{event.preventDefault();setZoom(zoom+(event.deltaY<0?.15:-.15));},{passive:false});preview.addEventListener("error",()=>{const fallback=preview.dataset.fallback;if(fallback&&preview.src!==fallback)preview.src=fallback;});imagePreviewDialog.append(close,controls,preview);imagePreviewDialog.addEventListener("close",()=>setZoom(1));imagePreviewDialog.addEventListener("click",event=>{if(event.target===imagePreviewDialog)imagePreviewDialog.close();});document.body.append(imagePreviewDialog);}
  const preview=imagePreviewDialog.querySelector("img");preview.dataset.fallback=image.currentSrc||image.src;preview.src=bestImageUrl(image);imagePreviewDialog.showModal();
}
function enableExpandedImageZoom(content){for(const image of content.querySelectorAll("img")){image.tabIndex=0;image.setAttribute("role","button");image.setAttribute("aria-label","Agrandir l’image");image.title="Cliquer pour agrandir";image.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();openImagePreview(image);});image.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();openImagePreview(image);}});}}
function publishedDateLabel(article){const date=new Date(article.publishedAt);if(!Number.isFinite(date.getTime()))return"Date inconnue";const formatted=article.datePrecision==="day"?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(date):new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(date);return article.datePrecision==="day"?`Publié le ${formatted} · heure inconnue`:`${formatted}${article.dateIsFallback?" · date de découverte":""}`;}
const SUMMARY_PREVIEW_LIMIT=300;
function summaryPreview(value){const chars=[...MMP.decodeHtmlEntities(String(value??"")).replace(/\s+/g," ").trim()];if(chars.length<=SUMMARY_PREVIEW_LIMIT)return chars.join("");const contentLimit=SUMMARY_PREVIEW_LIMIT-1;let end=contentLimit,boundary=chars.lastIndexOf(" ",contentLimit);if(boundary>=contentLimit-60)end=boundary;return `${chars.slice(0,end).join("").trimEnd()}…`;}
function articleSource(article){
  if(isLinkedInResult(article))return {name:"LinkedIn"};
  if(article.documentKind==="pdf")return {name:"Internet Archive"};
  if(article.videoChannelName||article.youtubeChannelName)return {name:article.videoChannelName||article.youtubeChannelName};
  const ids=article.sourceIds||[article.sourceId], candidates=state.sources.filter(s=>ids.includes(s.id));
  let articleOrigin="";try{articleOrigin=new URL(article.canonicalUrl).origin;}catch{}
  // A syndicated URL can be present in more than one feed. Attribute it to
  // the source whose site actually hosts the article, when that source exists.
  return candidates.find(s=>{try{return new URL(s.pageUrl).origin===articleOrigin;}catch{return false;}})
    ||candidates.find(s=>s.id===article.sourceId)||candidates[0];
}
function syncLinkedInCard(node,article){if(!node||!isLinkedInResult(article))return;const title=node.querySelector(".title"),original=node.querySelector(".expanded-original");if(title)title.href=article.linkedinOriginalUrl||article.canonicalUrl;if(original&&article.linkedinOriginalUrl)original.href=article.linkedinOriginalUrl;}
function sameImageAsset(left,right,baseUrl){try{const a=new URL(MMP.cleanUrl(left,baseUrl)),b=new URL(MMP.cleanUrl(right,baseUrl));return a.origin===b.origin&&a.pathname===b.pathname;}catch{return false;}}
function youtubeVideoId(article){try{const url=new URL(article.canonicalUrl);if(!/(^|\.)youtube\.com$/i.test(url.hostname))return"";const path=url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1]||(/^\/watch\/?$/.test(url.pathname)?url.searchParams.get("v"):"");return /^[\w-]{11}$/.test(path||"")?path:"";}catch{return"";}}
function videoDetails(article){
  const details=document.createElement("section");details.className="video-details";
  const heading=document.createElement("h3");heading.textContent="Description et informations";details.append(heading);
  const descriptionText=article.videoDetails?.description||article.summary||"";
  const description=document.createElement("p");description.className="video-description";if(descriptionText)appendAffiliateAnnotatedText(description,descriptionText);else description.textContent="Aucune description n’a été fournie pour cette vidéo.";details.append(description);
  const extra=article.videoDetails||{},date=new Date(article.publishedAt),extraDate=new Date(extra.publishedAtLabel||""),published=Number.isFinite(extraDate.getTime())?new Intl.DateTimeFormat("fr-FR",{dateStyle:"long"}).format(extraDate):extra.publishedAtLabel||article.youtubePublishedLabel|| (Number.isFinite(date.getTime())?new Intl.DateTimeFormat("fr-FR",{dateStyle:"long",timeStyle:"short"}).format(date):"Date inconnue"),duration=extra.durationSeconds?`${Math.floor(extra.durationSeconds/60)} min ${String(extra.durationSeconds%60).padStart(2,"0")} s`:"",views=extra.viewCount?new Intl.NumberFormat("fr-FR").format(Number(extra.viewCount)||0):"";
  const metadata=document.createElement("dl");metadata.className="video-metadata";
  for(const [label,value] of [["Plateforme",article.videoPlatform||"YouTube"],["Chaîne",extra.channelName||article.videoChannelName||article.youtubeChannelName||article.videoPlatform||"Inconnue"],["Publication",published],["Durée",duration],["Vues",views],["Catégorie",extra.category||""],["Mot-clé",article.youtubeKeyword||""],["Mots-clés",(extra.tags||[]).join(", ")]]){
    if(!value)continue;const row=document.createElement("div"),term=document.createElement("dt"),definition=document.createElement("dd");term.textContent=label;definition.textContent=value;row.append(term,definition);metadata.append(row);
  }
  details.append(metadata);return details;
}
const affiliateFindingCache=new WeakMap();
let affiliateWarningSequence=0;
function affiliateFindings(article){
  if(!article)return[];
  const signature=JSON.stringify([article.canonicalUrl,article.blueskyLink,article.summary,article.videoDetails?.description]);
  let cached=affiliateFindingCache.get(article);
  if(!cached||cached.signature!==signature){cached={signature,findings:window.MMAffiliate?.inspect(article)||[]};affiliateFindingCache.set(article,cached);}
  const findings=new Map(cached.findings.map(item=>[item.url,item]));
  for(const item of article.affiliateFindings||[])if(!findings.has(item.url)||item.status==="recognized"||item.status==="unverified"&&findings.get(item.url)?.status!=="recognized")findings.set(item.url,item);
  for(const item of article._affiliateContentFindings||[])if(!findings.has(item.url)||item.status==="recognized"||item.status==="unverified"&&findings.get(item.url)?.status!=="recognized")findings.set(item.url,item);
  return [...findings.values()];
}
function affiliateModuleActive(){return state?.settings?.affiliateModuleEnabled!==false;}
function affiliateFindingEvidence(finding){return [finding?.reason,...(finding?.evidence?.length?[`Preuves : ${finding.evidence.join(" · ")}`]:[])].filter(Boolean).join(" · ");}
function shouldHideAffiliate(article){return affiliateModuleActive()&&state?.settings?.hideAffiliatedContent===true&&affiliateFindings(article).some(item=>item.status==="recognized");}
function affiliateFindingsInContent(article, content){
  const found=new Map(affiliateFindings(article).map(item=>[item.url,item]));
  for(const anchor of content.querySelectorAll("a[href]")){const label=`${anchor.textContent||""} ${anchor.getAttribute("title")||""} ${anchor.getAttribute("aria-label")||""}`,item=window.MMAffiliate?.inspectLink(anchor.href,label);if(item&&(!found.has(item.url)||item.status==="recognized"))found.set(item.url,item);}
  for(const url of window.MMAffiliate?.urlsInText(content.textContent)||[]){const item=window.MMAffiliate.classify(url);if(item&&(!found.has(item.url)||item.status==="recognized"))found.set(item.url,item);}
  article._affiliateContentFindings=[...found.values()];return [...found.values()];
}
async function resolveAffiliateCandidates(article, articleNode, articleBody, candidates, content=null, browserProbeUrls=[]){
  if(!affiliateModuleActive()||!window.MMAffiliate?.classify)return;
  const direct=new Set(affiliateFindings(article).filter(item=>item.status==="recognized").map(item=>item.url));
  candidates=[...new Set(candidates.filter(url=>/^https?:/i.test(url)&&!direct.has(url)))];
  if(!candidates.length)return;
  try{
    const findings=new Map(affiliateFindings(article).map(item=>[item.url,item]));
    for(let offset=0;offset<candidates.length;offset+=8){
      const batch=candidates.slice(offset,offset+8),results=await browser.runtime.sendMessage({type:"resolveAffiliateLinks",urls:batch,browserProbeUrls:browserProbeUrls.filter(url=>batch.includes(url))});
      if(!Array.isArray(results))continue;
      for(const result of results){
        if(!result?.url)continue;
        let detected=null, detectedUrl="";
        for(const hopUrl of result.chain||[result.finalUrl||result.url]){const candidate=window.MMAffiliate.classify(hopUrl);if(candidate?.status==="recognized"){detected=candidate;detectedUrl=hopUrl;break;}if(candidate&&!detected){detected=candidate;detectedUrl=hopUrl;}}
        if(detected){findings.set(result.url,{...detected,url:result.url,reason:`${detectedUrl===result.url?"URL initiale":"Destination HTTP observée"} : ${detected.reason} (${new URL(detectedUrl).hostname})`});continue;}
        if(result.resolved){if(findings.get(result.url)?.status==="unverified")findings.delete(result.url);continue;}
        const prior=findings.get(result.url);findings.set(result.url,{url:result.url,status:"unverified",ruleId:"network-unverified",reason:[prior?.reason,result.reason||"Vérification réseau impossible"].filter(Boolean).join("; ")});
      }
    }
    article._affiliateContentFindings=[...findings.values()];
    article.affiliateFindings=article._affiliateContentFindings;
    browser.runtime.sendMessage({type:"saveAffiliateFindings",articleId:article.id,findings:article.affiliateFindings}).catch(()=>{});
    if(!articleNode.isConnected||!articleBody.isConnected)return;
    if(content)highlightAffiliateAnchors(content,article.affiliateFindings);
    else {const description=articleNode.querySelector(".video-description");if(description)highlightAffiliateAnchors(description,article.affiliateFindings);}
    renderAffiliateNotice(articleNode,article,articleBody,article._affiliateContentFindings);
    if(state?.settings?.hideAffiliatedContent===true&&shouldHideAffiliate(article))filterSort();
  }catch{}
}
async function resolveAffiliateFindings(article, articleNode, articleBody, content){
  const candidates=[...new Set([...content.querySelectorAll("a[href]")].map(anchor=>anchor.href))];
  return resolveAffiliateCandidates(article,articleNode,articleBody,candidates,content);
}
function resolveVideoDescriptionLinks(article, articleNode){
  const description=articleNode.querySelector(".video-description"),body=articleNode.querySelector(".expanded-article");
  if(!description||!body)return;
  const source=description.dataset.affiliateSourceText||description.textContent;
  const candidates=window.MMAffiliate?.urlsInText(source)||[],browserProbeUrls=(window.MMAffiliate?.inspectText(source)||[]).filter(item=>item.status==="suspected").map(item=>item.url);
  return resolveAffiliateCandidates(article,articleNode,body,candidates,null,browserProbeUrls);
}
function placeCardCover(article, image, after=null){
  let frame=image.parentElement?.classList.contains("card-cover-frame")?image.parentElement:null;
  if(!frame){frame=document.createElement("div");frame.className="card-cover-frame";image.replaceWith(frame);frame.append(image);}
  if(!frame.isConnected){if(after)after.after(frame);else article.append(frame);}
  const badge=article.querySelector(":scope > .affiliate-cocarde.no-cover");if(badge){badge.classList.remove("no-cover");badge.classList.add("on-cover");frame.append(badge);article.classList.remove("has-affiliate-cocarde-no-cover");}
  return frame;
}
function removeCardCover(article, image){
  const frame=image.parentElement?.classList.contains("card-cover-frame")?image.parentElement:null;image.remove();
  if(!frame)return;const badge=frame.querySelector(".affiliate-cocarde");if(badge){badge.classList.remove("on-cover");badge.classList.add("no-cover");article.classList.add("has-affiliate-cocarde-no-cover");article.append(badge);}frame.remove();
}
function affiliateIndicatorModel(findings){
  const recognized=findings.filter(item=>item.status==="recognized"),suspected=findings.filter(item=>item.status==="suspected"),unverified=findings.filter(item=>item.status==="unverified");
  return {recognized,suspected,unverified,tone:recognized.length?"recognized":suspected.length?"suspected":unverified.length?"unverified":"none",label:recognized.length?`Affiliation · ${recognized.length}`:suspected.length?`À vérifier · ${suspected.length}`:unverified.length?`Non vérifié · ${unverified.length}`:"",ariaLabel:recognized.length?`Affiliation détectée : ${recognized.length} lien${recognized.length===1?"":"s"} confirmé${recognized.length===1?"":"s"}${suspected.length?`, ${suspected.length} lien${suspected.length===1?"":"s"} suspect${suspected.length===1?"":"s"} à vérifier`:""}`:suspected.length?`À vérifier : ${suspected.length} lien${suspected.length===1?"":"s"} suspect${suspected.length===1?"":"s"}`:unverified.length?`Vérification réseau impossible pour ${unverified.length} lien${unverified.length===1?"":"s"}`:""};
}
function attachAffiliateFinding(anchor,finding){
  anchor._affiliateFinding=finding;
  if(!Object.prototype.hasOwnProperty.call(anchor,"_affiliatePreviousHasPopup"))anchor._affiliatePreviousHasPopup=anchor.getAttribute("aria-haspopup");
  anchor.setAttribute("aria-haspopup","dialog");
}
function appendAffiliateAnnotatedText(element, value){
  const source=MMP.decodeHtmlEntities(String(value||""));element.dataset.affiliateSourceText=source;if(!affiliateModuleActive()){element.textContent=source;return;}const matches=window.MMAffiliate?.urlsInText(source)||[], findings=new Map((window.MMAffiliate?.inspectText(source)||[]).map(item=>[item.url,item]));let cursor=0;
  for(const url of matches){const index=source.indexOf(url,cursor);if(index<0)continue;element.append(document.createTextNode(source.slice(cursor,index)));const finding=findings.get(url),anchor=document.createElement("a");anchor.href=url;anchor.target="_blank";anchor.rel="noopener noreferrer";anchor.textContent=url;
    if(finding){const confirmed=finding.status==="recognized",evidence=affiliateFindingEvidence(finding);attachAffiliateFinding(anchor,finding);anchor.classList.add(confirmed?"affiliate-link-highlight":"affiliate-link-suspected");anchor.title=`${confirmed?"Affiliation détectée":"Indice commercial à vérifier"} · ${evidence}`;const badge=document.createElement("span");badge.className=confirmed?"affiliate-link-badge":"affiliate-link-badge suspected";badge.setAttribute("aria-label",`${confirmed?"Affiliation détectée":"Indice commercial à vérifier"} : ${evidence}`);badge.textContent=confirmed?" ⚠":" ?";anchor.append(badge);}
    element.append(anchor);cursor=index+url.length;}
  element.append(document.createTextNode(source.slice(cursor)));
}
function renderAffiliateNotice(article, articleData, articleBody, detected=affiliateFindings(articleData)){
  article.querySelectorAll(".affiliate-cocarde").forEach(old=>old.remove());article.classList.remove("has-affiliate-cocarde-no-cover");
  article.querySelectorAll(".affiliate-notice").forEach(old=>old.remove());
  if(!affiliateModuleActive()){configureAffiliateLinkGuard(article,false);return;}
  configureAffiliateLinkGuard(article,true);
  const findings=detected,model=affiliateIndicatorModel(findings),recognized=model.recognized,suspected=model.suspected,unverified=model.unverified;
  if(!findings.length)return;
  const trigger=document.createElement("button");trigger.type="button";trigger.className=`affiliate-cocarde ${recognized.length?"is-recognized":suspected.length?"is-suspected":"is-unverified"}`;
  trigger.setAttribute("aria-expanded","false");trigger.setAttribute("aria-label",model.ariaLabel);
  const icon=document.createElement("span");icon.className="affiliate-cocarde-icon";icon.setAttribute("aria-hidden","true");icon.textContent="!";
  const label=document.createElement("span");label.textContent=model.label;trigger.append(icon,label);
  const frame=article.querySelector(".card-cover-frame");if(frame){trigger.classList.add("on-cover");frame.append(trigger);}else{trigger.classList.add("no-cover");article.classList.add("has-affiliate-cocarde-no-cover");article.append(trigger);}
  const panel=document.createElement("aside");panel.className=`affiliate-notice ${recognized.length?"has-recognized":suspected.length?"suspected-only":"unverified-only"}`;panel.hidden=true;
  const heading=document.createElement("strong");heading.textContent=recognized.length?"Affiliations confirmées":suspected.length?"Liens suspects à vérifier":"Liens non vérifiés";panel.append(heading);
  const count=document.createElement("p");count.textContent=recognized.length?`${recognized.length} lien${recognized.length===1?"":"s"} d’affiliation confirmé${recognized.length===1?"":"s"}${suspected.length?` · ${suspected.length} lien${suspected.length===1?"":"s"} suspect${suspected.length===1?"":"s"} à vérifier`:""}${unverified.length?` · ${unverified.length} lien${unverified.length===1?"":"s"} non vérifié${unverified.length===1?"":"s"}`:""}.`: suspected.length?`${suspected.length} lien${suspected.length===1?"":"s"} suspect${suspected.length===1?"":"s"}; aucune affiliation n’est confirmée.${unverified.length?` ${unverified.length} lien${unverified.length===1?"":"s"} non vérifié${unverified.length===1?"":"s"}.`:""}`:`${unverified.length} lien${unverified.length===1?"":"s"} non vérifié${unverified.length===1?"":"s"}; l’absence d’affiliation n’a pas pu être établie.`;panel.append(count);
  const list=document.createElement("ul");
  for(const finding of findings){const item=document.createElement("li"),itemLabel=document.createElement("span"),url=document.createElement("a"),reason=document.createElement("small"),kind=finding.status==="recognized"?"recognized":finding.status==="unverified"?"unverified":"suspected";item.className=`affiliate-result ${kind}`;itemLabel.className=`affiliate-label ${kind}`;itemLabel.textContent=kind==="recognized"?"Affiliation confirmée":kind==="unverified"?"Non vérifié":"Lien suspect · à vérifier";url.href=finding.url;url.target="_blank";url.rel="noopener noreferrer";url.textContent=finding.url;url.title="Ouvrir cette URL";attachAffiliateFinding(url,finding);url.classList.add(kind==="recognized"?"affiliate-link-highlight":"affiliate-link-suspected");reason.textContent=affiliateFindingEvidence(finding);item.append(itemLabel,url,reason);list.append(item);}
  panel.append(list);
  if(recognized.length){const explanation=document.createElement("p");explanation.className="affiliate-explanation";explanation.textContent="Un lien d’affiliation peut permettre à l’auteur de percevoir une commission et influencer ses recommandations commerciales. Cette classification décrit l’attribution commerciale; elle ne vérifie pas la fiabilité ni la sécurité du site cible.";panel.append(explanation);}
  trigger.addEventListener("click",()=>{const opening=panel.hidden;panel.hidden=!opening;trigger.setAttribute("aria-expanded",String(opening));});
  articleBody.before(panel);
}
function highlightAffiliateAnchors(content, resolvedFindings=[]){
  if(!affiliateModuleActive())return;
  const classify=window.MMAffiliate?.classify;if(!classify)return;const textFindings=window.MMAffiliate?.inspectText(content.textContent)||[];
  for(const anchor of content.querySelectorAll("a[href]")){
    const label=`${anchor.textContent||""} ${anchor.getAttribute("title")||""} ${anchor.getAttribute("aria-label")||""}`,resolved=resolvedFindings.find(item=>item.url===anchor.href),direct=window.MMAffiliate?.inspectLink(anchor.href,label),finding=resolved?.status==="recognized"||resolved?.status==="unverified"?resolved:direct||resolved||textFindings.find(item=>{try{return new URL(item.url).href===anchor.href;}catch{return false;}});if(!finding)continue;
    attachAffiliateFinding(anchor,finding);const confirmed=finding.status==="recognized",unverified=finding.status==="unverified",evidence=affiliateFindingEvidence(finding),badge=anchor.querySelector(":scope > .affiliate-link-badge");anchor.classList.remove(confirmed?"affiliate-link-suspected":"affiliate-link-highlight");anchor.classList.add(confirmed?"affiliate-link-highlight":"affiliate-link-suspected");anchor.title=`${confirmed?"Affiliation détectée":unverified?"Vérification impossible":"Indice commercial à vérifier"} · ${evidence}`;
    if(unverified)anchor.classList.add("affiliate-link-unverified");else anchor.classList.remove("affiliate-link-unverified");
    const marker=badge||document.createElement("span");marker.className=confirmed?"affiliate-link-badge":`affiliate-link-badge ${unverified?"unverified":"suspected"}`;marker.setAttribute("aria-label",`${confirmed?"Affiliation détectée":unverified?"Vérification impossible":"Indice commercial à vérifier"} : ${evidence}`);marker.textContent=confirmed?" ⚠":unverified?" !":" ?";if(!badge)anchor.append(marker);
  }
}
function configureAffiliateLinkGuard(root,enabled){
  root._affiliateLinkController?.destroy();root._affiliateLinkController=null;
  if(!enabled)return;
  const approvedClicks=new WeakSet();let activePanel=null,activeAnchor=null;
  const clearDescription=(anchor,panelId)=>{if(!anchor)return;const tokens=(anchor.getAttribute("aria-describedby")||"").split(/\s+/u).filter(token=>token&&token!==panelId);if(tokens.length)anchor.setAttribute("aria-describedby",tokens.join(" "));else anchor.removeAttribute("aria-describedby");};
  const close=(restoreFocus=false)=>{if(!activePanel)return;const oldPanel=activePanel,oldAnchor=activeAnchor;activePanel=null;activeAnchor=null;clearDescription(oldAnchor,oldPanel.id);oldPanel.remove();if(restoreFocus&&oldAnchor?.isConnected)oldAnchor.focus();};
  const show=anchor=>{
    close();const finding=anchor._affiliateFinding;if(!finding)return;
    const confirmed=finding.status==="recognized",panel=document.createElement("aside"),title=document.createElement("h3"),copy=document.createElement("p"),reason=document.createElement("p"),open=document.createElement("button");
    panel.className=`affiliate-link-check ${confirmed?"recognized":"suspected"}`;panel.id=`affiliate-link-check-${++affiliateWarningSequence}`;panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","false");panel.setAttribute("aria-labelledby",`${panel.id}-title`);panel.tabIndex=-1;
    title.id=`${panel.id}-title`;title.textContent=confirmed?"Lien d’affiliation détecté":"Lien d’affiliation suspecté";
    copy.textContent=confirmed?"Ce lien a été reconnu comme lien d’affiliation. Le site qui le publie pourrait percevoir une commission si vous réalisez un achat.":"Ce lien présente des indices d’affiliation. Le site qui le publie pourrait percevoir une commission si vous réalisez un achat.";
    reason.className="affiliate-link-check-reason";reason.textContent=`Indice observé : ${affiliateFindingEvidence(finding)}`;
    open.type="button";open.className="affiliate-link-confirm-open";open.textContent="Ouvrir le lien";
    panel.append(title,copy,reason,open);activePanel=panel;activeAnchor=anchor;
    const block=anchor.closest(".affiliate-notice")||anchor.closest("p,li,blockquote,h1,h2,h3,h4,h5,h6,div")||anchor;block.parentNode.insertBefore(panel,block.nextSibling);
    anchor.setAttribute("aria-describedby",[...(anchor.getAttribute("aria-describedby")||"").split(/\s+/u).filter(Boolean),panel.id].join(" "));
    panel.addEventListener("click",event=>{if(event.target.closest(".affiliate-link-confirm-open"))return;close();});
    open.focus();
  };
  const flagged=target=>target.closest?.("a.affiliate-link-highlight,a.affiliate-link-suspected");
  const onClick=event=>{
    const confirm=event.target.closest?.(".affiliate-link-confirm-open");
    if(confirm&&activePanel?.contains(confirm)){
      event.preventDefault();const source=activeAnchor;close();if(source?.isConnected){approvedClicks.add(source);try{source.click();}finally{approvedClicks.delete(source);}}return;
    }
    const anchor=flagged(event.target);
    if(anchor&&root.contains(anchor)){
      if(approvedClicks.has(anchor)){approvedClicks.delete(anchor);return;}
      event.preventDefault();show(anchor);return;
    }
    if(activePanel&&!activePanel.contains(event.target))close();
  };
  const onAuxClick=event=>{const anchor=flagged(event.target);if(anchor&&event.button===1&&root.contains(anchor)){event.preventDefault();show(anchor);}};
  const onContextMenu=event=>{const anchor=flagged(event.target);if(anchor&&root.contains(anchor)){event.preventDefault();show(anchor);}};
  const onKeyDown=event=>{if(event.key==="Escape"&&activePanel){event.preventDefault();close(true);}};
  root.addEventListener("click",onClick);root.addEventListener("auxclick",onAuxClick);root.addEventListener("contextmenu",onContextMenu);root.addEventListener("keydown",onKeyDown);
  root._affiliateLinkController={destroy(){close(true);root.removeEventListener("click",onClick);root.removeEventListener("auxclick",onAuxClick);root.removeEventListener("contextmenu",onContextMenu);root.removeEventListener("keydown",onKeyDown);for(const anchor of root.querySelectorAll("a.affiliate-link-highlight,a.affiliate-link-suspected")){const previous=anchor._affiliatePreviousHasPopup;if(previous===null)anchor.removeAttribute("aria-haspopup");else if(previous!==undefined)anchor.setAttribute("aria-haspopup",previous);delete anchor._affiliatePreviousHasPopup;}}};
}
function loadVideoMetadata(articleData,cardNode,token){if(articleData.videoDetails&&articleData.videoDetailsVersion>=2){resolveVideoDescriptionLinks(articleData,cardNode);return;}const showError=message=>{if(token!==generation||!expanded||!cardNode.isConnected)return;let note=cardNode.querySelector(".video-metadata-error");if(!note){note=document.createElement("p");note.className="video-metadata-error muted";cardNode.querySelector(".video-details")?.append(note);}if(note)note.textContent=message;};browser.runtime.sendMessage({type:"videoMetadata",articleId:articleData.id}).then(details=>{if(!details)return;if(details.error){showError(details.error);return;}Object.assign(articleData,{videoDetails:details,videoDetailsVersion:2,videoChannelName:details.channelName||articleData.videoChannelName});if(details.description)articleData.summary=details.description;if(token!==generation||!expanded||!cardNode.isConnected)return;for(const section of cardNode.querySelectorAll(".video-details"))section.replaceWith(videoDetails(articleData));const articleBody=cardNode.querySelector(".expanded-article"),content=cardNode.querySelector(".expanded-content");if(articleBody){renderAffiliateNotice(cardNode,articleData,articleBody);if(content)renderPersuasionFindings(articleBody,content);if(state?.settings?.hideAffiliatedContent===true&&shouldHideAffiliate(articleData))filterSort();resolveVideoDescriptionLinks(articleData,cardNode);}}).catch(()=>showError("Impossible de récupérer les informations complètes de cette vidéo pour le moment."));}
function cleanReaderContent(html, article, source){
  const doc=new DOMParser().parseFromString(`<body>${html||""}</body>`,"text/html");
  const normalize=value=>String(value||"").replace(/\s+/g," ").trim().toLocaleLowerCase("fr");
  const title=normalize(article.title), summary=normalize(article.summary);
  for(const heading of doc.body.querySelectorAll("h1,h2,h3")) if(title&&normalize(heading.textContent)===title) heading.remove();
  {
    const mainImage=article.image||doc.body.querySelector("img")?.getAttribute("src")||"";
    if(mainImage)
    for(const image of doc.body.querySelectorAll("img")) if(sameImageAsset(image.getAttribute("src"),mainImage,article.canonicalUrl)){
      image.remove();
    }
  }
  const date=new Date(article.publishedAt), repeatedMeta=new Set([normalize(source?.name)]);
  if(Number.isFinite(date.getTime())) for(const style of ["medium","long"]) repeatedMeta.add(normalize(new Intl.DateTimeFormat("fr-FR",{dateStyle:style}).format(date)));
  for(const child of [...doc.body.children]){
    if(!["P","TIME"].includes(child.tagName)||!repeatedMeta.has(normalize(child.textContent))) break;
    child.remove();
  }
  if(summary){
    const first=doc.body.querySelector("p");
    if(first){
      const rawSummary=String(article.summary||"").replace(/[.…]+$/g,"").trim();
      const paragraph=normalize(first.textContent), comparable=normalize(rawSummary);
      const same=paragraph===summary;
      const summaryStartsWithParagraph=paragraph.length>=60&&summary.startsWith(paragraph);
      if(same||summaryStartsWithParagraph) first.remove();
      else if(comparable.length>=35){
        const escaped=rawSummary.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+");
        const match=first.textContent.match(new RegExp(`^\\s*${escaped}`,"i"));
        if(match){
          let removeCount=match[0].length, remaining=first.textContent.slice(removeCount);
          if(/^[\p{L}\p{N}]/u.test(remaining)) removeCount+=remaining.match(/^[\p{L}\p{N}]+/u)?.[0].length||0;
          const walker=doc.createTreeWalker(first,NodeFilter.SHOW_TEXT); let node;
          while(removeCount>0&&(node=walker.nextNode())){const count=Math.min(removeCount,node.nodeValue.length);node.nodeValue=node.nodeValue.slice(count);removeCount-=count;}
          if(!normalize(first.textContent)) first.remove();
          else if(first.firstChild?.nodeType===Node.TEXT_NODE) first.firstChild.nodeValue=first.firstChild.nodeValue.trimStart();
        }
      }
    }
  }
  return doc.body.innerHTML;
}
function rank(article) { const hay=[article.title,article.summary,...(article.categories||[])].join(" "); let best=0; for(const p of state.settings.priorities||[]) if(MMP.matchTerm(hay,p.term)) best=Math.max(best,{low:1,medium:2,high:3}[p.level]||0); return best; }
function previewImage(article){const image=cinemaArticle(article)?article.cinema?.image||article.image:article.image;return image?MMP.cleanUrl(image,article.canonicalUrl):"";}
function cinemaDuplicateKey(article){
  if(!cinemaArticle(article))return "";
  try{
    const url=new URL(article.canonicalUrl);
    for(const [name,value] of url.searchParams){if(name.toLowerCase()==="newsid"&&/^\d+$/.test(value))return `newsid:${value}`;}
  }catch{}
  const title=MMP.normalizeText(article.cinema?.title||article.title).replace(/\b(?:vf|vostfr|vost|vo|multi|720p|1080p|2160p|4k|web dl|webrip|blu ray|hdrip|dvdrip)\b/g," ").replace(/\s+/g," ").trim();
  const year=Number(article.cinema?.year)||Number((String(article.title||"").match(/\b(19\d{2}|20\d{2})\b/)||[])[1])||0;
  return title.length>=3&&year?`title:${title}:${year}`:"";
}
function cinemaCardScore(article){const cinema=article.cinema||{};return (cinema.title?2:0)+(cinema.year?1:0)+(cinema.description?2:0)+(cinema.image?4:0)+(cinema.rating?1:0)+(article.summary?1:0)+(cinema.source==="linked-page"?3:0);}
function eventDateLabel(event){const date=event?.dateText||(event?.startDate?new Intl.DateTimeFormat("fr-FR",{dateStyle:"long"}).format(new Date(event.startDate)):"");return [date,event?.timeText].filter(Boolean).join(" · ");}
function syncAffiliatePresentation(){
  const byId=new Map([...all,...pendingArticles,...(pendingByWall.get(state.activeWallId)||[])].map(article=>[article.id,article]));
  for(const node of document.querySelectorAll(".card[data-article-id]")){
    const data=byId.get(node.dataset.articleId);if(!data)continue;
    const body=node.querySelector(".expanded-article");if(body)renderAffiliateNotice(node,data,body);
    for(const description of node.querySelectorAll(".video-description")){const source=description.dataset.affiliateSourceText||description.textContent;appendAffiliateAnnotatedText(description,source);}
    const content=node.querySelector(".expanded-content");if(content){if(!affiliateModuleActive()){for(const anchor of content.querySelectorAll("a")){anchor.classList.remove("affiliate-link-highlight","affiliate-link-suspected");anchor.querySelectorAll(".affiliate-link-badge").forEach(badge=>badge.remove());anchor.removeAttribute("title");}}else highlightAffiliateAnchors(content);}
  }
}
function automaticExcludedKeywords(){
  const values=[...(state.settings?.excludedKeywords||[]),...Object.values(state.wallSettings||{}).flatMap(settings=>settings.excludedKeywords||[])];
  const unique=new Map();for(const item of values){const term=String(typeof item==="string"?item:item?.term||"").trim(),key=MMP.normalizeText(term);if(key&&!unique.has(key))unique.set(key,term);}return [...unique.values()];
}
function matchesExcludedKeyword(article,terms){return terms.some(term=>MMP.matchTerm(`${article.title||""} ${article.summary||""}`,term));}
function filterSort() {
  const cards=$("#cards"), previous=[...cards.children], previousCount=previous.length, pendingIds=new Set(pendingArticles.map(article=>article.id));
  const existing=new Map(previous.filter(node=>node.dataset.wallId===state.activeWallId).map(node=>[node.dataset.articleId,node]));
  const settings=state.settings||{}, excludes=(settings.excludedKeywords||[]).map(x=>typeof x==="string"?x:x.term).filter(Boolean), cats=(settings.excludedCategories||[]).map(MMP.normalizeText);
  const wallSourceIds=new Set(state.sources.filter(source=>(source.wallIds||[]).includes(state.activeWallId)).map(source=>source.id));
  const autoWall=state.autoWalls?.find(w=>w.id===state.activeWallId),autoExcludes=automaticExcludedKeywords();
  if(autoWall?.kind==="documents")wallSourceIds.add("internet-archive:documents");
  const blueskyPriorities=new Map();if(autoWall?.kind==="bluesky")for(const item of state.settings?.priorities||[]){const key=MMP.normalizeText(item.term),score={low:1,medium:2,high:3}[item.level]||2;if(key)blueskyPriorities.set(key,{term:item.term,score:Math.max(blueskyPriorities.get(key)?.score||0,score)});}
  const matchesBluesky=article=>[...blueskyPriorities.values()].filter(item=>MMP.matchTerm(`${article.title} ${article.summary||""}`,item.term));
  const matchesLinkedIn=article=>(article.linkedinKeywords||[]).filter(term=>blueskyPriorities.has(MMP.normalizeText(term))&&MMP.matchTerm(article.title||"",term));
  if(autoWall?.kind==="bluesky")for(const article of all){article.activeBlueskyTopics=isLinkedInResult(article)?[]:matchesBluesky(article).map(item=>item.term);article.activeLinkedInTopics=matchesLinkedIn(article);}
  const retentionCutoff=Date.now()-Math.max(1,Number(state.wallSettings?.[state.activeWallId]?.retentionDays)||30)*86400000;
  const languageFilter=!!autoWall&&["youtube","bluesky","documents"].includes(autoWall.kind)&&settings.languageFilterEnabled===true;
  visible=all.filter(a=>{if(pendingIds.has(a.id)||shouldHideAffiliate(a))return false;if(!autoWall)return !a.readingState&&Number(a.publishedAt||a.discoveredAt||0)>=retentionCutoff&&(a.sourceIds||[a.sourceId]).some(id=>wallSourceIds.has(id))&&!excludes.some(k=>MMP.matchTerm(`${a.title} ${a.summary}`,k))&&!(a.categories||[]).some(c=>cats.includes(MMP.normalizeText(c)));if(matchesExcludedKeyword(a,autoExcludes))return false;let eligible=autoWall.kind==="youtube"?!a.readingState&&isEligibleVideo(a):autoWall.kind==="bluesky"?!a.readingState&&(isEligibleBluesky(a)&&matchesBluesky(a).length>0||isEligibleLinkedIn(a)&&matchesLinkedIn(a).length>0):autoWall.kind==="documents"?!a.readingState&&a.documentKind==="pdf"&&a.documentLanguage==="fr"&&(a.sourceIds||[a.sourceId]).includes("internet-archive:documents"):a.readingState?.status===autoWall.status;return eligible&&(!languageFilter||passesLanguageFilter(a,autoWall));});
  const uniqueCinema=new Map(),nonCinema=[];
  for(const article of visible){const key=cinemaDuplicateKey(article);if(!key){nonCinema.push(article);continue;}const previous=uniqueCinema.get(key);if(!previous||cinemaCardScore(article)>cinemaCardScore(previous))uniqueCinema.set(key,article);}
  visible=[...nonCinema,...uniqueCinema.values()];
  const blueskyRank=article=>Math.max(0,...matchesBluesky(article).map(item=>item.score));
  visible.sort((a,b)=>{
    const priority=autoWall?.kind==="bluesky"&&!isLinkedInResult(a)&&!isLinkedInResult(b)?blueskyRank(b)-blueskyRank(a):autoWall?.kind==="bluesky"?0:settings.mode==="priority"?rank(b)-rank(a):0;
    if(priority)return priority;
    if(a.dateIsFallback&&b.dateIsFallback&&a.sourceOrderSourceId&&a.sourceOrderSourceId===b.sourceOrderSourceId&&Number.isInteger(a.sourceOrder)&&Number.isInteger(b.sourceOrder))return a.sourceOrder-b.sourceOrder;
    return b.publishedAt-a.publishedAt;
  });
  rendered=Math.min(Math.max(previousCount,renderFloor),visible.length); renderFloor=0;
  const retained=visible.slice(0,rendered).map(a=>{const node=existing.get(a.id)||card(a);node.dataset.articleId=a.id;return node;});
  cards.replaceChildren(...retained); draw(); $("#emptyState").hidden=visible.length>0;
  const wallSources=state.sources.filter(s=>(s.wallIds||[]).includes(state.activeWallId)),manualSourceCount=wallSources.length,enabled=wallSources.filter(s=>s.enabled).length+Number(state.automaticWalls?.internetArchive!==false&&(state.settings?.priorities||[]).length>0);
  const emptyTitle=$("#emptyTitle"),addSource=$("#emptyAddSource"),emptySteps=$("#emptySteps"),emptyHint=$("#emptyHint");emptySteps.hidden=true;emptyHint.hidden=true;if(autoWall?.kind==="bluesky"&&!blueskyPriorities.size){text(emptyTitle,"Complétez vos sujets prioritaires");text($("#empty"),"Ajoutez des sujets dans Préférences → Filtres sémantiques → Priorisation pour alimenter le mur Bluesky.");addSource.hidden=true;}else if(!autoWall&&!manualSourceCount){text(emptyTitle,"Votre mur est prêt !");text($("#empty"),"Commencez à suivre vos sites préférés pour retrouver leurs nouveautés ici.");emptySteps.hidden=false;emptyHint.hidden=false;addSource.hidden=false;addSource.textContent="Gérer mes sources";}else{text(emptyTitle,"Aucun article pour le moment");text($("#empty"),"Ajoutez des sources depuis leur site ou dans l’espace Sources.");addSource.hidden=true;}
  updateWallStatus(visible.length,enabled);
  updateMarkAllReadButton();
  updateWallTabCounts();
}
async function setReadingStatus(article,status){const result=await browser.runtime.sendMessage({type:"setArticleStatus",articleId:article.id,status});if(result?.error){text($("#status"),result.error);return;}all=await browser.runtime.sendMessage({type:"articles"});filterSort();if(status==="read"){keepNavigationCollapsedAtTop=true;$(".feed").scrollTo({top:0,behavior:"smooth"});}}
function articlesForCurrentWall(){const autoWall=state.autoWalls?.find(w=>w.id===state.activeWallId),autoExcludes=automaticExcludedKeywords(),byId=new Map([...pendingArticles,...(pendingByWall.get(state.activeWallId)||[]),...all].map(a=>[a.id,a]));if(autoWall?.kind==="youtube")return [...byId.values()].filter(a=>!matchesExcludedKeyword(a,autoExcludes)&&!shouldHideAffiliate(a)&&!a.readingState&&isEligibleVideo(a));if(autoWall?.kind==="bluesky")return [...byId.values()].filter(a=>!matchesExcludedKeyword(a,autoExcludes)&&!shouldHideAffiliate(a)&&!a.readingState&&(isEligibleBluesky(a)||isEligibleLinkedIn(a)));if(autoWall?.kind==="documents")return [...byId.values()].filter(a=>!matchesExcludedKeyword(a,autoExcludes)&&!shouldHideAffiliate(a)&&!a.readingState&&a.documentKind==="pdf"&&a.documentLanguage==="fr"&&(a.sourceIds||[a.sourceId]).includes("internet-archive:documents"));if(autoWall)return [];const settings=state.settings||{},excludes=(settings.excludedKeywords||[]).map(x=>typeof x==="string"?x:x.term).filter(Boolean),cats=(settings.excludedCategories||[]).map(MMP.normalizeText),sourceIds=new Set(state.sources.filter(s=>(s.wallIds||[]).includes(state.activeWallId)).map(s=>s.id));const cutoff=Date.now()-Math.max(1,Number(state.wallSettings?.[state.activeWallId]?.retentionDays)||30)*86400000;return [...byId.values()].filter(a=>!shouldHideAffiliate(a)&&!a.readingState&&Number(a.publishedAt||a.discoveredAt||0)>=cutoff&&(a.sourceIds||[a.sourceId]).some(id=>sourceIds.has(id))&&!excludes.some(k=>MMP.matchTerm(`${a.title} ${a.summary}`,k))&&!(a.categories||[]).some(c=>cats.includes(MMP.normalizeText(c))));}
function updateMarkAllReadButton(){const button=$("#markAllRead");if(!button)return;const autoWall=state?.autoWalls?.find(w=>w.id===state.activeWallId),videoWall=autoWall?.kind==="youtube"||autoWall?.kind==="bluesky"||autoWall?.kind==="documents";button.hidden=!!autoWall&&!videoWall;button.disabled=button.hidden||articlesForCurrentWall().length===0;const label=autoWall?.kind==="bluesky"||autoWall?.kind==="documents"?"Tout archiver":videoWall?"Tout archiver":"Tout marquer comme lu";button.title=label;button.setAttribute("aria-label",label);const confirm=$("#markAllReadDialog .confirm-action");if(confirm)confirm.textContent=label;}
function cinemaArticle(a){if(a.documentKind==="pdf")return false;return state.wallSettings?.[state.activeWallId]?.type==="cinema";}
function hasCinemaMatch(cinema){return cinema?.recognized===true||["allocine","wikipedia"].includes(cinema?.source);}
function cinemaKindLabel(cinema){return cinema?.kind==="series"?"Série":cinema?.kind==="film"?"Film":"";}
function cinemaRatingText(cinema){const ratings=Array.isArray(cinema?.ratings)&&cinema.ratings.length?cinema.ratings:[cinema?.rating!==undefined&&cinema?.rating!==null&&String(cinema.rating).trim()!==""?{kind:cinema.ratingKind||"",value:cinema.rating,scale:cinema.ratingScale,count:cinema.ratingCount,source:cinema.ratingSource||(cinema.source==="allocine"?"allocine":"")} : null].filter(Boolean);return [...ratings].sort((a,b)=>(a.kind==="spectateurs"?-1:0)-(b.kind==="spectateurs"?-1:0)).map(rating=>{if(rating.value===undefined||rating.value===null||String(rating.value).trim()==="")return "";const source={allocine:"AlloCiné",wikipedia:"Wikipédia",publisher:"Source de l’article"}[rating.source]||"";const kind=rating.kind?`${rating.kind[0].toLocaleUpperCase("fr-FR")}${rating.kind.slice(1)} `:"";const scale=rating.scale?`/${rating.scale}`:"";const count=rating.count?` · ${rating.count}`:"";return `★ ${kind}${rating.value}${scale}${source?` · ${source}`:""}${count}`;}).filter(Boolean).join(" · ");}
function renderPersuasionFindings(articleBody, content){
  const analysisRoot=content.querySelector(".bluesky-full-text,.bluesky-linked-content,.video-description")||content;
  return window.MMPersuasionAnnotations?.render(articleBody,analysisRoot,state?.settings?.persuasionDetectionEnabled===true);
}
function card(a) {
  const isBluesky=!!a.atUri&&(a.sourceIds||[a.sourceId]).includes("bluesky-keyword-search"),isLinkedIn=isLinkedInResult(a),isCinema=!isBluesky&&!isLinkedIn&&cinemaArticle(a); let blueskyPostText=null; const article=document.createElement("article"); article.className=`card${isCinema?" cinema-card":""}${isBluesky?" bluesky-post-card":""}${isLinkedIn?" linkedin-result-card":""}`;article.dataset.wallId=state.activeWallId;
  const meta=document.createElement("div"); meta.className="meta"; const source=articleSource(a);
  if(isBluesky){const postLink=document.createElement("a");postLink.className="bluesky-post-link";postLink.href=a.canonicalUrl;postLink.target="_blank";postLink.rel="noopener noreferrer";postLink.setAttribute("aria-label",`Ouvrir la publication de ${a.blueskyAuthor||a.blueskyHandle||"ce compte"} sur Bluesky`);const avatar=document.createElement("img");avatar.className="bluesky-avatar";avatar.alt="";const hasProfileAvatar=typeof a.blueskyAvatar==="string"&&a.blueskyAvatar.length>0;avatar.src=hasProfileAvatar?a.blueskyAvatar:PLATFORM_ICONS.Bluesky;if(!hasProfileAvatar)avatar.classList.add("bluesky-avatar-fallback");avatar.onerror=()=>{avatar.onerror=null;avatar.classList.add("bluesky-avatar-fallback");avatar.src=PLATFORM_ICONS.Bluesky;};const identity=document.createElement("span");identity.className="bluesky-identity";const name=document.createElement("strong");name.textContent=a.blueskyAuthor||a.blueskyHandle||"Compte Bluesky";identity.append(name);if(a.blueskyHandle){const handle=document.createElement("span");handle.className="bluesky-handle";handle.textContent=`@${a.blueskyHandle}`;identity.append(handle);}postLink.append(avatar,identity);const platformIcon=document.createElement("img");platformIcon.className="bluesky-platform-icon";platformIcon.src=PLATFORM_ICONS.Bluesky;platformIcon.alt="Bluesky";platformIcon.title="Bluesky";platformIcon.onerror=()=>{platformIcon.remove();};const dateLabel=document.createElement("time");dateLabel.className="bluesky-date";const published=new Date(a.publishedAt);if(Number.isFinite(published.getTime()))dateLabel.dateTime=published.toISOString();dateLabel.textContent=publishedDateLabel(a);meta.replaceChildren(postLink,...(hasProfileAvatar?[platformIcon]:[]),dateLabel);}
  const icon=document.createElement("img"); icon.className="source-icon"; icon.src=PLATFORM_ICONS[a.videoPlatform]||source?.faviconData||source?.faviconUrl||FALLBACK_FAVICON; icon.alt=""; icon.setAttribute("aria-hidden","true"); icon.onerror=()=>{icon.onerror=null;icon.src=FALLBACK_FAVICON;};
  const media=document.createElement("span"); media.className="media-name"; text(media,isLinkedIn?"LinkedIn · Google Actualités":a.documentKind==="pdf"?"PDF · Internet Archive":a.videoPlatform?`${a.videoPlatform} · ${source?.name||"Source"}`:source?.name||"Source supprimée");
  const eventDate=eventDateLabel(a.event);
  const date=document.createElement("span"); date.textContent=isLinkedIn?(a.googleNewsDate?`Date du flux Google : ${new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(a.googleNewsDate))}`:"Date inconnue dans le flux Google"):a.documentKind?`Document : ${a.documentDate?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(new Date(a.documentDate)):"date inconnue"} · archivé : ${a.archiveDate?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(new Date(a.archiveDate)):"date inconnue"}`:eventDate||(a.youtubePublishedLabel?`Publié ${a.youtubePublishedLabel}`:publishedDateLabel(a));
  if(!isBluesky)meta.append(icon,media,document.createTextNode(" · "),date);if(isLinkedIn&&a.linkedinAuthor){const author=document.createElement("span");author.className="linkedin-author";author.textContent=` · ${a.linkedinAuthor}`;meta.append(author);} article.append(meta);
  if(a.youtubeKeyword){const keyword=document.createElement("span");keyword.className="youtube-keyword-tag";keyword.textContent=a.youtubeKeyword;meta.append(document.createTextNode(" · "),keyword);}
  if(a.activeBlueskyTopics?.length){const topic=document.createElement("span");topic.className="youtube-keyword-tag";topic.textContent=a.activeBlueskyTopics.join(" · ");meta.append(document.createTextNode(" · "),topic);}
  if(a.activeLinkedInTopics?.length){const topic=document.createElement("span");topic.className="youtube-keyword-tag";topic.textContent=a.activeLinkedInTopics.join(" · ");meta.append(document.createTextNode(" · "),topic);}
  if(a.documentKind==="pdf"&&a.archiveKeyword){const topic=document.createElement("span");topic.className="youtube-keyword-tag";topic.textContent=a.archiveKeyword;meta.append(document.createTextNode(" · "),topic);}
  if(a.readingState?.updatedAt){const autoWall=state.autoWalls?.find(w=>w.id===state.activeWallId),days=a.readingState.status==="later"?(state.settings.laterRetentionDays||90):(state.settings.archiveRetentionDays||2);if(autoWall){const archive=document.createElement("p");archive.className="archive-meta muted";const archived=new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(a.readingState.updatedAt));archive.textContent=`${autoWall.status==="read"?"Archivé":"Enregistré"} le ${archived} · conservé ${days} jours`;article.append(archive);}}
  const cinemaInfo=isCinema&&hasCinemaMatch(a.cinema)?a.cinema:null, displayTitle=MMP.decodeHtmlEntities(cinemaInfo?.title||a.title);
  const link=document.createElement("a"); link.className="title"; link.href=isLinkedIn?(a.linkedinOriginalUrl||a.canonicalUrl):a.canonicalUrl; link.target="_blank"; link.rel="noopener noreferrer"; text(link,displayTitle); if(isBluesky){link.hidden=true;blueskyPostText=document.createElement("p");blueskyPostText.className="bluesky-post-text";blueskyPostText.textContent=a.summary||a.title||"";article.append(blueskyPostText);}else article.append(link);
  if(isLinkedIn)link.addEventListener("click",event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;if(state?.settings?.clickbaitDetectionEnabled===true&&link.classList.contains("has-clickbait"))return;event.preventDefault();browser.runtime.sendMessage({type:"openLinkedInResult",articleId:a.id}).then(result=>{if(result?.error)throw new Error(result.error);}).catch(error=>text($("#status"),`Ouverture LinkedIn impossible : ${error.message}`));});
  if(a.documentKind==="pdf"&&a.documentUrl){const pdf=document.createElement("a");pdf.className="original-link";pdf.href=a.documentUrl;pdf.target="_blank";pdf.rel="noopener noreferrer";pdf.textContent="Ouvrir le PDF ↗";article.append(pdf);}
  if(a.documentAuthor){const author=document.createElement("p");author.className="muted";author.textContent=`Auteur : ${a.documentAuthor}`;article.append(author);}
  let cinemaRating=null,cinemaFactLine=null,cinemaGenresLine=null;
  if(isCinema){cinemaFactLine=document.createElement("p");cinemaFactLine.className="cinema-line cinema-facts";cinemaFactLine.hidden=true;cinemaGenresLine=document.createElement("p");cinemaGenresLine.className="cinema-line cinema-genres";cinemaGenresLine.hidden=true;cinemaRating=document.createElement("span");cinemaRating.className="cinema-rating";cinemaRating.hidden=true;article.append(cinemaFactLine,cinemaRating,cinemaGenresLine);}
  const updateCinemaHeader=cinema=>{if(!isCinema)return;if(cinema?.title)link.textContent=MMP.decodeHtmlEntities(cinema.title);const facts=cinema?[cinemaKindLabel(cinema),cinema.year].filter(Boolean):[];cinemaFactLine.textContent=facts.join(" · ");cinemaFactLine.hidden=!facts.length;const audience=(cinema?.ratings||[]).find(rating=>rating.kind==="spectateurs")||cinema;const ratingValue=audience?.value??audience?.rating;const ratingScale=audience?.scale??audience?.ratingScale;const ratingSource={allocine:"AlloCiné",wikipedia:"Wikipédia",publisher:"Source de l’article"}[audience?.source||audience?.ratingSource||(cinema?.source==="allocine"?"allocine":"")]||"";cinemaRating.textContent=ratingValue!==undefined&&ratingValue!==null&&String(ratingValue).trim()!==""?`${ratingValue}${ratingScale?`/${ratingScale}`:""}${ratingSource?` · ${ratingSource}`:""}`:"";cinemaRating.hidden=!cinemaRating.textContent;cinemaGenresLine.textContent=(cinema?.genres||[]).join(" · ");cinemaGenresLine.hidden=!cinemaGenresLine.textContent;};
  if(cinemaInfo)updateCinemaHeader(cinemaInfo);
  let eventPlace=null;
  const updateEventDetails=event=>{
    if(!event)return;
    a.event={...(a.event||{}),...event};
    const label=eventDateLabel(a.event); if(label)date.textContent=label;
    if(a.event.place){if(!eventPlace){eventPlace=document.createElement("p");eventPlace.className="summary event-place";link.after(eventPlace);}text(eventPlace,a.event.place);}
    if(!a.summary&&a.event.description){a.summary=a.event.description;const excerpt=document.createElement("p");excerpt.className="summary";text(excerpt,summaryPreview(a.summary));(eventPlace||link).after(excerpt);}
  };
  if(a.event?.place){eventPlace=document.createElement("p");eventPlace.className="summary event-place";text(eventPlace,a.event.place);article.append(eventPlace);}
  if(a.event?.dateText&&(!a.event.timeText||!a.event.place))browser.runtime.sendMessage({type:"eventDetails",articleId:a.id}).then(result=>updateEventDetails(result?.event)).catch(()=>{});
  let cinemaSummaryFallback=null;const imageUrl=isBluesky?(a.blueskyPostImage||(!a.blueskyLink?a.image:"")):previewImage(a);let cinemaCover=null;if(imageUrl){const img=document.createElement("img");img.className=isBluesky?"cover bluesky-post-image":isCinema?"cover cinema-cover":"cover";img.src=MMP.cleanUrl(imageUrl,a.canonicalUrl);img.alt=isBluesky||isCinema?"Agrandir l’affiche":"";img.loading="lazy";img.referrerPolicy="no-referrer";if(isBluesky||isCinema){img.setAttribute("role","button");img.tabIndex=0;img.setAttribute("aria-label",isCinema?"Agrandir l’affiche":"Agrandir l’image de la publication");img.title="Cliquer pour agrandir";img.addEventListener("click",()=>openImagePreview(img));img.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopImmediatePropagation();openImagePreview(img);}});}if(isCinema)cinemaCover=img;img.onerror=()=>{removeCardCover(article,img);if(isCinema&&cinemaSummaryFallback)cinemaSummaryFallback.hidden=false;};placeCardCover(article,img);}
  if(isBluesky&&a.blueskyLink){const card=document.createElement("a");card.className="bluesky-link-card";card.href=a.blueskyLink;card.target="_blank";card.rel="noopener noreferrer";const linkImage=a.blueskyLinkImage||(!a.blueskyPostImage?a.image:"");if(linkImage){const img=document.createElement("img");img.src=MMP.cleanUrl(linkImage,a.blueskyLink);img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";img.onerror=()=>img.remove();card.append(img);}const details=document.createElement("span");details.className="bluesky-link-details";const heading=document.createElement("strong");heading.textContent=a.blueskyLinkTitle||(()=>{try{return new URL(a.blueskyLink).hostname;}catch{return a.blueskyLink;}})();details.append(heading);if(a.blueskyLinkDescription){const description=document.createElement("span");description.textContent=a.blueskyLinkDescription;details.append(description);}const domain=document.createElement("small");try{domain.textContent=new URL(a.blueskyLink).hostname;}catch{}details.append(domain);card.append(details);article.append(card);}
  const previewSummary=isCinema?(cinemaInfo?.description||a.summary):a.summary;
  if(previewSummary&&!isBluesky){const p=document.createElement("p");p.className=`summary${isCinema?" cinema-summary-fallback":""}`;text(p,isCinema?summaryPreview(previewSummary).slice(0,220):summaryPreview(previewSummary));if(isCinema&&cinemaCover)p.hidden=true;if(isCinema)cinemaSummaryFallback=p;article.append(p);}
  if(a.event?.category?.length){const tags=document.createElement("div");tags.className="tags";a.event.category.forEach(c=>{const t=document.createElement("span");text(t,c);tags.append(t);});article.append(tags);}
  if(a.categories?.length){const tags=document.createElement("div");tags.className="tags";a.categories.forEach(c=>{const t=document.createElement("span");text(t,c);tags.append(t);});article.append(tags);}
  const articleBody=document.createElement("section"); articleBody.className="expanded-article"; articleBody.id=`article-content-${a.id}`; articleBody.hidden=true;
  const status=document.createElement("p"); status.className="expanded-status muted"; status.setAttribute("role","status"); status.hidden=true;
  const content=document.createElement("div"); content.className="expanded-content";
  const original=document.createElement("a"); original.className="expanded-original"; original.href=a.linkedinOriginalUrl||a.canonicalUrl; original.target="_blank"; original.rel="noopener noreferrer"; original.textContent="Lire sur le site d’origine ↗"; original.hidden=true;
  const topCollapse=document.createElement("button");topCollapse.type="button";topCollapse.className="expand-toggle expanded-collapse-top";topCollapse.setAttribute("aria-controls",articleBody.id);topCollapse.setAttribute("aria-expanded","false");topCollapse.setAttribute("aria-label",`Développer l’article : ${a.title}`);topCollapse.textContent="↑ Replier";topCollapse.hidden=true;
  const readerToolbar=document.createElement("div");readerToolbar.className="expanded-toolbar";readerToolbar.append(topCollapse);
  articleBody.append(readerToolbar,status,content,original); article.append(articleBody);
  const actionBar=document.createElement("div");actionBar.className="article-actions";
  const toggle=document.createElement("button"); toggle.className="expand-toggle"; toggle.type="button"; toggle.setAttribute("aria-controls",articleBody.id); toggle.setAttribute("aria-expanded","false"); toggle.setAttribute("aria-label",`Développer l’article : ${a.title}`); toggle.textContent="⌄"; actionBar.append(toggle);
  renderAffiliateNotice(article,a,articleBody);
  const speechControls=document.createElement("div");speechControls.className="article-speech-controls";speechControls.hidden=true;
  const readButton=document.createElement("button");readButton.type="button";readButton.className="article-speech-button";readButton.setAttribute("aria-label",`Lire l’article à voix haute : ${a.title}`);readButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/></svg><span>Lire</span>';
  const pauseButton=document.createElement("button");pauseButton.type="button";pauseButton.className="speech-command speech-icon-command";pauseButton.setAttribute("aria-label","Pause");pauseButton.title="Pause";pauseButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';pauseButton.hidden=true;
  const stopButton=document.createElement("button");stopButton.type="button";stopButton.className="speech-command speech-icon-command";stopButton.setAttribute("aria-label","Arrêter");stopButton.title="Arrêter";stopButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';stopButton.hidden=true;
  let hasReadableText=false;
  const textForSpeech=()=>{
    if(!expanded||!articleBody.isConnected)return"";
    let source=content.querySelector(".bluesky-linked-content")||content;
    if(a.videoPlatform||a.documentKind==="pdf"||cinemaArticle(a))return"";
    const clone=source.cloneNode(true);clone.querySelectorAll("button,[role=button],.article-video,.video-box,.video-start,.video-original,.video-details,.youtube-details,.cinema-info,.bluesky-linked-heading,.bluesky-full-text").forEach(node=>node.remove());
    return (clone.innerText||clone.textContent||"").replace(/\s+/gu," ").trim();
  };
  const setSpeechState=state=>{
    const active=["speaking","paused"].includes(state);
    if(active)activeSpeechArticleId=a.id;else if(activeSpeechArticleId===a.id)activeSpeechArticleId="";
    pauseButton.hidden=!active;
    const paused=state==="paused";
    pauseButton.setAttribute("aria-label",paused?"Reprendre":"Pause");
    pauseButton.title=paused?"Reprendre":"Pause";
    pauseButton.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
    stopButton.hidden=!active;
    if(state==="ended"||state==="stopped"||state==="error"){pauseButton.hidden=true;stopButton.hidden=true;}
    if((state==="ended"||state==="stopped")&&status.textContent.startsWith("Aucune voix française disponible"))status.hidden=true;
    if(state==="error"){status.hidden=false;status.classList.add("expanded-error");status.textContent="Firefox n’a pas pu démarrer cette voix. Essayez une autre voix installée.";}
    if(state==="unavailable"){status.hidden=false;status.classList.remove("expanded-error");status.textContent=articleSpeech.voices().length?"Synthèse vocale indisponible dans cette version de Firefox.":"Firefox n’expose actuellement aucune voix de synthèse accessible.";}
  };
  const updateSpeechAvailability=()=>{hasReadableText=!!textForSpeech();speechControls.hidden=!expanded||!hasReadableText;const apiAvailable=!!articleSpeech.synth&&typeof window.SpeechSynthesisUtterance==="function",voiceAvailable=articleSpeech.voices().length>0;readButton.disabled=!apiAvailable||!voiceAvailable;if(expanded&&hasReadableText&&readButton.disabled){status.hidden=false;status.classList.remove("expanded-error");status.textContent=apiAvailable?"Firefox n’expose aucune voix de synthèse sur ce système.":"Synthèse vocale indisponible dans cette version de Firefox.";}else if(apiAvailable&&voiceAvailable&&status.textContent.startsWith("Firefox n’expose aucune voix de synthèse"))status.hidden=true;};
  speechControls.refreshAvailability=updateSpeechAvailability;
  readButton.onclick=()=>{const textToRead=textForSpeech();if(!textToRead)return;articleSpeech.speak(textToRead,state=>{if(state==="speaking"){const voice=articleSpeech.active?.voice;if(voice&&!String(voice.lang||"").toLowerCase().startsWith(articleSpeech.language.toLowerCase().split("-")[0])){status.hidden=false;status.classList.remove("expanded-error");status.textContent=`Voix de remplacement : ${voice.name} (${voice.lang||"langue inconnue"}).`;}}setSpeechState(state);});};
  pauseButton.onclick=()=>{if(pauseButton.getAttribute("aria-label")==="Reprendre")articleSpeech.resume();else articleSpeech.pause();};
  stopButton.onclick=()=>articleSpeech.stop();
  speechControls.append(readButton,pauseButton,stopButton);readerToolbar.append(speechControls);
  const autoWall=state.autoWalls?.find(w=>w.id===state.activeWallId);
  const addAction=(label,icon,status)=>{const button=document.createElement("button");button.type="button";button.className="article-action";button.title=label;button.setAttribute("aria-label",`${label} : ${a.title}`);button.innerHTML=icon;button.onclick=()=>setReadingStatus(a,status);actionBar.append(button);};
  if(autoWall?.status!=="read")addAction(autoWall?.kind==="youtube"?"Archiver":"Marquer comme lu",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 12 4 4L17 6M11 12l4 4L22 8"/></svg>',"read");
  if(autoWall?.status!=="later")addAction("Enregistrer pour plus tard",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.75h12v17l-6-4-6 4z"/></svg>',"later");
  const like=document.createElement("button");like.type="button";like.className="article-action like-action";like.dataset.likeUrl=MMP.normalizeContentUrl(a.canonicalUrl);like.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 5-8a3 3 0 0 1 2 3l-1 5h6a3 3 0 0 1 3 3l-2 7a3 3 0 0 1-3 2H7"/></svg>';
  const paintLike=liked=>{like.classList.toggle("is-liked",liked);like.setAttribute("aria-pressed",String(liked));like.title=liked?"Retirer le J’aime":"J’aime";like.setAttribute("aria-label",`${liked?"Retirer le J’aime":"J’aime"} : ${a.title}`);a.liked=liked;};paintLike(!!a.liked);
  like.onclick=async()=>{like.disabled=true;try{const result=await browser.runtime.sendMessage({type:"toggleLike",article:a});paintLike(!!result?.liked);}catch(error){text($("#status"),`Erreur : ${error.message}`);}finally{like.disabled=false;}};actionBar.append(like);
  article.append(actionBar);
  let cover=article.querySelector(".cover"); let expanded=false, generation=0, contentRequest=null, loadedPlayer=null, loadedHls=null, loadedDash=null, videoInfo=null, videoOriginal=null;
  const mountVideo=async(userInitiated=true)=>{
    if(!videoInfo)return;
    if(videoInfo.kind==="unavailable"||videoInfo.kind==="francetv"){
      let pageOrigin;try{pageOrigin=`${new URL(a.canonicalUrl).origin}/*`;}catch{showVideoFallback("Vidéo indisponible dans Mon Mur.");return;}
      const origins=[pageOrigin];if(videoInfo.kind==="francetv")origins.push("https://proxy-mediation.yatta.francetv.fr/*","https://hdfauth.ftven.fr/*","https://*.ftven.fr/*");
      try{
        let access=await browser.permissions.contains({origins});
        if(!access)access=await browser.permissions.request({origins});
        if(!access){showVideoFallback("Vidéo indisponible dans Mon Mur : l’accès au lecteur est refusé dans Firefox.");return;}
        status.hidden=false;status.classList.remove("expanded-error");status.textContent=videoInfo.kind==="francetv"?"Préparation du lecteur vidéo…":"Recherche d’un flux vidéo déjà chargé dans Firefox…";
        const token=generation,result=videoInfo.kind==="francetv"?await browser.runtime.sendMessage({type:"resolveFranceTvVideo",videoId:videoInfo.id,pageUrl:a.canonicalUrl}):await browser.runtime.sendMessage({type:"probeArticleVideo",articleId:a.id});
        if(token!==generation||!expanded||!article.isConnected)return;
        if(["file","hls","dash"].includes(result?.kind)&&result.src){videoInfo={...videoInfo,...result};await mountVideo(userInitiated);return;}
        showVideoFallback(result?.error||"Vidéo indisponible dans Mon Mur.");
      }catch{showVideoFallback("Vidéo indisponible dans Mon Mur : Firefox n’a pas trouvé de flux lisible déjà chargé.");}
      return;
    }
    // The parent document cannot reliably observe play events inside a
    // cross-origin iframe. Claim the single-player slot when the user asks
    // to open a player, before mounting it.
    announceVideoStart(a.id);
    if(videoInfo.kind==="hls"){
      let mediaOrigin;try{mediaOrigin=`${new URL(videoInfo.src).origin}/*`;}catch{mediaOrigin="";}
      try{
        if(mediaOrigin){const access=userInitiated?browser.permissions.request({origins:[mediaOrigin]}):browser.permissions.contains({origins:[mediaOrigin]});if(!await access){if(userInitiated)showVideoFallback("Autorisez l’accès au serveur vidéo pour lire ce flux.");else{status.hidden=false;status.textContent="Flux détecté. Cliquez sur Lire la vidéo pour autoriser son serveur dans Firefox et lancer le lecteur.";}return;}}
        const HlsLibrary=await loadHlsLibrary();
        if(!HlsLibrary?.isSupported()){showVideoFallback("La lecture HLS n’est pas prise en charge par ce navigateur.");return;}
        const frame=document.createElement("video");frame.controls=true;frame.playsInline=true;frame.preload="auto";frame.muted=false;frame.defaultMuted=false;frame.volume=1;if(videoInfo.poster)frame.poster=videoInfo.poster;
        const hls=new HlsLibrary({enableWorker:false});loadedHls=hls;loadedPlayer=frame;
        hls.on(HlsLibrary.Events.ERROR,(_,data)=>{if(!data.fatal)return;hls.destroy();if(loadedHls===hls)loadedHls=null;if(loadedPlayer===frame)loadedPlayer=null;showVideoFallback(describeHlsFatalError(data));});
        hls.on(HlsLibrary.Events.MANIFEST_PARSED,()=>{frame.play().catch(()=>{status.hidden=false;status.textContent="Le lecteur est prêt avec le son activé. Si Firefox bloque le démarrage, appuyez sur Lecture dans les commandes vidéo.";});});
        hls.on(HlsLibrary.Events.MEDIA_ATTACHED,()=>hls.loadSource(videoInfo.src));
        videoBox.replaceChildren(frame);if(cover)cover.hidden=true;hls.attachMedia(frame);
      }catch(error){showVideoFallback(`Impossible de préparer ce flux : ${error.message}`);}
      return;
    }
    if(videoInfo.kind==="dash"){
      try{
        const DashLibrary=await loadDashLibrary();
        const frame=document.createElement("video");frame.controls=true;frame.playsInline=true;frame.preload="auto";frame.muted=false;frame.defaultMuted=false;frame.volume=1;if(videoInfo.poster)frame.poster=videoInfo.poster;
        const player=DashLibrary.MediaPlayer().create();loadedDash=player;loadedPlayer=frame;
        player.on(DashLibrary.MediaPlayer.events.ERROR,()=>{if(loadedDash!==player)return;player.reset();loadedDash=null;if(loadedPlayer===frame)loadedPlayer=null;showVideoFallback("Le flux DASH n’a pas pu être lu dans Mon Mur.");});
        frame.addEventListener("error",()=>{if(loadedDash!==player)return;player.reset();loadedDash=null;if(loadedPlayer===frame)loadedPlayer=null;showVideoFallback("Le flux DASH n’a pas pu être lu dans Mon Mur.");},{once:true});
        videoBox.replaceChildren(frame);if(cover)cover.hidden=true;player.initialize(frame,videoInfo.src,true);
      }catch(error){showVideoFallback(`Impossible de préparer ce flux : ${error.message}`);}
      return;
    }
    const frame=document.createElement(videoInfo.kind==="file"?"video":"iframe");
    if(videoInfo.kind==="file"){frame.src=videoInfo.src;frame.controls=true;frame.playsInline=true;frame.preload="auto";frame.muted=false;frame.defaultMuted=false;frame.volume=1;if(videoInfo.poster)frame.poster=videoInfo.poster;}
    else {frame.src=videoInfo.src;frame.title=`Vidéo : ${a.title}`;frame.allow="fullscreen; picture-in-picture";frame.referrerPolicy="strict-origin-when-cross-origin";frame.allowFullscreen=true;}
    if(videoInfo.kind==="file")frame.addEventListener("error",()=>{loadedPlayer=null;showVideoFallback("Cette vidéo ne peut pas être lue ici.");},{once:true});
    loadedPlayer=frame; videoBox.replaceChildren(frame); if(cover)cover.hidden=true;
    if(videoInfo.kind==="file")frame.play().catch(()=>{status.hidden=false;status.textContent="Le lecteur est prêt avec le son activé. Si Firefox bloque le démarrage, appuyez sur Lecture dans les commandes vidéo.";});
  };
  const showVideoFallback=messageText=>{videoBox.replaceChildren();const message=document.createElement("p");message.className="video-fallback";const detail=String(messageText||"").trim();message.textContent=/^Vidéo indisponible dans Mon Mur\b/.test(detail)?detail:`Vidéo indisponible dans Mon Mur. ${detail}`.trim();videoBox.append(message);if(cover)cover.hidden=false;};
  const videoBox=document.createElement("div"); videoBox.className="article-video";
  article.stopActiveVideo=()=>{if(!loadedPlayer&&!loadedHls&&!loadedDash)return;loadedHls?.destroy();loadedHls=null;loadedDash?.reset();loadedDash=null;loadedPlayer?.pause?.();loadedPlayer?.removeAttribute("src");if(loadedPlayer)loadedPlayer.src="about:blank";loadedPlayer?.remove();loadedPlayer=null;const restart=document.createElement("button");restart.type="button";restart.className="video-start";restart.textContent="▶ Relancer la vidéo";restart.onclick=mountVideo;videoBox.replaceChildren(restart);};
  const showResult=(result,token,autoStartVideo=false)=>{
    if(token!==generation||!expanded||!article.isConnected) return;
    status.hidden=false; content.replaceChildren(); original.hidden=true;
    if(cinemaArticle(a)&&result?.cinema&&hasCinemaMatch(result.cinema)){
      const cinema=result?.cinema;
      if(!cinema||cinema.error){status.textContent=cinema?.error||"La fiche cinéma est indisponible.";status.classList.add("expanded-error");return;}
      a.cinema=cinema;updateCinemaHeader(cinema);
      const box=document.createElement("aside");box.className="cinema-info";
      const heading=document.createElement("h3");heading.textContent=MMP.decodeHtmlEntities(cinema.title||displayTitle);box.append(heading);const subheading=document.createElement("p");subheading.className="cinema-detail-subtitle";subheading.textContent=[cinemaKindLabel(cinema),cinema.year].filter(Boolean).join(" · ");if(subheading.textContent)box.append(subheading);
      if(cinema.originalTitle&&MMP.normalizeText(cinema.originalTitle)!==MMP.normalizeText(cinema.title)){const p=document.createElement("p");p.textContent=`Titre original : ${cinema.originalTitle}`;box.append(p);}
      const detailedRatings=Array.isArray(cinema.ratings)&&cinema.ratings.length?cinema.ratings:[cinema.rating!==undefined&&cinema.rating!==null&&String(cinema.rating).trim()!==""?{kind:"spectateurs",value:cinema.rating,scale:cinema.ratingScale,count:cinema.ratingCount,source:cinema.ratingSource}:null].filter(Boolean);if(detailedRatings.length){const ratings=document.createElement("div");ratings.className="cinema-rating-grid";for(const rating of detailedRatings){const item=document.createElement("section");item.className="cinema-rating-detail";const label=document.createElement("span");label.textContent=`${rating.kind?rating.kind[0].toLocaleUpperCase("fr-FR")+rating.kind.slice(1):"Note"}${rating.source?` · ${{allocine:"AlloCiné",wikipedia:"Wikipédia",publisher:"Source de l’article"}[rating.source]||rating.source}`:""}`;const value=document.createElement("strong");value.textContent=`${rating.value}${rating.scale?`/${rating.scale}`:""}`;item.append(label,value);if(rating.count){const count=document.createElement("small");count.textContent=rating.count;item.append(count);}ratings.append(item);}box.append(ratings);}
      if(cinema.description){const synopsis=document.createElement("section");synopsis.className="cinema-detail-section";const label=document.createElement("h4");label.textContent="Synopsis";const p=document.createElement("p");p.textContent=cinema.description;synopsis.append(label,p);box.append(synopsis);}
      for(const [labelText,values] of [["Genres",cinema.genres],["Réalisation",cinema.director],["Distribution",cinema.actors]])if(values?.length){const section=document.createElement("section");section.className="cinema-detail-section";const label=document.createElement("h4");label.textContent=labelText;const p=document.createElement("p");p.textContent=values.join(", ");section.append(label,p);box.append(section);}
      if(cinema.url&&["allocine","wikipedia"].includes(cinema.source)){const aLink=document.createElement("a");aLink.href=cinema.url;aLink.target="_blank";aLink.rel="noopener noreferrer";aLink.textContent=`Consulter la fiche ${cinema.source==="allocine"?"sur AlloCiné":"sur Wikipédia"} ↗`;box.append(aLink);}
      content.append(box);status.hidden=true;status.classList.remove("expanded-error");renderPersuasionFindings(articleBody,content);
      if(cinema.image){article.classList.add("cinema-card");const fallback=article.querySelector(".cinema-summary-fallback");if(fallback)fallback.hidden=true;if(!cover){cover=document.createElement("img");cover.className="cover cinema-cover";cover.alt="Agrandir l’affiche";cover.loading="lazy";cover.referrerPolicy="no-referrer";cover.setAttribute("role","button");cover.tabIndex=0;cover.setAttribute("aria-label","Agrandir l’affiche");cover.title="Cliquer pour agrandir";cover.addEventListener("click",()=>openImagePreview(cover));cover.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();openImagePreview(cover);}});cover.onerror=()=>{removeCardCover(article,cover);if(fallback)fallback.hidden=false;};placeCardCover(article,cover,link);}cover.src=cinema.image;}
      return;
    }
    if(result?.error){status.textContent=`Le texte complet est indisponible : ${result.error}`; status.classList.add("expanded-error"); original.hidden=false;if(result?.cinema&&!result.cinema.status){const box=document.createElement("aside");box.className="cinema-info";if(result.cinema.error)box.textContent=result.cinema.error;else{const heading=document.createElement("h3");heading.textContent=`Fiche AlloCiné · ${result.cinema.title}${result.cinema.year?` (${result.cinema.year})`:""}`;box.append(heading);if(result.cinema.description){const synopsis=document.createElement("p");synopsis.textContent=result.cinema.description;box.append(synopsis);}if(result.cinema.url){const sourceLink=document.createElement("a");sourceLink.href=result.cinema.url;sourceLink.target="_blank";sourceLink.rel="noopener noreferrer";sourceLink.textContent="Fiche sur AlloCiné ↗";box.append(sourceLink);}}content.append(box);} return;}
    if(result?.event){a.event={...(a.event||{}),...result.event};if(!a.summary&&result.event.description){a.summary=result.event.description;const excerpt=document.createElement("p");excerpt.className="summary";text(excerpt,summaryPreview(a.summary));article.querySelector(".title")?.after(excerpt);}}
    if(result?.cinema){a.cinema=result.cinema;const box=document.createElement("aside");box.className="cinema-info";if(result.cinema.error){box.textContent=result.cinema.error;}else{const heading=document.createElement("h3");heading.textContent=`Fiche AlloCiné · ${result.cinema.title}${result.cinema.year?` (${result.cinema.year})`:""}`;box.append(heading);if(result.cinema.originalTitle&&MMP.normalizeText(result.cinema.originalTitle)!==MMP.normalizeText(result.cinema.title)){const originalTitle=document.createElement("p");originalTitle.textContent=`Titre original : ${result.cinema.originalTitle}`;box.append(originalTitle);}if(result.cinema.description){const synopsis=document.createElement("p");synopsis.textContent=result.cinema.description;box.append(synopsis);}if(result.cinema.rating){const rating=document.createElement("p");rating.textContent=`Note : ${result.cinema.rating}${result.cinema.ratingCount?` (${result.cinema.ratingCount} avis)`:""}`;box.append(rating);}for(const [label,values] of [["Genres",result.cinema.genres],["Réalisation",result.cinema.director],["Avec",result.cinema.actors]])if(values?.length){const p=document.createElement("p");p.textContent=`${label} : ${values.join(", ")}`;box.append(p);}if(result.cinema.url){const sourceLink=document.createElement("a");sourceLink.href=result.cinema.url;sourceLink.target="_blank";sourceLink.rel="noopener noreferrer";sourceLink.textContent="Fiche sur AlloCiné ↗";box.append(sourceLink);}if(result.cinema.image){article.classList.add("cinema-card");if(!cover){cover=document.createElement("img");cover.className="cover cinema-cover";cover.alt="";cover.loading="lazy";cover.referrerPolicy="no-referrer";cover.onerror=()=>removeCardCover(article,cover);placeCardCover(article,cover,article.querySelector(".title"));}cover.classList.add("cinema-cover");cover.src=result.cinema.image;}}content.prepend(box);}
    const candidate=MMP.cleanUrl(result?.image||a.image,a.canonicalUrl);
    if(candidate){a.image=candidate;if(!cover){cover=document.createElement("img");cover.className=cinemaArticle(a)?"cover cinema-cover":"cover";cover.alt="";cover.loading="lazy";cover.referrerPolicy="no-referrer";cover.onerror=()=>removeCardCover(article,cover);placeCardCover(article,cover,article.querySelector(".title"));}if(cinemaArticle(a))cover.classList.add("cinema-cover");cover.src=candidate;}
    videoInfo=result.video||null;
    const safe=cleanReaderContent(MMP.sanitizeArticleHtml(result?.html||"",a.canonicalUrl),a,articleSource(a));
    if(!safe.trim()&&!videoInfo){status.textContent="Aucun texte complet n’a pu être extrait.";status.classList.add("expanded-error");original.hidden=false;return;}
    status.hidden=true; status.classList.remove("expanded-error"); content.innerHTML=safe;highlightAffiliateAnchors(content);renderAffiliateNotice(article,a,articleBody,affiliateFindingsInContent(a,content));resolveAffiliateFindings(a,article,articleBody,content);renderPersuasionFindings(articleBody,content);if(state?.settings?.hideAffiliatedContent===true&&shouldHideAffiliate(a))filterSort();enableExpandedImageZoom(content);updateSpeechAvailability();
    const inlineVideoBlock=[...content.querySelectorAll("p")].find(node=>node.textContent.trim().startsWith("MONMUR_VIDEO_BLOCK"));
    const previewUrl=MMP.cleanUrl(videoInfo?.poster||a.image,a.canonicalUrl);
    const makeVideoPreview=()=>{const img=document.createElement("img");img.src=previewUrl;img.alt="Aperçu de la vidéo";img.loading="lazy";img.referrerPolicy="no-referrer";return img;};
    const makeVideoCaption=()=>{if(!videoInfo?.caption)return null;const caption=document.createElement("p");caption.className="video-caption";caption.textContent=videoInfo.caption;return caption;};
    if(videoInfo){if(cover)cover.hidden=true;const button=document.createElement("button");button.type="button";button.className="video-start";button.onclick=mountVideo;if(previewUrl)button.append(makeVideoPreview());const label=document.createElement("span");label.textContent="▶ Lire la vidéo";button.append(label);videoOriginal=document.createElement("a");videoOriginal.href=a.canonicalUrl;videoOriginal.target="_blank";videoOriginal.rel="noopener noreferrer";videoOriginal.className="video-original";videoOriginal.textContent="Voir la vidéo sur le site original ↗";videoBox.replaceChildren(button);const caption=makeVideoCaption();if(inlineVideoBlock){inlineVideoBlock.replaceWith(videoBox,videoOriginal,...(caption?[caption]:[]));original.hidden=true;}else content.prepend(videoBox,videoOriginal,...(caption?[caption]:[]));if(autoStartVideo&&["hls","file"].includes(videoInfo.kind))mountVideo(false);}
  };
  const showYouTubeVideo=(videoId,token)=>{
    if(token!==generation||!expanded||!article.isConnected)return;
    // Ask YouTube for HD when available; its adaptive player still chooses a
    // lower rendition if bandwidth or device capability requires it. Explicit
    // controls keep the quality menu available in the embedded player.
    const embedUrl=`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&loop=0&vq=hd1080&controls=1`;
    videoInfo={kind:"embed",src:embedUrl};
    const start=document.createElement("button");start.type="button";start.className="video-start";start.onclick=mountVideo;
    const preview=MMP.cleanUrl(a.image,a.canonicalUrl);if(preview){const img=document.createElement("img");img.src=preview;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";start.append(img);}
    const label=document.createElement("span");label.textContent="▶ Lire la vidéo";start.append(label);videoBox.replaceChildren(start);
    const details=videoDetails(a);
    content.replaceChildren(videoBox,details);status.hidden=true;status.classList.remove("expanded-error");original.hidden=true;renderPersuasionFindings(articleBody,content);loadVideoMetadata(a,article,token);
  };
  const showPeerTubeVideo=token=>{
    if(token!==generation||!expanded||!article.isConnected)return;
    let source;try{source=new URL(a.canonicalUrl);}catch{return;}
    const videoId=source.pathname.match(/^\/videos\/watch\/([^/]+)/)?.[1];
    if(source.protocol!=="https:"||!videoId)return;
    const embedUrl=`${source.origin}/videos/embed/${encodeURIComponent(videoId)}`;
    const preview=document.createElement("button");preview.type="button";preview.className="video-start";preview.onclick=()=>{videoInfo={kind:"embed",src:embedUrl};mountVideo();};
    if(a.image){const img=document.createElement("img");img.src=MMP.cleanUrl(a.image,a.canonicalUrl);img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";preview.append(img);}
    const label=document.createElement("span");label.textContent="▶ Lire la vidéo";preview.append(label);videoBox.replaceChildren(preview);
    const linkOut=document.createElement("a");linkOut.href=a.canonicalUrl;linkOut.target="_blank";linkOut.rel="noopener noreferrer";linkOut.className="video-original";linkOut.textContent="Si l’instance refuse l’intégration, ouvrir sur PeerTube ↗";
    content.replaceChildren(videoBox,linkOut,videoDetails(a));status.hidden=true;status.classList.remove("expanded-error");original.hidden=true;renderPersuasionFindings(articleBody,content);loadVideoMetadata(a,article,token);
  };
  const showPublicPlatformVideo=token=>{
    if(token!==generation||!expanded||!article.isConnected)return;
    const details=videoDetails(a),platformLink=document.createElement("a");
    platformLink.href=a.canonicalUrl;platformLink.target="_blank";platformLink.rel="noopener noreferrer";platformLink.className="video-original";
    platformLink.textContent=`Ouvrir la vidéo sur ${a.videoPlatform} ↗`;
    if(a.videoPlatform==="Rumble"){
      const preview=document.createElement("button");preview.type="button";preview.className="video-start";
      if(a.image){const img=document.createElement("img");img.src=MMP.cleanUrl(a.image,a.canonicalUrl);img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";preview.append(img);}
      const label=document.createElement("span");label.textContent="▶ Lire sur Rumble";preview.append(label);
      preview.onclick=async()=>{preview.disabled=true;status.hidden=false;status.classList.remove("expanded-error");status.textContent="Préparation du lecteur Rumble…";try{const result=a.rumbleEmbedUrl?{embedUrl:a.rumbleEmbedUrl}:await browser.runtime.sendMessage({type:"rumbleEmbedUrl",url:a.canonicalUrl});if(token!==generation||!expanded||!article.isConnected)return;if(!result?.embedUrl)throw new Error(result?.error||"Rumble n’a pas fourni son lecteur intégré.");a.rumbleEmbedUrl=result.embedUrl;videoInfo={kind:"embed",src:result.embedUrl};status.hidden=true;mountVideo();}catch(error){if(token!==generation||!expanded||!article.isConnected)return;status.textContent=`Impossible de démarrer cette vidéo : ${error.message}`;status.classList.add("expanded-error");preview.disabled=false;label.textContent="▶ Réessayer sur Rumble";}};
      videoBox.replaceChildren(preview);content.replaceChildren(videoBox,platformLink,details);
    }else content.replaceChildren(platformLink,details);
    status.hidden=true;status.classList.remove("expanded-error");original.hidden=true;renderPersuasionFindings(articleBody,content);
  };
  const showCrowdBunkerVideo=token=>{
    if(token!==generation||!expanded||!article.isConnected)return;
    let source;try{source=new URL(a.canonicalUrl);}catch{return;}
    const videoId=source.pathname.match(/^\/v\/([^/]+)/)?.[1];
    if(source.protocol!=="https:"||source.hostname!=="crowdbunker.com"||!videoId){showPublicPlatformVideo(token);return;}
    const embedUrl=`https://crowdbunker.com/embed/${encodeURIComponent(videoId)}`;
    const preview=document.createElement("button");preview.type="button";preview.className="video-start";preview.setAttribute("aria-label","Lire cette vidéo CrowdBunker dans Mon Mur");
    const image=MMP.cleanUrl(a.image,a.canonicalUrl);if(image){const img=document.createElement("img");img.src=image;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";preview.append(img);}
    const label=document.createElement("span");label.textContent="▶ Lire sur CrowdBunker";preview.append(label);
    preview.onclick=()=>{videoInfo={kind:"embed",src:embedUrl};mountVideo();};
    const fallback=document.createElement("a");fallback.href=a.canonicalUrl;fallback.target="_blank";fallback.rel="noopener noreferrer";fallback.className="video-original";fallback.textContent="Si le lecteur intégré ne fonctionne pas, ouvrir sur CrowdBunker ↗";
    videoBox.replaceChildren(preview);content.replaceChildren(videoBox,fallback,videoDetails(a));status.hidden=true;status.classList.remove("expanded-error");original.hidden=true;renderPersuasionFindings(articleBody,content);
  };
  const toggleArticle=async()=>{
    expanded=!expanded;
    for(const control of [toggle,topCollapse]){
      control.setAttribute("aria-expanded",String(expanded));
      control.setAttribute("aria-label",`${expanded?"Replier":"Développer"} l’article : ${a.title}`);
    }
    toggle.textContent="⌄";
    topCollapse.textContent="↑ Replier";
    toggle.hidden=expanded;
    topCollapse.hidden=!expanded;
    articleBody.hidden=!expanded;
    const token=++generation;
    if(!expanded) {if(activeSpeechArticleId===a.id)articleSpeech.stop();if(isLinkedInResult(a))browser.runtime.sendMessage({type:"cancelLinkedInResolution",articleId:a.id}).catch(()=>{});speechControls.hidden=true;if(loadedPlayer){loadedPlayer.removeAttribute("src");loadedPlayer.load?.();loadedPlayer=null;}if(videoInfo)videoBox.replaceChildren();if(cover)cover.hidden=false;article.scrollIntoView({block:"start"});return;}
    if(a.videoPlatform==="PeerTube"){status.hidden=false;status.classList.remove("expanded-error");status.textContent="Préparation du lecteur PeerTube…";showPeerTubeVideo(token);return;}
    if(a.videoPlatform==="CrowdBunker"){showCrowdBunkerVideo(token);return;}
    if(a.videoPlatform==="Rumble"){showPublicPlatformVideo(token);return;}
    const youtubeId=youtubeVideoId(a);if(youtubeId){status.hidden=false;status.classList.remove("expanded-error");status.textContent="Chargement de la vidéo…";showYouTubeVideo(youtubeId,token);return;}
    if(isLinkedInResult(a)){
      content.replaceChildren();
      const showLinkedInEmbed=()=>{
        content.replaceChildren();
        if(a.linkedinActivityUrn){const frame=document.createElement("iframe");frame.className="linkedin-official-embed";frame.src=`https://www.linkedin.com/embed/feed/update/${a.linkedinActivityUrn}`;frame.title="Publication LinkedIn intégrée par LinkedIn";frame.loading="lazy";frame.referrerPolicy="strict-origin-when-cross-origin";frame.setAttribute("allowfullscreen","");frame.style.width="100%";/* LinkedIn's cross-origin embed cannot be measured for auto-sizing; make it tall enough for full post text and media so the wall remains the main scroller. */frame.style.height="1100px";frame.style.border="0";content.append(frame);}
      };
      const addFallback=()=>{const link=document.createElement("a");link.href=a.linkedinOriginalUrl||a.canonicalUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent=a.linkedinOriginalUrl?"Ouvrir la publication LinkedIn ↗":"Ouvrir le résultat Google Actualités ↗";content.append(link);};
      const resolveLinkedIn=async()=>{
        status.hidden=false;status.classList.remove("expanded-error");status.classList.add("linkedin-loading");status.textContent="Chargement de la publication LinkedIn…";
        content.replaceChildren();
        try{
          const result=await browser.runtime.sendMessage({type:"resolveLinkedInOnExpand",articleId:a.id});
          if(token!==generation||!expanded||!article.isConnected)return;
          if(result?.article){Object.assign(a,result.article);status.classList.remove("linkedin-loading");status.hidden=true;status.classList.remove("expanded-error");showLinkedInEmbed();addFallback();return;}
          if(result?.cancelled)return;
          throw new Error(result?.error||"Récupération impossible.");
        }catch(error){
          if(token!==generation||!expanded||!article.isConnected)return;
          status.classList.remove("linkedin-loading");status.hidden=false;status.textContent="Publication indisponible en lecture intégrée";status.title=error.message;status.classList.add("expanded-error");
          addFallback();const retry=document.createElement("button");retry.type="button";retry.className="linkedin-retry";retry.textContent="Réessayer";retry.onclick=()=>resolveLinkedIn();content.append(retry);
        }
      };
      if(a.linkedinOriginalUrl){showLinkedInEmbed();addFallback();status.hidden=true;status.classList.remove("expanded-error","linkedin-loading");}
      else resolveLinkedIn();
      original.hidden=true;return;
    }
    if(a.atUri){
      const full=document.createElement("p");full.className="summary bluesky-full-text";full.textContent=a.summary||a.title;content.replaceChildren(full);renderPersuasionFindings(articleBody,content);
      status.hidden=false;status.classList.remove("expanded-error");status.textContent="Recherche du lien et récupération de l’article…";
      // Firefox only accepts an optional host permission while handling the
      // user gesture, so request it before the metadata lookup awaits network.
      if(!contentRequest)contentRequest=browser.permissions.request({origins:["<all_urls>"]}).then(granted=>{
        if(!granted)return {error:"Autorisation Firefox refusée. Accordez l’accès aux sites dans les préférences pour charger les liens."};
        return browser.runtime.sendMessage({type:"resolveBlueskyLink",articleId:a.id}).then(async resolved=>{
        if(!resolved?.url)return {noLink:true,error:resolved?.error||"Aucun lien externe n’a été trouvé dans cette publication."};
        a.blueskyLink=resolved.url;a.blueskyLinkTitle=resolved.title||"";
        return browser.runtime.sendMessage({type:"readArticle",articleId:a.id});
        });
      });
      contentRequest.then(result=>{
        if(token!==generation||!expanded||!article.isConnected)return;
        if(result?.noLink){status.textContent="Cette publication ne contient pas de lien externe détectable.";status.classList.remove("expanded-error");original.href=a.canonicalUrl;original.textContent="Ouvrir la publication sur Bluesky ↗";original.hidden=false;contentRequest=null;return;}
        if(result?.error){status.textContent="Le contenu du lien est indisponible : "+result.error;status.classList.add("expanded-error");original.href=result.linkedArticleUrl||a.blueskyLink||a.canonicalUrl;original.textContent=result.linkedArticleUrl||a.blueskyLink?"Ouvrir l’article lié ↗":"Ouvrir la publication sur Bluesky ↗";original.hidden=false;contentRequest=null;return;}
        const heading=document.createElement("h3");heading.className="bluesky-linked-heading";heading.textContent=a.blueskyLinkTitle||(()=>{try{return new URL(a.blueskyLink).hostname;}catch{return"Article lié";}})();
        const link=document.createElement("a");link.href=a.blueskyLink;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Ouvrir l’article lié ↗";
        const publication=document.createElement("a");publication.href=a.canonicalUrl;publication.target="_blank";publication.rel="noopener noreferrer";publication.textContent="Voir la publication sur Bluesky ↗";
        const safe=MMP.sanitizeArticleHtml(result?.html||"",a.blueskyLink),body=document.createElement("div");body.className="bluesky-linked-content";body.innerHTML=safe;enableExpandedImageZoom(body);
        if(!body.textContent.trim()&&result?.text){const paragraph=document.createElement("p");paragraph.textContent=result.text;body.append(paragraph);}
        if(!body.textContent.trim()){status.textContent="Aucun texte exploitable n’a été trouvé dans l’article lié.";status.classList.add("expanded-error");original.href=a.blueskyLink;original.textContent="Ouvrir l’article lié ↗";original.hidden=false;contentRequest=null;return;}
        content.append(heading,link,body,publication);status.hidden=true;status.classList.remove("expanded-error");original.hidden=true;renderPersuasionFindings(articleBody,content);updateSpeechAvailability();
      }).catch(error=>{if(token!==generation||!expanded)return;status.textContent="Le contenu du lien est indisponible : "+error.message;status.classList.add("expanded-error");if(a.blueskyLink){original.href=a.blueskyLink;original.textContent="Ouvrir l’article lié ↗";original.hidden=false;}contentRequest=null;});
      return;
    }
    status.hidden=false; status.classList.remove("expanded-error"); status.textContent=cinemaArticle(a)?"Récupération de la fiche cinéma…":"Récupération du texte de l’article…";
    if(!contentRequest){let permission=true;if(cinemaArticle(a)){const origins=["https://www.allocine.fr/*","https://fr.wikipedia.org/*","https://en.wikipedia.org/*"];try{origins.push(`${new URL(a.canonicalUrl).origin}/*`);permission=await browser.permissions.request({origins:[...new Set(origins)]});}catch{permission=false;}}contentRequest=browser.runtime.sendMessage({type:"readArticle",articleId:a.id}).then(result=>{if(!permission&&!result?.cinema)result.cinema={error:"Autorisation d’accès aux bases cinéma refusée dans Firefox."};return result;});}
    contentRequest.then(result=>{showResult(result,token);if(result?.error)contentRequest=null;}).catch(()=>{contentRequest=null;showResult({error:true},token);});
  };
  const readInlineArticle=async()=>{
    try{
      if(!expanded)await toggleArticle();
      if(!expanded)return;
      articleBody.scrollIntoView({behavior:"smooth",block:"start"});
      topCollapse.focus({preventScroll:true});
    }catch(error){
      if(!expanded){
        expanded=true;toggle.hidden=true;topCollapse.hidden=false;articleBody.hidden=false;
        toggle.setAttribute("aria-expanded","true");topCollapse.setAttribute("aria-expanded","true");
      }
      status.hidden=false;status.classList.add("expanded-error");
      status.textContent=`Impossible de déplier l’article dans Mon Mur : ${error?.message||"une erreur est survenue."}`;
      original.href=a.canonicalUrl;original.textContent="Ouvrir l’article sur le site d’origine ↗";original.hidden=false;
      articleBody.scrollIntoView({behavior:"smooth",block:"start"});topCollapse.focus({preventScroll:true});
    }
  };
  toggle.onclick=toggleArticle;
  topCollapse.onclick=toggleArticle;
  const clickbaitTarget=blueskyPostText||link,clickbaitText=blueskyPostText?(blueskyPostText.textContent.startsWith(a.title||"")?String(a.title||""):blueskyPostText.textContent):displayTitle,clickbaitSourceLink=blueskyPostText?article.querySelector(".bluesky-post-link"):link;
  article.refreshClickbait=()=>{if(state?.settings?.clickbaitDetectionEnabled===true)window.MMClickbaitAnnotations?.annotate(clickbaitTarget,clickbaitText,readInlineArticle,clickbaitSourceLink);else window.MMClickbaitAnnotations?.clear(clickbaitTarget);};
  article.refreshClickbait();
  clickbaitTarget.addEventListener("clickbait-read-error",event=>{
    status.hidden=false;status.classList.add("expanded-error");
    status.textContent=`Impossible de déplier l’article dans Mon Mur : ${event.detail?.message||"une erreur est survenue."}`;
    original.href=a.canonicalUrl;original.textContent="Ouvrir l’article sur le site d’origine ↗";original.hidden=false;
  });
  return article;
}
function draw(){const end=Math.min(rendered+20,visible.length);for(;rendered<end;rendered++){const node=card(visible[rendered]);node.dataset.articleId=visible[rendered].id;$("#cards").append(node);}}
let scrollByWall=new Map();
function unreadCountForWall(wall){
  if(wall.id===state.activeWallId&&!state.autoWalls?.some(autoWall=>autoWall.id===wall.id))return visible.length;
  const articles=new Map([...pendingArticles,...(pendingByWall.get(wall.id)||[]),...all].map(article=>[article.id,article]));
  if(wall.status==="read"||wall.status==="later"){const excluded=automaticExcludedKeywords();return [...articles.values()].filter(article=>!matchesExcludedKeyword(article,excluded)&&!shouldHideAffiliate(article)&&article.readingState?.status===wall.status).length;}
  if(wall.kind==="youtube"||wall.kind==="bluesky"||wall.kind==="documents"){const excluded=automaticExcludedKeywords();return [...articles.values()].filter(article=>{const eligible=!matchesExcludedKeyword(article,excluded)&&!shouldHideAffiliate(article)&&!article.readingState&&(wall.kind==="youtube"?isEligibleVideo(article):wall.kind==="bluesky"?(isEligibleBluesky(article)||isEligibleLinkedIn(article)):article.documentKind==="pdf"&&article.documentLanguage==="fr"&&(article.sourceIds||[article.sourceId]).includes("internet-archive:documents"));return eligible&&passesLanguageFilter(article,wall);}).length;}
  const settings=state.settings||{},excludedKeywords=(settings.excludedKeywords||[]).map(item=>typeof item==="string"?item:item.term).filter(Boolean),excludedCategories=(settings.excludedCategories||[]).map(MMP.normalizeText),sourceIds=new Set(state.sources.filter(source=>(source.wallIds||[]).includes(wall.id)).map(source=>source.id));
  const cutoff=Date.now()-Math.max(1,Number(settings.retentionDays)||30)*86400000;
  return [...articles.values()].filter(article=>!shouldHideAffiliate(article)&&!article.readingState&&Number(article.publishedAt||article.discoveredAt||0)>=cutoff&&(article.sourceIds||[article.sourceId]).some(id=>sourceIds.has(id))&&!excludedKeywords.some(term=>MMP.matchTerm(`${article.title} ${article.summary}`,term))&&!(article.categories||[]).some(category=>excludedCategories.includes(MMP.normalizeText(category)))).length;
}
function updateWallTabCounts(){const wallsById=new Map([...state.walls,...(state.autoWalls||[])].map(wall=>[wall.id,wall]));for(const button of document.querySelectorAll("#wallTabs [data-wall-id], #wallMoreItems [data-wall-id]")){const wall=wallsById.get(button.dataset.wallId);if(!wall)continue;const count=unreadCountForWall(wall),existing=button.querySelector(".wall-count");if(count){if(!existing){const badge=document.createElement("span");badge.className="wall-count";badge.setAttribute("aria-hidden","true");button.append(badge);}button.querySelector(".wall-count").textContent=String(count);button.setAttribute("aria-label",`${wall.name}, ${count} élément${count===1?"":"s"} à consulter`);}else{existing?.remove();button.setAttribute("aria-label",wall.name);}}}
function paintWallTabs(){
  document.body.dataset.wallId=state.activeWallId;
  document.body.dataset.faceFilterEnabled=String(state.settings?.faceFilterMode!=="off"&&(state.activeWallId==="auto-youtube"||state.activeWallId==="auto-bluesky"||state.wallSettings?.[state.activeWallId]?.faceFilterEnabled===true));
  activeWallSourceIds=state.sources.filter(source=>(source.wallIds||[]).includes(state.activeWallId)).map(source=>source.id).sort().join("|");
  const tabs=$("#wallTabs"),personal=state.walls||[],automatic=state.autoWalls||[],more=$("#wallMoreMenu"),moreItems=$("#wallMoreItems"),activePersonal=personal.find(wall=>wall.id===state.activeWallId);
  tabs.replaceChildren();moreItems.replaceChildren();
  let visiblePersonal=personal.slice(0,7);
  if(activePersonal&&!visiblePersonal.some(wall=>wall.id===activePersonal.id))visiblePersonal=[...personal.slice(0,6),activePersonal];
  const visibleIds=new Set(visiblePersonal.map(wall=>wall.id)),overflow=personal.filter(wall=>!visibleIds.has(wall.id));
  const makePersonalTab=(wall,parent,compact=false,mobileCopy=false)=>{
    const button=document.createElement("button");button.type="button";button.dataset.wallId=wall.id;button.className=`wall-tab${compact?" wall-more-item":" wall-tab-classic"}${mobileCopy?" wall-mobile-overflow-tab":""}${wall.id===state.activeWallId?" active":""}`;button.setAttribute("aria-current",wall.id===state.activeWallId?"page":"false");
    button.append(MMPWallIcons.create(wall.name,"wall-family-icon",iconChoiceForWall(wall)));const label=document.createElement("span");label.className="wall-tab-label";label.textContent=wall.name;button.append(label);
    button.addEventListener("auxclick",event=>{if(event.button!==1)return;event.preventDefault();openWallInNewTab(wall.id);});button.onclick=async()=>{if(compact)more.open=false;await switchWall(wall.id,true);if(compact)[...tabs.querySelectorAll("[data-wall-id]")].find(item=>item.dataset.wallId===wall.id)?.focus();};parent.append(button);
  };
  visiblePersonal.forEach(wall=>makePersonalTab(wall,tabs));
  overflow.forEach(wall=>makePersonalTab(wall,tabs,true,true));
  for(const auto of automatic.filter(wall=>wall.kind==="youtube"||wall.kind==="bluesky"||wall.kind==="documents")){
    const wrapper=document.createElement("div");wrapper.className="wall-tab-auto-wrap";wrapper.dataset.wallKind=auto.kind;
    const button=document.createElement("button");button.type="button";button.dataset.wallId=auto.id;button.className="wall-tab wall-tab-auto"+(auto.id===state.activeWallId?" active":"");button.setAttribute("aria-current",auto.id===state.activeWallId?"page":"false");
    const label=document.createElement("span");label.className="wall-tab-label";label.textContent=auto.kind==="bluesky"?"RS":auto.kind==="documents"?"PDF":"Vidéos";button.append(MMPWallIcons.create(auto.name,"wall-family-icon",auto.kind==="bluesky"?"news":auto.kind==="documents"?"generic":"streaming"),label);
    button.onclick=()=>switchWall(auto.id,true);wrapper.append(button);const autoTag=document.createElement("span");autoTag.className="wall-tab-auto-label";autoTag.textContent="AUTO";wrapper.append(autoTag);tabs.append(wrapper);
  }
  more.hidden=overflow.length===0;overflow.forEach(wall=>makePersonalTab(wall,moreItems,true));
  $("#wallAddButton").disabled=personal.length>=10;$("#wallAddButton").onclick=async()=>{const name=prompt("Nom du nouveau mur :");if(!name?.trim())return;const result=await browser.runtime.sendMessage({type:"manageWalls",action:"create",name});if(result?.error){alert(result.error);return;}const pinnedId=state.activeWallId;state=await browser.runtime.sendMessage({type:"state"});if(wallPinned&&[...(state.walls||[]),...(state.autoWalls||[])].some(w=>w.id===pinnedId)){state.activeWallId=pinnedId;state.settings={...state.settings,...(state.wallSettings[pinnedId]||{})};}paintWallTabs();};
  updateWallTabCounts();const active=[...personal,...automatic].find(w=>w.id===state.activeWallId),sidebar=document.querySelector(".side-nav"),laterLink=sidebar?.querySelector('a[href="wall.html?wall=auto-later"]'),archiveLink=sidebar?.querySelector('a[href="wall.html?wall=auto-read"]'),wallsLink=sidebar?.querySelector('a[href="wall.html"]');for(const link of [laterLink,archiveLink,wallsLink])link?.removeAttribute("aria-current");if(active?.id==="auto-later")laterLink?.setAttribute("aria-current","page");else if(active?.id==="auto-read")archiveLink?.setAttribute("aria-current","page");else wallsLink?.setAttribute("aria-current","page");const title=$("#wallTitle"),titleIcon=MMPWallIcons.create(active?.name||"Mon mur","wall-title-icon",iconChoiceForWall(active));title.replaceChildren(titleIcon,document.createTextNode(active?.kind==="bluesky"?"RS Auto":(active?.name||"Mon mur")));updateWallFavicon(active);document.title=`Mon Mur · ${active?.name||"Murs"}`;$("#mode").hidden=!!automatic.find(wall=>wall.id===state.activeWallId&&wall.kind!=="youtube");requestAnimationFrame(()=>{updateWallTabsHeight();[...tabs.querySelectorAll("[data-wall-id]")].find(button=>button.dataset.wallId===state.activeWallId)?.scrollIntoView({block:"nearest",inline:"nearest"});});
}
function stateForWall(current,id){const settings={...current.settings,...(current.wallSettings?.[id]||{})};for(const key of GLOBAL_WALL_SETTING_KEYS)if(key in current.settings)settings[key]=current.settings[key];for(const key of ["excludedKeywords","excludedCategories","priorities"])settings[key]=current.settings[key];return{...current,activeWallId:id,settings};}
function paintSelectedWall(id){const active=[...(state.walls||[]),...(state.autoWalls||[])].find(wall=>wall.id===id);document.body.dataset.wallId=id;document.body.dataset.faceFilterEnabled=String(state.settings?.faceFilterMode!=="off"&&(id==="auto-youtube"||id==="auto-bluesky"||state.wallSettings?.[id]?.faceFilterEnabled===true));activeWallSourceIds=state.sources.filter(source=>(source.wallIds||[]).includes(id)).map(source=>source.id).sort().join("|");for(const button of document.querySelectorAll("#wallTabs [data-wall-id], #wallMoreItems [data-wall-id]")){const selected=button.dataset.wallId===id;button.classList.toggle("active",selected);button.setAttribute("aria-current",String(selected?"page":"false"));}const sidebar=document.querySelector(".side-nav"),laterLink=sidebar?.querySelector('a[href="wall.html?wall=auto-later"]'),archiveLink=sidebar?.querySelector('a[href="wall.html?wall=auto-read"]'),wallsLink=sidebar?.querySelector('a[href="wall.html"]');for(const link of [laterLink,archiveLink,wallsLink])link?.removeAttribute("aria-current");if(id==="auto-later")laterLink?.setAttribute("aria-current","page");else if(id==="auto-read")archiveLink?.setAttribute("aria-current","page");else wallsLink?.setAttribute("aria-current","page");const title=$("#wallTitle");title.replaceChildren(MMPWallIcons.create(active?.name||"Mon mur","wall-title-icon",iconChoiceForWall(active)),document.createTextNode(active?.kind==="bluesky"?"RS Auto":(active?.name||"Mon mur")));updateWallFavicon(active);document.title=`Mon Mur · ${active?.name||"Murs"}`;$("#mode").hidden=!!(state.autoWalls||[]).find(wall=>wall.id===id&&wall.kind!=="youtube");$("#mode").value=state.settings.mode||"chronological";[...document.querySelectorAll("#wallTabs [data-wall-id]")].find(button=>button.dataset.wallId===id)?.scrollIntoView({block:"nearest",inline:"nearest"});}
function scheduleWallRender(id,version){const request=++wallRenderRequest;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(request===wallRenderRequest&&version===wallSelectionVersion&&state.activeWallId===id)filterSort();}));}
function showSelectedWall(id,focusToggle=false,version=wallSelectionVersion){if(id===state.activeWallId)return;scrollByWall.set(state.activeWallId,$(".feed").scrollTop);pendingByWall.set(state.activeWallId,pendingArticles);state=stateForWall(state,id);pendingArticles=pendingByWall.get(id)||[];paintSelectedWall(id);updateNewItemsButton();$(".feed").scrollTop=scrollByWall.get(id)||0;afterWallChange(focusToggle);scheduleWallRender(id,version);}
async function switchWall(id,focusToggle=false){if(![...(state?.walls||[]),...(state?.autoWalls||[])].some(wall=>wall.id===id))return;const version=++wallSelectionVersion;showSelectedWall(id,focusToggle,version);pendingWallSwitch={id,focusToggle,version};if(wallSwitchRunning)return;wallSwitchRunning=true;try{while(pendingWallSwitch){const request=pendingWallSwitch;pendingWallSwitch=null;switchingWallId=request.id;try{if(wallPinned){const current=await browser.runtime.sendMessage({type:"state"});if(request.version!==wallSelectionVersion)continue;state=stateForWall(current,request.id);const url=new URL(location.href);url.searchParams.set("wall",request.id);history.replaceState(null,"",url);}else{await browser.runtime.sendMessage({type:"setActiveWall",wallId:request.id});if(request.version!==wallSelectionVersion)continue;const current=await browser.runtime.sendMessage({type:"state"});if(request.version!==wallSelectionVersion)continue;state=stateForWall(current,request.id);}pendingArticles=pendingByWall.get(request.id)||[];const currentArticles=await browser.runtime.sendMessage({type:"articles"});if(request.version!==wallSelectionVersion)continue;all=currentArticles;paintSelectedWall(request.id);updateNewItemsButton();scheduleWallRender(request.id,request.version);}finally{switchingWallId="";}}}finally{wallSwitchRunning=false;switchingWallId="";}}
function startupWallWithContent(defaultWallId){const candidates=[...(state.walls||[]),...(state.autoWalls||[]).filter(wall=>["youtube","bluesky","documents"].includes(wall.kind))];for(const wall of candidates){if(wall.status==="read")continue;if(unreadCountForWall(wall)>0)return wall.id;}return defaultWallId;}
async function load(){state=await browser.runtime.sendMessage({type:"state"});configureArticleSpeech(state.settings);const params=new URLSearchParams(location.search),explicitWall=params.get("wall"),firstWall=state.walls?.[0]?.id,requestedWall=explicitWall||firstWall||state.autoWalls?.[0]?.id||state.activeWallId,requestedIsValid=requestedWall&&[...(state.walls||[]),...(state.autoWalls||[])].some(w=>w.id===requestedWall);if(requestedIsValid&&requestedWall!==state.activeWallId){if(wallPinned)state={...state,activeWallId:requestedWall,settings:{...state.settings,...(state.wallSettings[requestedWall]||{}),excludedKeywords:state.settings.excludedKeywords,excludedCategories:state.settings.excludedCategories,priorities:state.settings.priorities}};else{await browser.runtime.sendMessage({type:"setActiveWall",wallId:requestedWall});state=await browser.runtime.sendMessage({type:"state"});}}else if(explicitWall&&!requestedIsValid){wallPinned=false;const fallback=firstWall||state.autoWalls?.[0]?.id;if(fallback&&fallback!==state.activeWallId){await browser.runtime.sendMessage({type:"setActiveWall",wallId:fallback});state=await browser.runtime.sendMessage({type:"state"});}}pendingArticles=pendingByWall.get(state.activeWallId)||[];all=await browser.runtime.sendMessage({type:"articles"});$("#mode").value=state.settings.mode||"chronological";paintWallTabs();filterSort();if(!explicitWall&&firstWall){const next=startupWallWithContent(firstWall);if(next!==state.activeWallId)await switchWall(next);}browser.runtime.sendMessage({type:"refreshIfStale"}).catch(error=>text($("#status"),`Actualisation impossible : ${error.message}`));}
$("#mode").onchange=async e=>{state.settings.mode=e.target.value;await browser.runtime.sendMessage({type:"saveWallSettings",wallId:state.activeWallId,settings:state.settings});filterSort();};
function updateNewItemsButton(){const button=$("#newItems"),youtube=state.autoWalls?.some(wall=>wall.id===state.activeWallId&&wall.kind==="youtube"),count=pendingArticles.length;button.hidden=!count;if(count)text(button,`${count} ${youtube?(count===1?"nouvelle vidéo":"nouvelles vidéos"):(count===1?"nouvel article":"nouveaux articles")} · afficher`);}
async function collectNewArticles(){
  const wallId=state.activeWallId;
  const fresh=await browser.runtime.sendMessage({type:"articles"});
  const latest=await browser.runtime.sendMessage({type:"state"});
  const youtubeWall=latest.autoWalls.find(wall=>wall.kind==="youtube");
  const sourceIds=new Set(latest.sources.filter(source=>(source.wallIds||[]).includes(wallId)).map(source=>source.id));
  if(wallId==="auto-documents")sourceIds.add("internet-archive:documents");
  const freshById=new Map(fresh.map(article=>[article.id,article]));
  const known=new Set([...all,...(pendingByWall.get(wallId)||[]),...(wallId===state.activeWallId?pendingArticles:[])].map(article=>article.id));
  if(wallId===youtubeWall?.id)for(const id of ["youtube-keyword-search","peertube-keyword-search","crowdbunker-keyword-search","rumble-keyword-search"])sourceIds.add(id);
  const blueskyWall=latest.autoWalls.find(wall=>wall.kind==="bluesky");
  if(wallId===blueskyWall?.id){sourceIds.add("bluesky-keyword-search");sourceIds.add("linkedin-keyword-search");}
  for(const article of [...all,...(pendingByWall.get(wallId)||[]),...(wallId===state.activeWallId?pendingArticles:[])]){
    const update=freshById.get(article.id);
    if(update){Object.assign(article,update);if(isLinkedInResult(article))syncLinkedInCard($(`#cards [data-article-id="${CSS.escape(article.id)}"]`),article);}
  }
  const incoming=fresh.filter(article=>(article.sourceIds||[article.sourceId]).some(id=>sourceIds.has(id))&&!known.has(article.id));
  for(const wall of latest.walls){
    const ids=new Set(latest.sources.filter(source=>(source.wallIds||[]).includes(wall.id)).map(source=>source.id));
    const pending=pendingByWall.get(wall.id)||[],wallKnown=new Set([...all,...pending].map(article=>article.id));
    const wallIncoming=fresh.filter(article=>!wallKnown.has(article.id)&&(article.sourceIds||[article.sourceId]).some(id=>ids.has(id)));
    pendingByWall.set(wall.id,[...new Map([...pending,...wallIncoming].map(article=>[article.id,article])).values()]);
  }
  if(youtubeWall){
    const pending=pendingByWall.get(youtubeWall.id)||[],wallKnown=new Set([...all,...pending].map(article=>article.id));
    const wallIncoming=fresh.filter(article=>!wallKnown.has(article.id)&&(article.sourceIds||[article.sourceId]).some(id=>["youtube-keyword-search","peertube-keyword-search","crowdbunker-keyword-search","rumble-keyword-search"].includes(id)));
    pendingByWall.set(youtubeWall.id,[...new Map([...pending,...wallIncoming].map(article=>[article.id,article])).values()]);
  }
  if(blueskyWall){
    const pending=pendingByWall.get(blueskyWall.id)||[],wallKnown=new Set([...all,...pending].map(article=>article.id));
    const wallIncoming=fresh.filter(article=>!wallKnown.has(article.id)&&(article.sourceIds||[article.sourceId]).some(id=>["bluesky-keyword-search","linkedin-keyword-search"].includes(id)));
    pendingByWall.set(blueskyWall.id,[...new Map([...pending,...wallIncoming].map(article=>[article.id,article])).values()]);
  }
  const documentWall=latest.autoWalls.find(wall=>wall.kind==="documents");
  if(documentWall){
    const pending=pendingByWall.get(documentWall.id)||[],wallKnown=new Set([...all,...pending].map(article=>article.id));
    const wallIncoming=fresh.filter(article=>!wallKnown.has(article.id)&&(article.sourceIds||[article.sourceId]).includes("internet-archive:documents"));
    pendingByWall.set(documentWall.id,[...new Map([...pending,...wallIncoming].map(article=>[article.id,article])).values()]);
  }
  state=stateForWall(latest,state.activeWallId);
  if(wallId===state.activeWallId){
    pendingArticles=pendingByWall.get(wallId);
    for(const article of fresh){
      if(!known.has(article.id)||!(article.sourceIds||[article.sourceId]).some(id=>sourceIds.has(id))||!article.image)continue;
      const node=$(`#cards [data-article-id="${CSS.escape(article.id)}"]`);
      if(!node)continue;
      let cover=node.querySelector(".cover");
      if(!cover){cover=document.createElement("img");cover.className="cover";cover.alt="";cover.loading="lazy";cover.referrerPolicy="no-referrer";cover.onerror=()=>removeCardCover(node,cover);placeCardCover(node,cover,node.querySelector(".title"));}
      cover.src=MMP.cleanUrl(article.image,article.canonicalUrl);cover.onerror=()=>removeCardCover(node,cover);
    }
    updateNewItemsButton();updateWallTabCounts();
    const currentIds=state.sources.filter(source=>(source.wallIds||[]).includes(wallId)).map(source=>source.id).sort().join("|");
    if(currentIds!==activeWallSourceIds){paintWallTabs();filterSort();}
    else if(wallId==="auto-documents"){all=await browser.runtime.sendMessage({type:"articles"});filterSort();}
  }
  return incoming.length;
}
function showInternetArchiveRefreshResult(result){if(!result)return;const status=$("#status"),errors=result.errors?.length?` · erreur : ${result.errors[0]}`:"",limit=result.queriesLimited?" · limite de 8 mots-clés par actualisation":"",throttle=result.throttled?" · actualisée il y a moins d’une minute":"";text(status,result.keywordCount?`Internet Archive : ${result.searches} recherches · ${result.results} résultats · ${result.pdfChecked} PDF vérifiés · ${result.languageRejected||0} hors français ou sans langue · ${result.stored} documents ajoutés · ${result.duplicates} doublons${limit}${throttle}${errors}`:"Aucun mot-clé prioritaire à rechercher pour ce mur.");}
function showYouTubeRefreshResult(result){if(!result)return;const status=$("#status");if(!result.keywordCount){text(status,"Aucun mot-clé dans Préférences → Prioriser.");return;}const d=result.diagnostics||{},format=(name,label)=>{const p=d[name]||{},request=p.requests?.[0],rejected=name==="youtube"?`${p.titleRejected||0} titres hors sujet · ${p.olderDateRejected||0} antérieures à la référence · ${p.unknownDateRejected||0} dates inconnues`:name==="peertube"?`${p.titleRejected||0} titres hors sujet · ${p.languageRejected||0} hors français · ${p.invalidRejected||0} données invalides`:name==="rumble"?`${p.titleRejected||0} titres hors sujet · ${p.olderDateRejected||0} antérieures au 21/10/2026 · ${p.unknownDateRejected||0} dates inconnues`:`${p.titleRejected||0} titres hors sujet`;const response=request?` · HTTP ${request.status} ${request.contentType||""}${request.format?` · ${request.format}, ${request.bytes} caractères, ${request.extracted} extraits`:""}`:"";const disabled=name==="rumble"&&state.videoProviders?.rumble!==true?" · désactivée":"";const pages=name==="rumble"?` · ${p.cards||0} fiches lues sur ${p.pages||0} pages`:"";return `${label} ${p.searches||0} recherches · ${p.results||0} résultats reçus${pages} · ${rejected} · ${p.duplicate||0} déjà vues · ${p.stored||0} enregistrées${response}${p.errors?.length?` · erreur : ${p.errors[0]}`:""}${disabled}`;};text(status,`${format("youtube","YouTube")} | ${format("peertube","PeerTube")} | ${format("crowdbunker","CrowdBunker")} | ${format("rumble","Rumble")}`);}
$("#refresh").onclick=async()=>{text($("#refresh"),"Actualisation…");try{const youtubeWall=state.autoWalls?.find(wall=>wall.kind==="youtube"),blueskyWall=state.autoWalls?.find(wall=>wall.kind==="bluesky"),wallId=state.autoWalls?.some(wall=>wall.id===state.activeWallId)?"":state.activeWallId;const result=await browser.runtime.sendMessage({type:"refresh",wallId});if(result?.error)throw new Error(`Collecteur d’arrière-plan : ${result.error}`);const added=await collectNewArticles();if(state.activeWallId===youtubeWall?.id)showYouTubeRefreshResult(result?.youtube);if(state.activeWallId===blueskyWall?.id){const detail=result?.bluesky;if(detail){const message=detail.disabledReason==="search-consent-missing"?"Autorisez les recherches automatiques dans Préférences pour collecter Bluesky.":detail.disabledReason==="automatic-wall-disabled"?"Le mur Réseaux Sociaux Auto est désactivé dans Préférences.":detail.disabledReason==="provider-disabled"?"Bluesky est désactivé dans les fournisseurs du mur automatique.":detail.disabledReason==="no-priority-topics"?"Aucun mot-clé dans Préférences → Prioriser.":`${detail.successCount}/${detail.topicCount} sujets actualisés · ${detail.addedCount} publications enregistrées${detail.diagnostics?.returned?` · ${detail.diagnostics.returned} reçues, ${detail.diagnostics.languageRejected||0} langue(s) écartée(s), ${detail.diagnostics.languageUnknownAccepted||0} sans langue déclarée acceptée`:""}${detail.errors.length?` · ${detail.errors[0]}`:""}`;const li=result?.linkedin;if(li&&state.socialProviders?.linkedin){const linkedinMessage=li.disabledReason==="search-consent-missing"?"Google Actualités : autorisez les recherches automatiques dans Préférences.":li.disabledReason==="no-priority-topics"?"Google Actualités : aucun mot-clé dans Préférences → Prioriser.":li.disabledReason==="provider-disabled"?"LinkedIn est désactivé dans les fournisseurs du mur automatique.":li.disabledReason==="automatic-wall-disabled"?"Le mur Réseaux sociaux Auto est désactivé.":`Google Actualités : ${li.queryCount||0} recherches · ${li.resultCount||0} résultats LinkedIn · ${li.stored||0} nouvelles vignettes · ${li.duplicates||0} doublons${li.imageRejected?` · ${li.imageRejected} sans image ignorés`:""}${li.queriesLimited?" · limite de 8 mots-clés":""}${li.errors?.length?` · erreur : ${li.errors[0]}`:""}`;text($("#status"),`${message} | ${linkedinMessage}`);}else text($("#status"),message);}}if(!state.autoWalls?.some(wall=>wall.id===state.activeWallId)||state.autoWalls?.some(wall=>wall.id===state.activeWallId&&wall.kind==="documents"))showInternetArchiveRefreshResult(result?.internetArchive);if(!state.autoWalls?.some(wall=>wall.id===state.activeWallId)){const failed=result?.sources?.find(source=>source.status==="error");if(failed)text($("#status"),`Source ${failed.name} : ${failed.lastError||"échec de collecte"}`);else text($("#status"),added?`${added} nouvel${added>1?"s":""} article${added>1?"s":""} collecté${added>1?"s":""}.`:"Actualisation réussie : aucun nouvel article.");}}catch(error){const detail=/Receiving end does not exist|Could not establish connection/i.test(error?.message||"")?"Firefox n’a pas remis le message à l’écouteur du script d’arrière-plan. Rechargez l’extension dans about:debugging puis rouvrez Mon Mur.":error.message;text($("#status"),`Erreur pendant l’actualisation : ${detail}`);}finally{text($("#refresh"),"Actualiser");}};
$("#markAllRead").onclick=async()=>{const target=articlesForCurrentWall();if(!target.length)return;const ids=target.map(a=>a.id),idSet=new Set(ids),wallName=$("#wallTitle").textContent,videoWall=state.autoWalls?.some(w=>w.id===state.activeWallId&&["youtube","bluesky"].includes(w.kind)),dialog=$("#markAllReadDialog");$("#markAllReadQuestion").textContent=videoWall?`Archiver les ${ids.length} publications du mur ${wallName} ?`:`Marquer comme lus les ${ids.length} articles du mur ${wallName} ?`;dialog.showModal();await new Promise(resolve=>dialog.addEventListener("close",resolve,{once:true}));if(dialog.returnValue!=="confirm")return;const button=$("#markAllRead");button.disabled=true;try{await browser.runtime.sendMessage({type:"setArticlesStatus",articleIds:ids,status:"read"});all=await browser.runtime.sendMessage({type:"articles"});pendingArticles=pendingArticles.map(a=>idSet.has(a.id)?{...a,readingState:{status:"read"}}:a);pendingByWall.set(state.activeWallId,(pendingByWall.get(state.activeWallId)||[]).map(a=>idSet.has(a.id)?{...a,readingState:{status:"read"}}:a));filterSort();}catch(error){text($("#status"),`Erreur : ${error.message}`);updateMarkAllReadButton();}};
browser.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.settings){const selectedId=state?.activeWallId,version=wallSelectionVersion;browser.runtime.sendMessage({type:"state"}).then(next=>{if(version!==wallSelectionVersion)return;state=stateForWall(next,selectedId);configureArticleSpeech(state.settings);if(changes.settings.newValue?.persuasionDetectionEnabled!==changes.settings.oldValue?.persuasionDetectionEnabled){for(const node of document.querySelectorAll("#cards .card")){const body=node.querySelector(".expanded-article"),content=node.querySelector(".expanded-content");if(body&&content&&!body.hidden)renderPersuasionFindings(body,content);}}if(changes.settings.newValue?.clickbaitDetectionEnabled!==changes.settings.oldValue?.clickbaitDetectionEnabled){for(const node of document.querySelectorAll("#cards .card"))node.refreshClickbait?.();}if(changes.settings.newValue?.languageFilterEnabled!==changes.settings.oldValue?.languageFilterEnabled||changes.settings.newValue?.languageFilterLanguages!==changes.settings.oldValue?.languageFilterLanguages||changes.settings.newValue?.languageFilterKeepUnknown!==changes.settings.oldValue?.languageFilterKeepUnknown)filterSort();if(changes.settings.newValue?.affiliateModuleEnabled!==changes.settings.oldValue?.affiliateModuleEnabled||changes.settings.newValue?.hideAffiliatedContent!==changes.settings.oldValue?.hideAffiliatedContent||changes.settings.newValue?.affiliateWarningsEnabled!==changes.settings.oldValue?.affiliateWarningsEnabled){syncAffiliatePresentation();filterSort();}}).catch(()=>{});}});
browser.runtime.onMessage.addListener(msg=>{if(msg?.type==="stopWallVideo"&&msg.viewId!==wallViewId&&state&&msg.wallId===state.activeWallId)stopOtherWallVideos(msg.wallId);if(msg?.type==="likesUpdated"){for(const button of document.querySelectorAll(".like-action")){if(button.dataset.likeUrl!==msg.normalizedUrl)continue;button.classList.toggle("is-liked",msg.liked);button.setAttribute("aria-pressed",String(msg.liked));button.title=msg.liked?"Retirer le J’aime":"J’aime";button.setAttribute("aria-label",`${msg.liked?"Retirer le J’aime":"J’aime"} : ${button.closest(".card")?.querySelector(".title")?.textContent||"contenu"}`);}}if(msg?.type==="articlesUpdated")collectNewArticles().catch(()=>{});if(msg?.type==="activeWallChanged"&&!wallPinned&&state&&!wallSwitchRunning&&!pendingWallSwitch)(async()=>{const latest=await browser.runtime.sendMessage({type:"state"}),latestId=latest?.activeWallId;if(latestId&&latestId!==state.activeWallId&&latestId!==switchingWallId&&!wallSwitchRunning&&!pendingWallSwitch)switchWall(latestId).catch(()=>{});})().catch(()=>{});if(msg?.type==="wallsUpdated")(async()=>{const previousId=state.activeWallId,version=wallSelectionVersion;scrollByWall.set(previousId,$(".feed").scrollTop);pendingByWall.set(previousId,pendingArticles);const latest=await browser.runtime.sendMessage({type:"state"});if(version!==wallSelectionVersion)return;state=latest;if(wallPinned&&[...(state.walls||[]),...(state.autoWalls||[])].some(w=>w.id===previousId)){state.activeWallId=previousId;state.settings={...state.settings,...(state.wallSettings[previousId]||{})};}paintWallTabs();if(previousId!==state.activeWallId){pendingArticles=pendingByWall.get(state.activeWallId)||[];all=await browser.runtime.sendMessage({type:"articles"});updateNewItemsButton();$("#mode").value=state.settings.mode||"chronological";filterSort();$(".feed").scrollTop=scrollByWall.get(state.activeWallId)||0;afterWallChange();}else{all=await browser.runtime.sendMessage({type:"articles"});filterSort();}})().catch(()=>{});});
$("#newItems").onclick=()=>{const incoming=pendingArticles;if(!incoming.length)return;const incomingIds=new Set(incoming.map(article=>article.id));pendingArticles=[];pendingByWall.set(state.activeWallId,[]);renderFloor=$("#cards").children.length+incoming.length;all=[...incoming,...all.filter(article=>!incomingIds.has(article.id))];updateNewItemsButton();filterSort();$(".feed").scrollTo({top:0,behavior:"smooth"});};
new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))draw();},{root:$(".feed"),rootMargin:"500px"}).observe($("#sentinel"));
$("#toggleNav").onclick=()=>{const expand=$("#wallSticky").classList.contains("is-collapsed");if(expand)keepNavigationCollapsedAtTop=false;navManuallyExpanded=expand;setNavigationCollapsed(!expand);};
$("#returnToTop").onclick=()=>$(".feed").scrollTo({top:0,behavior:"smooth"});
window.addEventListener("scroll",handlePageScroll,{passive:true});
$(".feed").addEventListener("scroll",handlePageScroll,{passive:true});
window.addEventListener("keydown",event=>{
  if(!["PageDown","PageUp"].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;
  const target=event.target;
  if(target instanceof Element&&(target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false']),dialog[open]")||target.closest("video,audio")))return;
  const feed=$(".feed"),distance=Math.max(1,Math.round(feed.clientHeight*.85)),maxTop=Math.max(0,feed.scrollHeight-feed.clientHeight),top=Math.max(0,Math.min(maxTop,event.key==="PageDown"?feed.scrollTop+distance:feed.scrollTop-distance));
  if(top===feed.scrollTop)return;
  event.preventDefault();feed.scrollTo({top,behavior:"smooth"});
},{passive:false});
$(".app-main").addEventListener("wheel",event=>{const feed=$(".feed");if(feed.contains(event.target)||event.deltaY===0)return;event.preventDefault();feed.scrollTop+=event.deltaY;},{passive:false});
handlePageScroll();
window.addEventListener("resize",()=>{updateWallTabsHeight();handlePageScroll();},{passive:true});
load().catch(e=>text($("#status"),`Erreur : ${e.message}`));
