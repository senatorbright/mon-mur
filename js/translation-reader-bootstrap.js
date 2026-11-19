"use strict";
const readerLanguage = new URLSearchParams(location.search).get("lang") || "";
if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(readerLanguage)) document.documentElement.lang = readerLanguage;
else document.documentElement.removeAttribute("lang");
