"use strict";
const WALL_ICON_FAMILIES=["tech","streaming","professional","local","news","sport","poi","cinema","science","health","education","culture","cooking","travel","finance","weather","environment","mobility","gaming","home","shopping","security","generic"];
function wallFamilyFor(name,choice="auto"){
 if(WALL_ICON_FAMILIES.includes(choice))return choice;
 const value=MMP.normalizeText(name);
 if(/tech|technolog|informatique|numerique|logiciel/.test(value))return"tech";
 if(/stream|video|youtube|netflix|serie/.test(value))return"streaming";
 if(/(^|\b)pro(\b|$)|travail|business|emploi/.test(value))return"professional";
 if(/local|ville|region|quartier/.test(value))return"local";
 if(/actualite|actus|news|presse|journal/.test(value))return"news";
 if(/sport|foot|rugby|tennis|velo/.test(value))return"sport";
 if(/(^|\b)poi(\b|$)|point.?interet|lieu.?interet/.test(value))return"poi";
 if(/cinema|film/.test(value))return"cinema";
 if(/science|recherche|espace|astronomie/.test(value))return"science";
 if(/sante|medical|medecine|bien.?etre/.test(value))return"health";
 if(/education|ecole|universite|formation|apprentissage/.test(value))return"education";
 if(/culture|art|musique|livre|litterature/.test(value))return"culture";
 if(/cuisine|recette|gastronomie|restaurant/.test(value))return"cooking";
 if(/voyage|travel|tourisme|avion/.test(value))return"travel";
 if(/finance|economie|bourse|banque|business/.test(value))return"finance";
 if(/meteo|weather|climat/.test(value))return"weather";
 if(/environnement|ecologie|nature|energie|durable/.test(value))return"environment";
 if(/mobilite|transport|voiture|automobile|velo/.test(value))return"mobility";
 if(/gaming|jeu|jeux|videogame/.test(value))return"gaming";
 if(/maison|habitat|jardin|deco/.test(value))return"home";
 if(/shopping|mode|achat|commerce/.test(value))return"shopping";
 if(/securite|cyber|protection|defense/.test(value))return"security";
 return"generic";
}
function createWallIcon(name,className="wall-family-icon",choice="auto"){
 const paths={
  tech:["path",{d:"M3 4.5h18v12H3zM2 20h20M9 16.5 8 20m7-3.5 1 3.5"}],
  streaming:["g",{},[["rect",{x:"3",y:"5",width:"18",height:"14",rx:"2"}],["path",{d:"m10 9 5 3-5 3z",fill:"currentColor"}]]],
  professional:["path",{d:"M3 8h18v12H3zM8 8V5h8v3M3 12h18m-11-1v3h4v-3"}],
  local:["g",{},[["path",{d:"M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"}],["circle",{cx:"12",cy:"10",r:"2"}]]],
  news:["g",{},[["rect",{x:"3",y:"4",width:"18",height:"16",rx:"1.5"}],["path",{d:"M7 8h4v4H7zm7 0h4M14 11h4M7 15h11M7 17h11"}]]],
  sport:["g",{},[["circle",{cx:"12",cy:"12",r:"9"}],["path",{d:"M3.5 9h6l2.5 3-2.5 3h-6m17-6h-6L12 12l2.5 3h6M9 3.5l3 5 3-5m-6 17 3-5 3 5"}]]],
  poi:["path",{d:"m12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.4l6.3-.9z",fill:"currentColor"}],
  cinema:["g",{},[["rect",{x:"3",y:"5",width:"18",height:"14",rx:"2"}],["path",{d:"m10 9 5 3-5 3z",fill:"currentColor"}]]],
  science:["g",{},[["circle",{cx:"12",cy:"12",r:"2"}],["ellipse",{cx:"12",cy:"12",rx:"9",ry:"4",transform:"rotate(30 12 12)"}],["ellipse",{cx:"12",cy:"12",rx:"9",ry:"4",transform:"rotate(-30 12 12)"}]]],
  health:["path",{d:"M12 21s-8-4.7-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.3-8 11-8 11ZM12 9v6m-3-3h6"}],
  education:["path",{d:"M3 5.5A2.5 2.5 0 0 1 5.5 3H12v17H5.5A2.5 2.5 0 0 0 3 22zm18 0A2.5 2.5 0 0 0 18.5 3H12v17h6.5a2.5 2.5 0 0 1 2.5 2z"}],
  culture:["g",{},[["path",{d:"M4 18c-1-2-1-5 1-7l5-5 3 3-5 5c-2 2-2 4-1 6"}],["circle",{cx:"17",cy:"7",r:"1"}],["circle",{cx:"20",cy:"11",r:"1"}],["circle",{cx:"17",cy:"15",r:"1"}]]],
  cooking:["g",{},[["path",{d:"M5 3v6m-2-6v4a2 2 0 0 0 4 0V3M5 9v12M15 3v18m0-18c4 3 4 7 0 9"}]]],
  travel:["path",{d:"m2 16 8-4-6-8 2-1 9 7 5-2a2 2 0 1 1 1 3l-6 1-6 8-2-1 2-8-6 3z"}],
  finance:["path",{d:"M3 20h18M5 16l5-5 4 3 6-8M16 6h4v4"}],
  weather:["g",{},[["circle",{cx:"8",cy:"8",r:"3"}],["path",{d:"M8 1v2m0 10v2M1 8h2m10 0h2m-12-5 1.5 1.5m7 7L13 13m-1-9 1.5-1.5M4.5 11.5 3 13m5 3h10a3 3 0 0 0 0-6 5 5 0 0 0-9.6-1.5A3.8 3.8 0 0 0 8 16z"}]]],
  environment:["path",{d:"M20 4C10 4 4 8 4 14a6 6 0 0 0 6 6c6 0 10-6 10-16ZM4 20c3-5 7-8 12-11"}],
  mobility:["path",{d:"M3 14 5 8h14l2 6v5h-3v-2H6v2H3zm2-1h14l-1.5-4h-11zM6 15h2m8 0h2"}],
  gaming:["path",{d:"M7 8h10a5 5 0 0 1 4.8 6.5l-1 3a2 2 0 0 1-3.2 1l-3-2.3h-5l-3 2.3a2 2 0 0 1-3.2-1l-1-3A5 5 0 0 1 7 8Zm1 3v5m-2.5-2.5h5M16 12h.01M18 15h.01"}],
  home:["path",{d:"m3 11 9-8 9 8M5 10v11h14V10m-9 11v-7h4v7"}],
  shopping:["path",{d:"M4 8h16l-1 13H5L4 8Zm4 0a4 4 0 0 1 8 0"}],
  security:["path",{d:"M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-4-10 3 3 5-6"}],
  generic:["g",{},[["path",{d:"M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"}]]]
 };
 const family=wallFamilyFor(name,choice),svgNS="http://www.w3.org/2000/svg",icon=document.createElement("span"),svg=document.createElementNS(svgNS,"svg");icon.className=`${className} wall-family-icon--${family}`;icon.setAttribute("aria-hidden","true");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("focusable","false");
 const append=(parent,description)=>{const [tag,attrs,children]=description,node=document.createElementNS(svgNS,tag);for(const [key,value] of Object.entries(attrs||{}))node.setAttribute(key,value);if(children)children.forEach(child=>append(node,child));parent.append(node);};append(svg,paths[family]);icon.append(svg);return icon;
}

function wallFaviconDataUrl(name,choice="auto"){
 const icon=createWallIcon(name,"wall-family-icon",choice),svg=icon.querySelector("svg"),family=wallFamilyFor(name,choice),color=({tech:"#58b7ff",streaming:"#ff4f68",professional:"#ae83ff",local:"#39d99b",news:"#6da8ff",sport:"#ffb84c",poi:"#ffd34e",cinema:"#c28aff",science:"#65d7ed",health:"#ff7383",education:"#6da8ff",culture:"#e38aff",cooking:"#ff9d64",travel:"#56c9e8",finance:"#73d69a",weather:"#ffd15e",environment:"#39d99b",mobility:"#56c9e8",gaming:"#b3a0ff",home:"#e7b681",shopping:"#ff8fc1",security:"#73c8ff",generic:"#99b8d9"})[family];
 svg.setAttribute("xmlns","http://www.w3.org/2000/svg");svg.setAttribute("width","32");svg.setAttribute("height","32");svg.setAttribute("color",color);svg.setAttribute("fill","none");svg.setAttribute("stroke",color);svg.setAttribute("stroke-width","1.8");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
 const source=new XMLSerializer().serializeToString(svg);return `data:image/svg+xml,${encodeURIComponent(source)}`;
}
window.MMPWallIcons={families:WALL_ICON_FAMILIES,familyFor:wallFamilyFor,create:createWallIcon,faviconDataUrl:wallFaviconDataUrl};
