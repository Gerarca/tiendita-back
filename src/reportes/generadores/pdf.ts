import pdfmake from 'pdfmake';
import type { Content, TableCell } from 'pdfmake';
import { fmtFecha, fmtFechaHora, fmtNumero } from '../formato.js';
import { fondoDe, type Celda, type Columna, type Reporte, type TipoColumna } from '../reporte.types.js';

/** Tipo de la definición del documento, tomado de la propia firma de createPdf. */
export type TDocumentDefinitions = Parameters<typeof pdfmake.createPdf>[0];

/** Fuentes estándar del PDF: no requieren archivos y soportan acentos y ñ. */
const FUENTES = new Set(['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique']);
let configurado = false;

function configurar() {
  if (configurado) return;
  // Seguridad: pdfmake no puede descargar URLs ni leer archivos del disco
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((ruta) => FUENTES.has(ruta));
  pdfmake.setFonts({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });
  configurado = true;
}

/** Genera un PDF con la configuración segura (sin acceso a URLs ni archivos). */
export function crearPdf(documento: TDocumentDefinitions): Promise<Buffer> {
  configurar();
  return pdfmake.createPdf(documento).getBuffer();
}

/** Hoja de los reportes impresos: 8,5" × 13" (oficio), en puntos (72 por pulgada). */
export const HOJA_REPORTES = { width: 8.5 * 72, height: 13 * 72 };

const COLOR_CABECERA = '#7B4A2D';
const COLOR_GRUPO = '#FBEFE6';

function alineacion(tipo: TipoColumna): 'left' | 'right' | 'center' {
  if (tipo === 'texto') return 'left';
  if (tipo === 'fecha' || tipo === 'fechaHora') return 'center';
  return 'right';
}

function texto(v: Celda | boolean | undefined, tipo: TipoColumna): string {
  if (v === undefined || v === null || typeof v === 'boolean') return '';
  if (v instanceof Date) return tipo === 'fechaHora' ? fmtFechaHora(v) : fmtFecha(v);
  if (typeof v === 'number') {
    if (tipo === 'entero') return fmtNumero(v, 0);
    if (tipo === 'tasa') return fmtNumero(v, 2, 4);
    if (tipo === 'usd' || tipo === 'bs') return fmtNumero(v, 2);
    return String(v);
  }
  return v;
}

export async function generarPdf(r: Reporte): Promise<Buffer> {
  configurar();

  const contenido: Content[] = [
    { text: 'TIENDA DEL MONASTERIO', style: 'marca' },
    { text: r.titulo, style: 'titulo' },
    { text: `Período: ${r.periodo}`, style: 'subtitulo' },
  ];

  if (r.resumen.length > 0) {
    contenido.push({
      table: {
        widths: ['auto', 'auto'],
        body: r.resumen.map((item) => [{ text: item.etiqueta, bold: true }, item.valor]),
      },
      layout: 'lightHorizontalLines',
      fontSize: 8.5,
      margin: [0, 4, 0, 12],
    });
  }

  r.hojas.forEach((h, indice) => {
    const columnas: Columna[] = h.columnas.filter((c) => c.pdf !== false);

    contenido.push({
      text: h.titulo,
      style: 'hoja',
      ...(indice > 0 ? { pageBreak: 'before' as const } : {}),
    });

    if (h.filas.length === 0) {
      contenido.push({ text: 'Sin registros en el período.', italics: true, color: '#777777' });
      return;
    }

    const cuerpo: TableCell[][] = [];

    // Encabezados agrupados: una fila extra con celdas que abarcan varias columnas
    const grupos = (h.grupos ?? [])
      .map((g) => ({ ...g, i: columnas.findIndex((c) => c.clave === g.desde), j: columnas.findIndex((c) => c.clave === g.hasta) }))
      .filter((g) => g.i >= 0 && g.j >= g.i);
    if (grupos.length > 0) {
      const fila: TableCell[] = [];
      for (let k = 0; k < columnas.length; k++) {
        const g = grupos.find((x) => x.i === k);
        if (g) {
          fila.push({ text: g.titulo, style: 'cabecera', alignment: 'center', colSpan: g.j - g.i + 1 });
          for (let r = g.i + 1; r <= g.j; r++) fila.push({});
          k = g.j;
        } else {
          fila.push({ text: '', fillColor: '#FFFFFF' });
        }
      }
      cuerpo.push(fila);
    }
    cuerpo.push(columnas.map((c) => ({ text: c.titulo, style: 'cabecera', alignment: 'center' as const })));

    for (const f of h.filas) {
      const sombreada = typeof f.__grupo === 'number' && f.__grupo % 2 === 1;
      cuerpo.push(
        columnas.map((c) => ({
          text: texto(f[c.clave], c.tipo),
          alignment: alineacion(c.tipo),
          ...(c.negrita ? { bold: true } : {}),
          ...(sombreada ? { fillColor: COLOR_GRUPO } : {}),
          ...(typeof f[fondoDe(c.clave)] === 'string' ? { fillColor: `#${f[fondoDe(c.clave)]}`, alignment: 'center' as const } : {}),
          ...(f.__anulada ? { color: '#999999', decoration: 'lineThrough' as const } : {}),
        })),
      );
    }

    if (h.totales) {
      cuerpo.push(
        columnas.map((c) => ({
          text: texto(h.totales![c.clave] ?? null, c.tipo),
          alignment: alineacion(c.tipo),
          bold: true,
          fillColor: '#EEEEEE',
        })),
      );
    }

    contenido.push({
      table: {
        headerRows: grupos.length > 0 ? 2 : 1,
        dontBreakRows: true,
        widths: columnas.map((c) => (c.expandir ? '*' : 'auto')),
        body: cuerpo,
      },
      layout: {
        hLineWidth: (i: number) => (i === 0 || i === 1 ? 0.8 : 0.3),
        vLineWidth: () => 0,
        hLineColor: () => '#BBBBBB',
        paddingLeft: () => 3,
        paddingRight: () => 3,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    });

    if (h.nota) contenido.push({ text: h.nota, style: 'nota' });
  });

  const documento: TDocumentDefinitions = {
    pageSize: HOJA_REPORTES,
    pageOrientation: r.orientacion,
    pageMargins: [28, 28, 28, 40],
    defaultStyle: { font: 'Helvetica', fontSize: r.fuentePdf ?? 7 },
    info: { title: `${r.titulo} — ${r.periodo}`, author: 'Tienda del Monasterio' },
    content: contenido,
    footer: (pagina: number, total: number) => ({
      columns: [
        { text: `Generado el ${fmtFechaHora(r.generadoEn)} por ${r.generadoPor}`, fontSize: 7, color: '#777777' },
        { text: `Página ${pagina} de ${total}`, alignment: 'right', fontSize: 7, color: '#777777' },
      ],
      margin: [28, 14, 28, 0],
    }),
    styles: {
      marca: { fontSize: 9, bold: true, color: COLOR_CABECERA, characterSpacing: 1 },
      titulo: { fontSize: 15, bold: true, margin: [0, 2, 0, 0] },
      subtitulo: { fontSize: 9.5, color: '#444444', margin: [0, 2, 0, 6] },
      hoja: { fontSize: 11, bold: true, color: COLOR_CABECERA, margin: [0, 6, 0, 4] },
      cabecera: { bold: true, color: '#FFFFFF', fillColor: COLOR_CABECERA },
      nota: { fontSize: 7, italics: true, color: '#666666', margin: [0, 4, 0, 0] },
    },
  };

  return pdfmake.createPdf(documento).getBuffer();
}
