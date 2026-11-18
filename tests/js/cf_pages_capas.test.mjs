import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../../cloudflare/pages/functions/data/capas/[archivo].js";

const datos = new TextEncoder().encode("0123456789");
const objeto = (range) => ({
  size: datos.length, httpEtag: '"e1"', body: new Blob([range ? datos.slice(range.offset, range.offset + range.length) : datos]).stream(),
  range, writeHttpMetadata: (h) => h.set("content-type", "application/vnd.pmtiles"),
});
const env = {
  GRANDES: {
    head: async (k) => (k === "capas/a.pmtiles" ? { ...objeto(), body: undefined } : null),
    get: async (k, o) => {
      if (k !== "capas/a.pmtiles") return null;
      const r = o?.range?.get?.("range");
      if (!r) return objeto();
      const [, a, b] = r.match(/bytes=(\d+)-(\d+)/);
      return objeto({ offset: Number(a), length: Number(b) - Number(a) + 1 });
    },
  },
};
const sigue = async () => new Response("estático", { status: 200 });

test("sirve un rango de bytes desde R2 (PMTiles)", async () => {
  const r = await onRequest({ request: new Request("https://x/data/capas/a.pmtiles", { headers: { range: "bytes=2-5" } }), env, params: { archivo: "a.pmtiles" }, next: sigue });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await r.text(), "2345");
});

test("archivo completo, HEAD y lo que no está en R2", async () => {
  const r = await onRequest({ request: new Request("https://x/data/capas/a.pmtiles"), env, params: { archivo: "a.pmtiles" }, next: sigue });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "0123456789");
  const h = await onRequest({ request: new Request("https://x/data/capas/a.pmtiles", { method: "HEAD" }), env, params: { archivo: "a.pmtiles" }, next: sigue });
  assert.equal(h.headers.get("content-length"), "10");
  const n = await onRequest({ request: new Request("https://x/data/capas/b.pmtiles"), env, params: { archivo: "b.pmtiles" }, next: sigue });
  assert.equal(await n.text(), "estático");
  const sinR2 = await onRequest({ request: new Request("https://x/data/capas/a.pmtiles"), env: {}, params: { archivo: "a.pmtiles" }, next: sigue });
  assert.equal(await sinR2.text(), "estático");
});
