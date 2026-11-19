import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("el Worker crea la tabla de planes con la misma definición que 001_planes.sql", async () => {
  const src = readFileSync(new URL("../../cloudflare/planes/service.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../../cloudflare/planes/001_planes.sql", import.meta.url), "utf8");
  const m = src.match(/export const TABLA = "([^"]+)";/);
  assert.ok(m, "falta TABLA");
  assert.equal(m[1], sql.trim().split(/\s+/).join(" "));
  assert.match(m[1], /^CREATE TABLE IF NOT EXISTS /);
});
