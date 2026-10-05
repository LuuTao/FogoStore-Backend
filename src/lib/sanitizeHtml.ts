const escapeText = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const allowedTags = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'figure', 'figcaption', 'span', 'div',
]);
const voidTags = new Set(['br', 'hr', 'img']);

const safeUrl = (value: string, image = false) => {
  const clean = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, '');
  if (!clean) return null;
  if (clean.startsWith('/') || clean.startsWith('#')) return clean;
  try {
    const url = new URL(clean);
    const protocols = image ? ['https:'] : ['https:', 'http:', 'mailto:', 'tel:'];
    return protocols.includes(url.protocol) ? clean : null;
  } catch {
    return null;
  }
};

const sanitizeAttributes = (tag: string, raw: string) => {
  const attributes: string[] = [];
  const quotedAttribute = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = quotedAttribute.exec(raw))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? '';
    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') continue;
    if (tag === 'a' && name === 'href') {
      const url = safeUrl(value);
      if (url) attributes.push(`href="${escapeText(url)}"`);
    } else if (tag === 'img' && name === 'src') {
      const url = safeUrl(value, true);
      if (url) attributes.push(`src="${escapeText(url)}"`);
    } else if (['alt', 'title'].includes(name) && ['a', 'img'].includes(tag)) {
      attributes.push(`${name}="${escapeText(value.slice(0, 300))}"`);
    } else if (name === 'class' && /^[a-zA-Z0-9 _-]{1,200}$/.test(value)) {
      attributes.push(`class="${value}"`);
    } else if (['width', 'height', 'colspan', 'rowspan'].includes(name) && /^\d{1,4}$/.test(value)) {
      attributes.push(`${name}="${value}"`);
    }
  }
  if (tag === 'a') attributes.push('rel="noopener noreferrer nofollow"');
  return attributes.length ? ` ${[...new Set(attributes)].join(' ')}` : '';
};

// Bộ lọc mặc định từ chối mọi thẻ/thuộc tính không nằm trong allowlist.
// HTML không hợp lệ được chuyển thành text thay vì cố đoán và thực thi.
export const sanitizeRichHtml = (input: unknown): string => {
  const html = String(input ?? '');
  let output = '';
  let cursor = 0;
  const tagPattern = /<!--[\s\S]*?-->|<[^>]*>/g;
  let token: RegExpExecArray | null;
  while ((token = tagPattern.exec(html))) {
    output += escapeText(html.slice(cursor, token.index));
    cursor = token.index + token[0].length;
    if (token[0].startsWith('<!--')) continue;
    const parsed = token[0].match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)([\s\S]*?)\/?\s*>$/);
    if (!parsed) {
      output += escapeText(token[0]);
      continue;
    }
    const closing = parsed[1] === '/';
    const tag = parsed[2].toLowerCase();
    if (!allowedTags.has(tag)) continue;
    if (closing) {
      if (!voidTags.has(tag)) output += `</${tag}>`;
      continue;
    }
    output += `<${tag}${sanitizeAttributes(tag, parsed[3] || '')}${voidTags.has(tag) ? '>' : '>'}`;
  }
  output += escapeText(html.slice(cursor));
  return output.trim();
};

export const sanitizePlainText = (input: unknown, maxLength = 5000) =>
  String(input ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, maxLength);

export const sanitizeJsonStrings = (value: unknown): unknown => {
  if (typeof value === 'string') return sanitizePlainText(value, 10000);
  if (Array.isArray(value)) return value.map(sanitizeJsonStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [sanitizePlainText(key, 100), sanitizeJsonStrings(child)]));
  }
  return value;
};
