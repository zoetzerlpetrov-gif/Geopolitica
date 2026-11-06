import { catalog } from "./catalog-data.js";

const BATCH_SIZE = 12;
const MAX_BYTES = 192 * 1024;

export const catalogInfo = { total: catalog.length, batchSize: BATCH_SIZE };

async function readSignatureBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", complete: true };
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return { text: text + decoder.decode(), complete: true };
    const remaining = MAX_BYTES - size;
    if (value.byteLength > remaining) {
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      await reader.cancel();
      return { text: text + decoder.decode(), complete: false };
    }
    text += decoder.decode(value, { stream: true });
    size += value.byteLength;
  }
}

async function detect(rule, alias) {
  const [source, category, target, pretty, positive, missingCode, negative] = rule;
  const handle = encodeURIComponent(alias);
  const url = (pretty || target).replace("{account}", handle);
  const base = { source, category, url, kind: "catalogo" };
  try {
    const response = await fetch(target.replace("{account}", handle), {
      redirect: "manual",
      headers: { "User-Agent": "DOMINUS-Huella", Accept: "text/html, application/json, text/plain" },
      signal: AbortSignal.timeout(5000)
    });
    const { status } = response;
    if (status === 429 || status === 403 || (status !== 200 && status !== missingCode)) {
      await response.body?.cancel();
      return { ...base, status: status === 429 ? "limitado" : "indeterminado" };
    }
    if (status === missingCode && status !== 200 && !negative) {
      await response.body?.cancel();
      return { ...base, status: "sin_resultado" };
    }
    const type = response.headers.get("Content-Type") || "";
    if (!/^(?:text\/|application\/(?:json|xhtml\+xml))/i.test(type)) {
      await response.body?.cancel();
      return { ...base, status: "indeterminado" };
    }
    const { text, complete } = await readSignatureBody(response);
    const present = status === 200 && text.includes(positive);
    const absent = status === missingCode && Boolean(negative) && text.includes(negative);
    if (present && !absent && (missingCode !== 200 || complete)) return { ...base, status: "indicio" };
    if (absent && !present && (status !== 200 || complete)) return { ...base, status: "sin_resultado" };
  } catch {
    // Una fuente caída o incompatible no interrumpe las demás comprobaciones.
  }
  return { ...base, status: "indeterminado" };
}

export async function inspectCatalog(alias, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= catalog.length || offset % BATCH_SIZE) return null;
  const rules = catalog.slice(offset, offset + BATCH_SIZE);
  const results = [];
  for (let index = 0; index < rules.length; index += 6) {
    results.push(...await Promise.all(rules.slice(index, index + 6).map(rule => detect(rule, alias))));
  }
  return { offset, results };
}
