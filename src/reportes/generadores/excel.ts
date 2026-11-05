import ExcelJS from 'exceljs';
import { fechaParaExcel, fmtFechaHora } from '../formato.js';
import { fondoDe, type Celda, type Reporte, type TipoColumna } from '../reporte.types.js';

const COLOR_CABECERA = 'FF7B4A2D'; // marrón, como el diseño de la tienda
const COLOR_GRUPO = 'FFFBEFE6'; // durazno claro
const COLOR_TOTAL = 'FFEEEEEE';

const FORMATO: Partial<Record<TipoColumna, string>> = {
  entero: '#,##0',
  usd: '#,##0.00',
  bs: '#,##0.00',
  tasa: '#,##0.00##',
  fecha: 'dd/mm/yyyy',
  fechaHora: 'dd/mm/yyyy hh:mm',
};

const ANCHO: Record<TipoColumna, number> = {
  texto: 18,
  entero: 9,
  usd: 12,
  bs: 15,
  tasa: 11,
  fecha: 11,
  fechaHora: 16,
};

function valorExcel(v: Celda | undefined): ExcelJS.CellValue {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return fechaParaExcel(v);
  return v;
}

/** Excel limita los nombres de hoja a 31 caracteres y prohíbe algunos símbolos. */
function nombreHoja(nombre: string): string {
  return nombre.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
}

export async function generarExcel(r: Reporte): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Tienda del Monasterio';
  libro.created = r.generadoEn;

  // ---------- Hoja de resumen ----------
  if (r.resumen.length > 0) {
    const ws = libro.addWorksheet('Resumen');
    ws.columns = [{ width: 42 }, { width: 40 }];
    ws.addRow([`TIENDA DEL MONASTERIO — ${r.titulo}`]).font = { bold: true, size: 14 };
    ws.addRow([`Período: ${r.periodo}`]).font = { size: 11 };
    ws.addRow([`Generado el ${fmtFechaHora(r.generadoEn)} por ${r.generadoPor}`]).font = {
      italic: true,
      color: { argb: 'FF666666' },
    };
    ws.addRow([]);
    for (const item of r.resumen) {
      const fila = ws.addRow([item.etiqueta, item.valor]);
      fila.getCell(1).font = { bold: true };
    }
  }

  // ---------- Hojas de datos ----------
  for (const h of r.hojas) {
    const ws = libro.addWorksheet(nombreHoja(h.nombre), { views: [{ state: 'frozen', ySplit: 4 }] });
    const n = h.columnas.length;

    ws.getCell(1, 1).value = h.titulo;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    ws.mergeCells(1, 1, 1, n);
    ws.getCell(2, 1).value = `Período: ${r.periodo}`;
    ws.mergeCells(2, 1, 2, n);

    h.columnas.forEach((c, i) => {
      const columna = ws.getColumn(i + 1);
      columna.width = c.ancho ?? ANCHO[c.tipo];
      const formato = FORMATO[c.tipo];
      if (formato) columna.numFmt = formato;
    });

    // Encabezados agrupados en la fila 3 (p. ej. "TOTAL FACTURADO" sobre dos columnas)
    for (const g of h.grupos ?? []) {
      const desde = h.columnas.findIndex((c) => c.clave === g.desde) + 1;
      const hasta = h.columnas.findIndex((c) => c.clave === g.hasta) + 1;
      if (desde < 1 || hasta < desde) continue;
      if (hasta > desde) ws.mergeCells(3, desde, 3, hasta);
      const celda = ws.getCell(3, desde);
      celda.value = g.titulo;
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CABECERA } };
      celda.alignment = { horizontal: 'center', vertical: 'middle' };
      celda.border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    }

    const cabecera = ws.getRow(4);
    h.columnas.forEach((c, i) => {
      const celda = cabecera.getCell(i + 1);
      celda.value = c.titulo;
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CABECERA } };
      celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    cabecera.height = 30;

    for (const f of h.filas) {
      const fila = ws.addRow(h.columnas.map((c) => valorExcel(f[c.clave] as Celda | undefined)));
      const sombreada = typeof f.__grupo === 'number' && f.__grupo % 2 === 1;
      for (let i = 1; i <= n; i++) {
        const celda = fila.getCell(i);
        if (sombreada) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GRUPO } };
        if (h.columnas[i - 1]?.negrita) celda.font = { bold: true };
        const fondo = f[fondoDe(h.columnas[i - 1]?.clave ?? '')];
        if (typeof fondo === 'string') {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fondo}` } };
          celda.alignment = { horizontal: 'center' };
        }
        if (f.__anulada) celda.font = { strike: true, color: { argb: 'FF999999' } };
      }
    }

    if (h.totales) {
      const fila = ws.addRow(h.columnas.map((c) => valorExcel(h.totales![c.clave] ?? null)));
      for (let i = 1; i <= n; i++) {
        const celda = fila.getCell(i);
        celda.font = { bold: true };
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL } };
        celda.border = { top: { style: 'thin' } };
      }
    }

    if (h.nota) {
      ws.addRow([]);
      ws.addRow([h.nota]).font = { italic: true, color: { argb: 'FF666666' } };
    }

    if (h.filas.length > 0) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
  }

  const datos = await libro.xlsx.writeBuffer();
  return Buffer.from(datos as ArrayBuffer);
}
