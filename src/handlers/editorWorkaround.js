import { quickToolUsed } from "./quickTools";

let debounceTimer;
let lastInput = null;
let keyboardTimer;
let selectionChangeRaf = 0;

function setTouched() {
	clearTimeout(debounceTimer);
	document.body.setAttribute("data-editor-touched", "true");
	debounceTimer = setTimeout(() => {
		document.body.removeAttribute("data-editor-touched");
	}, 200);
}

document.addEventListener(
	"pointerdown",
	(e) => {
		lastInput = "pointer";
		if (e.target.closest(".editor-container")) setTouched();
	},
	true,
);

document.addEventListener("selectionchange", () => {
	if (lastInput !== "pointer" || quickToolUsed) return;
	// Defer DOM work to rAF to avoid blocking input during rapid typing
	if (selectionChangeRaf) return;
	selectionChangeRaf = requestAnimationFrame(() => {
		selectionChangeRaf = 0;
		if (lastInput !== "pointer" || quickToolUsed) return;
		const sel = document.getSelection();
		if (!sel?.rangeCount) return;
		const node = sel.getRangeAt(0).startContainer;
		if (!node) return;
		const el = node.nodeType === 3 ? node.parentElement : node;
		if (el?.closest(".editor-container")) setTouched();
	});
});

