import {blockedPath} from './core';

/**
 * Obsidian's own reading-mode toggle sits in the note header: a book-open icon
 * while the pane is editing, an edit-3 icon while it is reading. Clicking it
 * switches the pane between Live Preview and Reading view.
 */
const MODE_TOGGLE_ICONS = ['lucide-book-open', 'lucide-edit-3'];
/** The same button matched by tooltip text, in case the icon set changes. */
const MODE_TOGGLE_LABELS = ['reading view', '阅读视图', '切换阅读'];

function elementOf(target: unknown): Element | null {
  return target && typeof target === 'object' && (target as Node).nodeType === 1 ? target as Element : null;
}
function chain(element: Element | null): Element[] {
  const nodes: Element[] = [];
  let node = element;
  while (node) { nodes.push(node); node = node.parentElement; }
  return nodes;
}
function classes(element: Element): string[] { return (element.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
function descendantTokens(element: Element): string[] {
  const tokens: string[] = [];
  const found = element.getElementsByTagName('*');
  for (let index = 0; index < found.length; index++) for (const token of classes(found[index])) tokens.push(token);
  return tokens;
}

/** The header action that switches Obsidian between editing and reading. */
export function readingToggleAction(target: unknown): Element | null {
  const element = elementOf(target);
  if (!element) return null;
  return chain(element).find(node => classes(node).includes('view-action')) ?? null;
}

/** The pane that owns the clicked action; Obsidian tags it with the view type. */
export function readingTogglePane(target: unknown): Element | null {
  const action = readingToggleAction(target);
  if (!action) return null;
  return chain(action).find(node => node.hasAttribute('data-type')) ?? null;
}

/** True when the click landed on Obsidian's native reading-mode toggle. */
export function isNativeReadingToggle(target: unknown): boolean {
  const action = readingToggleAction(target);
  if (!action) return false;
  const pane = readingTogglePane(target);
  if (!pane || pane.getAttribute('data-type') !== 'markdown') return false;
  const icons = descendantTokens(action);
  if (MODE_TOGGLE_ICONS.some(icon => icons.includes(icon))) return true;
  const label = `${action.getAttribute('aria-label') || ''}\n${action.getAttribute('title') || ''}`.toLowerCase();
  return MODE_TOGGLE_LABELS.some(text => label.includes(text));
}

/**
 * Only Markdown carries the native reading toggle, and notes in protected
 * folders must never reach the reader.
 */
export function readingHijackEligible(path: string, extension: string): boolean {
  return extension === 'md' && !blockedPath(path);
}

/**
 * Obsidian is about to switch this Markdown pane into reading view. Take the
 * click over only when the user asked for it, the note may be read here, and
 * the button means "start reading" rather than "back to editing".
 */
export function shouldTakeOverReading(options: {enabled: boolean; path: string; extension: string; mode?: string}): boolean {
  if (!options.enabled) return false;
  if (options.mode === 'preview') return false;
  return readingHijackEligible(options.path, options.extension);
}
