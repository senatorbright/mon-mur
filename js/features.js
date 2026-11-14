"use strict";

const version = document.querySelector("#extensionVersion");
if (version) version.textContent = browser.runtime.getManifest().version;
