// The contract pages' behaviour (routing/src/contract-pages.ts), served as /design/contract.js:
// the print button, and the button a checkbox enables once it is ticked.
for (const button of document.querySelectorAll("[data-print]")) {
  button.addEventListener("click", () => window.print());
}
for (const box of document.querySelectorAll("input[data-enables]")) {
  const target = box.form.elements.namedItem(box.dataset.enables);
  const follow = () => {
    target.disabled = !box.checked;
  };
  box.addEventListener("change", follow);
  follow();
}
