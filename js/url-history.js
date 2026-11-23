"use strict";
const $=selector=>document.querySelector(selector);
let historyRows=[];
const historyDate=value=>value?new Date(value).toLocaleString("fr-FR"):"—";
const rejectionLabels={olderThanLastSync:"antérieur au seuil de collecte",outsideInitialWindow:"date absente, estimée ou hors fenêtre",deduplicated:"déjà acquis",retentionTombstone:"article expiré de la base",alreadyStored:"déjà présent en base"};
function firstRejectionPublication(decision){if(!Number(decision?.publishedAt))return "—";const date=decision.datePrecision==="day"?new Date(decision.publishedAt).toLocaleDateString("fr-FR"):historyDate(decision.publishedAt);return decision.dateIsFallback?`${date} (estimée)` : date;}
function firstRejectionText(row){const decision=row.firstRejection;if(!decision?.rejectionReason)return "Non enregistrée";const reason=`${decision.rejectionReason} · ${rejectionLabels[decision.rejectionReason]||"refusé"}`;return `${reason} · évaluée le ${historyDate(decision.evaluatedAt)} · publication ${firstRejectionPublication(decision)} · seuil ${historyDate(decision.cutoffAtDecision)}`;}
function articleDate(row){
  const timestamp=Number(row.publishedAt)||0,precision=row.datePrecision||"unknown";
  if(row.dateMetadataRecorded===false)return "Non enregistrée";
  if(!timestamp||precision==="unknown")return "Absente";
  const formatted=precision==="day"?new Date(timestamp).toLocaleDateString("fr-FR"):historyDate(timestamp);
  if(row.dateIsFallback&&precision==="day")return `${formatted} · estimée via URL (non utilisée)`;
  if(row.dateIsFallback)return "Absente";
  return precision==="day"?`${formatted} · date seule`:`${formatted} · précise`;
}
function filteredHistory(){
  const source=$("#historySource").value,wall=$("#historyWall").value,query=$("#historySearch").value.trim().toLocaleLowerCase("fr"),sort=$("#historySort").value;
  return historyRows.filter(row=>(!source||row.sourceId===source)&&(!wall||row.wallNames?.includes(wall))&&(!query||`${row.title} ${row.canonicalUrl}`.toLocaleLowerCase("fr").includes(query))).sort((a,b)=>{
    if(sort==="source")return `${a.sourceType} ${a.sourceName}`.localeCompare(`${b.sourceType} ${b.sourceName}`,"fr");
    if(sort==="title")return (a.title||"").localeCompare(b.title||"","fr");
    if(sort==="wall")return (a.wallNames?.[0]||"").localeCompare(b.wallNames?.[0]||"","fr");
    return b.firstSeenAt-a.firstSeenAt;
  });
}
function renderHistory(){
  const sourceSelect=$("#historySource"),requestedSource=new URLSearchParams(location.search).get("source")||"",selectedSource=sourceSelect.value||requestedSource;
  const counts=new Map();for(const row of historyRows)counts.set(row.sourceId,(counts.get(row.sourceId)||0)+1);
  const sources=[...new Map(historyRows.map(row=>[row.sourceId,`${row.sourceType||"Source"} · ${row.sourceName||row.sourceId||"Source inconnue"}`])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"fr"));
  sourceSelect.replaceChildren(new Option("Toutes les sources",""),...sources.map(([id,label])=>new Option(`${label} (${counts.get(id)||0})`,id)));
  if(sources.some(([id])=>id===selectedSource))sourceSelect.value=selectedSource;
  const wallSelect=$("#historyWall"),selectedWall=wallSelect.value,walls=[...new Set(historyRows.flatMap(row=>row.wallNames||[]))].sort((a,b)=>a.localeCompare(b,"fr"));
  wallSelect.replaceChildren(new Option("Tous les murs",""),...walls.map(name=>new Option(name,name)));
  if(walls.includes(selectedWall))wallSelect.value=selectedWall;
  const rows=filteredHistory(),body=$("#historyRows");body.replaceChildren();
  for(const row of rows){
    const tr=document.createElement("tr"),detected=document.createElement("td"),published=document.createElement("td"),decision=document.createElement("td"),source=document.createElement("td"),title=document.createElement("td"),wall=document.createElement("td"),status=document.createElement("td"),mode=document.createElement("td"),url=document.createElement("td"),link=document.createElement("a");
    detected.textContent=historyDate(row.firstSeenAt);published.textContent=articleDate(row);source.textContent=`${row.sourceType||"Source"} · ${row.sourceName||row.sourceId||"Source inconnue"}`;title.textContent=row.title||"Titre indisponible";wall.textContent=row.wallNames?.join(", ")||"—";
    decision.textContent=firstRejectionText(row);
    status.textContent=row.acquired===true?"Acquis":row.acquired===false?"Non acquis":"Inconnu";mode.textContent=row.acquisitionMode||"—";
    link.href=row.canonicalUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Ouvrir ↗";link.title=row.canonicalUrl;url.append(link);tr.append(detected,published,decision,source,title,wall,status,mode,url);body.append(tr);
  }
  if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=9;td.textContent="Aucun résultat.";tr.append(td);body.append(tr);}
  $("#historySummary").textContent=`${new Intl.NumberFormat("fr-FR").format(rows.length)} résultat${rows.length===1?"":"s"} affiché${rows.length===1?"":"s"} · ${new Intl.NumberFormat("fr-FR").format(historyRows.length)} URL mémorisée${historyRows.length===1?"":"s"} au total.`;
}
async function loadHistory(){
  try{const rows=await browser.runtime.sendMessage({type:"sourceHistory"});if(!Array.isArray(rows))throw new Error(rows?.error||"Historique indisponible.");historyRows=rows;renderHistory();}
  catch(error){$("#historySummary").textContent=`Chargement impossible : ${error.message||error}`;$("#historyRows").replaceChildren();}
}
function exportHistory(rows,button){
  const status=$("#historyStatus");button.disabled=true;status.textContent="Préparation du fichier…";
  try{
    const cell=value=>`"${String(value??"").replace(/"/g,'""')}"`;
    const csv=[["Détecté le","Date de l’article","Motif du premier refus","Publication à la décision","Précision de publication","Seuil à la décision","Évalué le","Type de source","Source","Titre","Mur","Statut","Mode d’acquisition","URL"],...rows.map(row=>[historyDate(row.firstSeenAt),articleDate(row),row.firstRejection?.rejectionReason||"",firstRejectionPublication(row.firstRejection),row.firstRejection?.datePrecision||"",row.firstRejection?.cutoffAtDecision?historyDate(row.firstRejection.cutoffAtDecision):"",row.firstRejection?.evaluatedAt?historyDate(row.firstRejection.evaluatedAt):"",row.sourceType,row.sourceName,row.title,row.wallNames?.join(", "),row.acquired===true?"Acquis":row.acquired===false?"Non acquis":"Inconnu",row.acquisitionMode,row.canonicalUrl])].map(line=>line.map(cell).join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=`mon-mur-urls-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent=`Fichier CSV téléchargé : ${rows.length} URL.`;
  }catch(error){status.textContent=`Export impossible : ${error.message}`;}finally{button.disabled=false;}
}
$("#historySource").onchange=renderHistory;$("#historyWall").onchange=renderHistory;$("#historySearch").oninput=renderHistory;$("#historySort").onchange=renderHistory;
$("#exportUrlHistory").onclick=event=>exportHistory(historyRows,event.currentTarget);$("#exportFilteredUrlHistory").onclick=event=>exportHistory(filteredHistory(),event.currentTarget);
loadHistory();browser.runtime.onMessage.addListener(message=>{if(message?.type==="articlesUpdated"||message?.type==="sourcesUpdated")loadHistory();});
