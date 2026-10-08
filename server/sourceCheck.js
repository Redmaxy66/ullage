export function normalizeWithMap(raw) {
  let norm = "";
  const map = [];
  let pendingSpace = false;
  for (let index = 0; index < raw.length; index += 1) {
    const original = raw[index];
    let ch = original.toLowerCase();
    if (ch === "\u2018" || ch === "\u2019") ch = "'";
    if (ch === "\u201c" || ch === "\u201d") ch = '"';
    if (ch === "\u2013" || ch === "\u2014") ch = "-";
    if (/\s/.test(original)) {
      pendingSpace = norm.length > 0;
      continue;
    }
    if (pendingSpace) {
      map.push(index);
      norm += " ";
      pendingSpace = false;
    }
    map.push(index);
    norm += ch;
  }
  return { norm, map };
}

export function normalize(value) {
  return normalizeWithMap(String(value ?? "")).norm;
}

function sliceRaw(raw, map, start, end) {
  if (start < 0 || end <= start || !map.length) return null;
  const from = map[Math.min(start, map.length - 1)];
  const to = map[Math.min(end - 1, map.length - 1)] + 1;
  return raw.slice(from, to).replace(/\s+/g, " ").trim();
}

export function verifiedExcerpt(quote, rawSource) {
  const candidate = String(quote ?? "").trim();
  if (candidate.length < 12) return null;
  const source = normalizeWithMap(String(rawSource ?? ""));
  const wanted = normalize(candidate);
  if (!wanted) return null;
  let at = source.norm.indexOf(wanted);
  if (at >= 0) return sliceRaw(rawSource, source.map, at, at + wanted.length);

  const words = wanted.split(" ").filter((word) => word.length > 2);
  if (words.length < 5) return null;
  for (let size = Math.min(words.length, 14); size >= 5; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");
      at = source.norm.indexOf(phrase);
      if (at >= 0) return sliceRaw(rawSource, source.map, at, at + phrase.length);
    }
  }
  return null;
}

export function phraseInSource(phrase, rawSource) {
  const wanted = normalize(phrase);
  if (!wanted || wanted.length < 3) return false;
  return normalize(rawSource).includes(wanted);
}
