const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i] ?? 0);
  return s;
}

function readLatin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

async function inflate(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(data));
  void writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

/** Extracts tEXt / zTXt / iTXt chunks from a PNG. */
export async function extractPngTexts(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8 || !isPng(bytes)) throw new Error('不是有效的 PNG 文件');
  const view = new DataView(buffer);
  const out: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (offset + 12 + length > bytes.length) break;
    const type = readAscii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const data = bytes.subarray(dataStart, dataStart + length);
    try {
      if (type === 'tEXt') {
        const zero = data.indexOf(0);
        if (zero > 0) {
          const keyword = readLatin1(data.subarray(0, zero));
          const text = readLatin1(data.subarray(zero + 1));
          if (!(keyword in out)) out[keyword] = text;
        }
      } else if (type === 'zTXt') {
        const zero = data.indexOf(0);
        if (zero > 0) {
          const keyword = readLatin1(data.subarray(0, zero));
          const compressed = data.subarray(zero + 2);
          const text = new TextDecoder('utf-8').decode(await inflate(compressed));
          if (!(keyword in out)) out[keyword] = text;
        }
      } else if (type === 'iTXt') {
        const zero = data.indexOf(0);
        if (zero > 0) {
          const keyword = readLatin1(data.subarray(0, zero));
          const compressionFlag = data[zero + 1] ?? 0;
          let cursor = zero + 3;
          // language tag
          let next = data.indexOf(0, cursor);
          if (next < 0) next = data.length;
          cursor = next + 1;
          // translated keyword
          next = data.indexOf(0, cursor);
          if (next < 0) next = data.length;
          cursor = next + 1;
          let content: Uint8Array<ArrayBuffer> = new Uint8Array(data.subarray(cursor));
          if (compressionFlag === 1) content = await inflate(content);
          const text = new TextDecoder('utf-8').decode(content);
          if (!(keyword in out)) out[keyword] = text;
        }
      }
    } catch {
      // Ignore malformed chunks and keep scanning.
    }
    offset += 12 + length;
  }
  return out;
}

export function decodeBase64Json(text: string): unknown {
  let raw = text.trim();
  const comma = raw.indexOf('base64,');
  if (raw.startsWith('data:') && comma >= 0) raw = raw.slice(comma + 7);
  raw = raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (raw.length % 4 !== 0) raw += '=';
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[');
}

export function parseEmbeddedJson(text: string): unknown {
  if (looksLikeJson(text)) return JSON.parse(text);
  return decodeBase64Json(text);
}

export async function extractCardJsonFromPng(buffer: ArrayBuffer): Promise<unknown> {
  const texts = await extractPngTexts(buffer);
  const order = ['ccv3', 'chara', 'character', 'card'];
  for (const key of order) {
    if (texts[key]) {
      try {
        return parseEmbeddedJson(texts[key]);
      } catch {
        // Try the next chunk key.
      }
    }
  }
  const keys = Object.keys(texts);
  throw new Error(
    keys.length
      ? `PNG 中未找到角色卡数据（发现文本块：${keys.join(', ')}）`
      : '这张 PNG 没有角色卡数据，请确认它是酒馆角色卡',
  );
}
