import { test } from "node:test";
import assert from "node:assert/strict";
import { formato, opciones, tickerDe } from "../../js/finanzas.js";

test("formato de cifras", () => {
  assert.equal(formato(1234567890), "1,235");
  assert.equal(formato(0.1234, "pct"), "12.3 %");
  assert.equal(formato(1.5, "x"), "1.50");
  assert.equal(formato(null), "—");
});

test("buscador por nombre o clave", () => {
  const ind = { empresas: [{ ticker: "AAPL", nombre: "Apple", estado: "ok" }, { ticker: "VOO", nombre: "Vanguard S&P 500", estado: "sin_datos" }] };
  assert.deepEqual(opciones(ind).map((o) => o.valor), ["Apple (AAPL)"]);
  assert.equal(tickerDe("Apple (AAPL)", ind), "AAPL");
  assert.equal(tickerDe("aapl", ind), "AAPL");
  assert.equal(tickerDe("apple", ind), "AAPL");
  assert.equal(tickerDe("nada", ind), null);
});
