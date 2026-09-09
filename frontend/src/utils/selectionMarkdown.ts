import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx'
});

turndown.use(gfm);

export const markdownFromSelection = (range: Range): string => {
  const fragment = range.cloneContents();
  const container = document.createElement('div');
  container.appendChild(fragment);

  const markdown = turndown.turndown(container.innerHTML).trim();
  if (markdown) return markdown;

  return (range.toString() || '').trim();
};

export const markdownFromTextareaSelection = (
  value: string,
  selectionStart: number,
  selectionEnd: number
): string => {
  if (selectionEnd <= selectionStart) return '';
  return value.slice(selectionStart, selectionEnd).trim();
};