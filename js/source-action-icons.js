"use strict";
window.MMSourceActionIcons = {
  create(action, label) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "source-icon-button";
    button.title = label; button.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", action === "toggle" ? "M12 2v10m6.4-6.4a9 9 0 1 1-12.8 0" : "M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v7m4-7v7");
    svg.append(path); button.append(svg);
    if (action === "delete") button.classList.add("danger");
    return button;
  }
};
