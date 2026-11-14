"use strict";
window.MMConfirmAction = (() => {
  let dialog;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "app-confirm-dialog";
    dialog.setAttribute("aria-labelledby", "appConfirmTitle");
    const form = document.createElement("form"); form.method = "dialog";
    const title = document.createElement("h2"); title.id = "appConfirmTitle";
    const message = document.createElement("p"); message.id = "appConfirmMessage";
    const actions = document.createElement("div"); actions.className = "dialog-actions";
    const cancel = document.createElement("button"); cancel.type = "submit"; cancel.value = "cancel"; cancel.textContent = "Annuler";
    const confirm = document.createElement("button"); confirm.type = "submit"; confirm.value = "confirm"; confirm.className = "confirm-action";
    actions.append(cancel, confirm); form.append(title, message, actions); dialog.append(form); document.body.append(dialog);
    return dialog;
  }
  function ask({ title, message, confirmLabel }) {
    const node = ensureDialog();
    if (node.open) return Promise.resolve(false);
    node.querySelector("#appConfirmTitle").textContent = title;
    node.querySelector("#appConfirmMessage").textContent = message;
    node.querySelector(".confirm-action").textContent = confirmLabel;
    node.returnValue = "";
    return new Promise(resolve => {
      node.addEventListener("close", () => resolve(node.returnValue === "confirm"), { once: true });
      node.showModal();
    });
  }
  return { ask };
})();
