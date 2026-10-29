/**
 * Lectura de la página del BCV. Funciones puras (sin Nest) para poder
 * probarlas aisladas. Si el BCV cambia su página, este es el único
 * archivo que hay que ajustar.
 *
 * Estrategia: convertir el HTML a texto plano y buscar lo que se VE en
 * pantalla, para no depender de la estructura interna de las etiquetas:
 *   "USD 888,89090000"
 *   "Fecha Valor: Jueves, 29 Octubre 2026"
 */

export interface TasaBcv {
  /** Fecha valor publicada por el BCV (AAAA-MM-DD) */
  fecha: string;
  /** Bs por USD como texto decimal con punto (ej. "888.89090000") */
  bsPorUsd: string;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export function parsearPaginaBcv(html: string): TasaBcv {
  const texto = htmlATexto(html);
  return { fecha: extraerFecha(html, texto), bsPorUsd: extraerDolar(texto) };
}

/** Quita scripts, estilos y etiquetas; decodifica entidades básicas. */
export function htmlATexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');
}

function extraerDolar(texto: string): string {
  // "USD" seguido directamente de un número con coma decimal y 2+ decimales.
  // Exige que el número vaya pegado a "USD": así no confunde "(Bs/USD) Banco..."
  const m = /\bUSD\s+(\d{1,3}(?:\.\d{3})*,\d{2,}|\d+,\d{2,})/.exec(texto);
  if (!m) {
    throw new Error('No se encontró el valor del dólar (USD) en la página del BCV');
  }
  return normalizarNumero(m[1]);
}

function extraerFecha(html: string, texto: string): string {
  // 1) Atributo legible por máquina, si existe cerca de "Fecha Valor"
  const mAttr = /Fecha\s+Valor[\s\S]{0,500}?content=["'](\d{4}-\d{2}-\d{2})/i.exec(html);
  if (mAttr) return mAttr[1];

  // 2) Texto visible: "Fecha Valor: Jueves, 29 Octubre 2026" (con o sin "de")
  const mTxt = /Fecha\s+Valor:?\s*(?:[A-Za-zÁÉÍÓÚáéíóúñÑ]+,?\s+)?(\d{1,2})\s+(?:de\s+)?([A-Za-zñÑ]+)\s+(?:de\s+)?(\d{4})/i.exec(
    texto,
  );
  if (mTxt) {
    const mes = MESES[mTxt[2].toLowerCase()];
    if (!mes) throw new Error(`Mes no reconocido en la página del BCV: "${mTxt[2]}"`);
    const dia = mTxt[1].padStart(2, '0');
    return `${mTxt[3]}-${String(mes).padStart(2, '0')}-${dia}`;
  }

  throw new Error('No se encontró la "Fecha Valor" en la página del BCV');
}

/**
 * Convierte el formato venezolano a decimal con punto.
 *   "888,89090000" → "888.89090000"
 *   "1.234,56"     → "1234.56"
 *   "301.37"       → "301.37"   (sin coma: el punto es el decimal)
 */
export function normalizarNumero(texto: string): string {
  const t = texto.trim();
  const limpio = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d+)?$/.test(limpio)) {
    throw new Error(`Valor no numérico en la página del BCV: "${texto}"`);
  }
  return limpio;
}
