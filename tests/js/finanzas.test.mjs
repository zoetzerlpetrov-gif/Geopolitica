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

test("solo enlaces de la SEC y claves del índice", async () => {
  const { esSec } = await import("../../js/finanzas.js");
  assert.equal(esSec("https://www.sec.gov/Archives/edgar/data/1/2/a.htm"), true);
  assert.equal(esSec("javascript:alert(1)"), false);
  assert.equal(esSec("https://www.sec.gov.malo.com/x"), false);
  assert.equal(tickerDe("../../secreto", { empresas: [{ ticker: "AAPL", nombre: "Apple", estado: "ok" }] }), null);
});

test("tipo de instrumento y filtros", async () => {
  const { tipoDe, filtrar, valores } = await import("../../js/finanzas.js");
  const emp = [
    { ticker: "AAPL", nombre: "Apple", sector: "Tecnología", estado: "ok", calificacion: "verde" },
    { ticker: "TXN", nombre: "Texas Instruments", sector: "Semiconductores", estado: "ok", calificacion: "rojo" },
    { ticker: "VOO", nombre: "Vanguard S&P 500", sector: "ETFs / Índices", estado: "sin_datos" },
    { ticker: "BTC-USD", nombre: "Bitcoin", sector: "Criptomonedas", estado: "sin_datos" },
    { ticker: "FUNO11.MX", nombre: "Fibra Uno", sector: "FIBRAs (bienes raíces)", estado: "sin_datos" },
    { ticker: "WALMEX.MX", nombre: "Walmart de México", sector: "Retail / Comercio", estado: "sin_datos" },
    { ticker: "BYDDY", nombre: "BYD", sector: "Automotriz", estado: "sin_datos" },
  ];
  assert.deepEqual(emp.map(tipoDe), ["Acción con reportes a la SEC", "Acción con reportes a la SEC", "ETF o índice", "Criptomoneda",
    "FIBRA (México)", "Acción de la BMV (México)", "ADR o extranjera sin reportes a la SEC"]);
  assert.deepEqual(filtrar(emp, { semaforo: "rojo" }).map((e) => e.ticker), ["TXN"]);
  assert.deepEqual(filtrar(emp, { tipo: "Acción con reportes a la SEC", sector: "Tecnología" }).map((e) => e.ticker), ["AAPL"]);
  assert.deepEqual(filtrar(emp, { texto: "fibra" }).map((e) => e.ticker), ["FUNO11.MX"]);
  assert.equal(valores(emp, tipoDe).length, 6);
});

test("documentos de BIVA permitidos", async () => {
  const { esSec } = await import("../../js/finanzas.js");
  assert.equal(esSec("https://www.biva.mx/storage/data-rs-cnbv/ReporteTrimestral_FUNO_2026_3.pdf"), true);
  assert.equal(esSec("http://www.biva.mx/x.pdf"), false);
});
