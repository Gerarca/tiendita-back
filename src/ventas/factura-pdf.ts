import type { Content, TableCell } from 'pdfmake';
import { D, redondear2, sumar, type Decimal } from '../common/dinero.js';
import { crearPdf, type TDocumentDefinitions } from '../reportes/generadores/pdf.js';
import { fmtFechaHora, fmtNumero } from '../reportes/formato.js';
import type { VentaCompleta } from './ventas.service.js';

/**
 * Factura de venta en el formato de la tienda (modelo "TIENDITA MONASTERIO HUMOCARO"):
 * encabezado con datos del cliente, tabla de productos, bloque de pagos por
 * columna (EF. $ / EF. Bs. / P.M. o Tj / Banco) y totales en $ y Bs.
 */

const GRIS = '#D9D9D9';
/** A5 horizontal en puntos (210 × 148 mm). */
const PAGINA = { ancho: 595.28, alto: 419.53 };
/**
 * Márgenes pedidos por la tienda: más amplio a la izquierda (≈ 2,4 cm) y
 * ≈ 1,7 cm a la derecha. El contenido ocupa el espacio entre ambos.
 */
const MARGEN_IZQUIERDO = 68;
const MARGEN_DERECHO = 48;
const SEPARACION = 6;
const ANCHO_MAQUINA = 162;
const ANCHO_FACTURA = PAGINA.ancho - MARGEN_IZQUIERDO - MARGEN_DERECHO - SEPARACION - ANCHO_MAQUINA;
/** Alto aproximado de la factura (medido): fijo + una fila por producto. */
const ALTO_BASE = 171;
const ALTO_FILA = 10.6;

/** Filas de productos que se dibujan aunque estén vacías (media hoja A5). */
const FILAS_MINIMAS = 8;
const ORDINAL = ['PAGO', '2DO PAGO', '3ER PAGO', '4TO PAGO', '5TO PAGO', '6TO PAGO'];
const NOMBRE_METODO: Record<string, string> = {
  TARJETA: 'TARJETA',
  PAGO_MOVIL: 'PAGO MÓVIL',
  TRANSFERENCIA: 'TRANSFERENCIA',
  EFECTIVO_BS: 'EFECTIVO Bs.',
  EFECTIVO_USD: 'EFECTIVO $',
};

const n2 = (v: { toNumber(): number } | number) => fmtNumero(typeof v === 'number' ? v : v.toNumber(), 2);
const vacio = (v: string | null | undefined) => v?.trim() || '';

/** "16735520" → "16.735.520" */
const conPuntos = (numero: string) => numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const etiqueta = (texto: string): TableCell => ({ text: texto, bold: true, alignment: 'right' });

/** Bordes finos negros en todas las celdas, como el modelo impreso. */
const conBordes = {
  hLineWidth: () => 0.7,
  vLineWidth: () => 0.7,
  hLineColor: () => '#000000',
  vLineColor: () => '#000000',
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 1.6,
  paddingBottom: () => 1.6,
};

/**
 * Recuadro "MÁQUINA Bs.": el total en Bs agrupado por voz de la máquina fiscal,
 * separado en CON IVA y EXENTO. Usa la voz que quedó guardada en cada producto
 * vendido, así una factura vieja no cambia si después se reorganizan las voces.
 */
function cuadroMaquina(v: VentaCompleta): Content {
  const SIN_VOZ = 'SIN CLASIFICAR';
  const grupos = new Map<string, { conIva: Decimal; exento: Decimal; sinDato: Decimal }>();
  for (const d of v.detalles) {
    const nombre = d.vozFiscal ?? SIN_VOZ;
    const g = grupos.get(nombre) ?? { conIva: D(0), exento: D(0), sinDato: D(0) };
    const bs = d.subtotalUsd.times(v.tasaAplicada);
    if (d.exentoIva === true) g.exento = g.exento.plus(bs);
    else if (d.exentoIva === false) g.conIva = g.conIva.plus(bs);
    else g.sinDato = g.sinDato.plus(bs);
    grupos.set(nombre, g);
  }

  const nombres = [...grupos.keys()].sort((a, b) => (a === SIN_VOZ ? 1 : b === SIN_VOZ ? -1 : a.localeCompare(b, 'es')));
  let totalConIva = D(0);
  let totalExento = D(0);
  let totalGeneral = D(0);
  const filas: TableCell[][] = nombres.map((nombre) => {
    const g = grupos.get(nombre)!;
    const conIva = redondear2(g.conIva);
    const exento = redondear2(g.exento);
    const total = conIva.plus(exento).plus(redondear2(g.sinDato));
    totalConIva = totalConIva.plus(conIva);
    totalExento = totalExento.plus(exento);
    totalGeneral = totalGeneral.plus(total);
    return [
      { text: nombre, fontSize: 5.5 },
      { text: conIva.gt(0) ? n2(conIva) : '', alignment: 'right' },
      { text: exento.gt(0) ? n2(exento) : '', alignment: 'right' },
      { text: n2(total), alignment: 'right' },
    ];
  });

  const gris = { fillColor: GRIS, bold: true };
  return {
    stack: [
      {
        table: {
          widths: ['*', 29, 29, 33],
          body: [
            [{ text: 'MÁQUINA Bs.', ...gris, colSpan: 2 }, {}, { text: '', fillColor: GRIS }, { text: '', fillColor: GRIS }],
            [
              { text: 'VOZ', ...gris, alignment: 'center' },
              { text: 'CON IVA', ...gris, alignment: 'center' },
              { text: 'EXENTO', ...gris, alignment: 'center' },
              { text: 'Total\ngeneral', ...gris, alignment: 'center' },
            ],
            ...filas,
            [
              { text: 'Total general', bold: true, fontSize: 6.5 },
              { text: n2(totalConIva), bold: true, alignment: 'right' },
              { text: n2(totalExento), bold: true, alignment: 'right' },
              { text: n2(totalGeneral), bold: true, alignment: 'right' },
            ],
          ],
        },
        layout: { ...conBordes, paddingLeft: () => 2, paddingRight: () => 2 },
        fontSize: 6.5,
      },
      ...(grupos.has(SIN_VOZ)
        ? [{ text: 'SIN CLASIFICAR: productos sin voz fiscal asignada.', fontSize: 5.5, color: '#666666', margin: [0, 2, 0, 0] } as Content]
        : []),
    ],
  };
}

export async function generarFacturaPdf(v: VentaCompleta, titulo: string): Promise<Buffer> {
  const anulada = v.estado === 'ANULADA';
  const formaPago = v.pagos.length > 1 ? 'MIXTA' : (NOMBRE_METODO[v.pagos[0]?.metodo] ?? '-');
  const documento =
    v.cliente.tipoDocumento && v.cliente.numeroDocumento ? `${v.cliente.tipoDocumento}- ${conPuntos(v.cliente.numeroDocumento)}` : '';
  const direccion = [v.cliente.direccion, v.cliente.ciudad, v.cliente.estado].filter(Boolean).join(', ');

  // ---------- Encabezado ----------
  const encabezado: Content = {
    table: {
      widths: ['*'],
      body: [
        [{ text: titulo, bold: true, fontSize: 11, alignment: 'center', fillColor: GRIS, margin: [0, 2, 0, 2] }],
        [
          {
            table: {
              widths: [38, '*', 64, 58],
              body: [
                [etiqueta('FECHA:'), fmtFechaHora(v.fecha), etiqueta('VENTA Nº'), { text: v.numeroControl, bold: true, alignment: 'center' }],
                [etiqueta('NOMBRE:'), v.cliente.nombre, etiqueta('DÓLAR DEL DÍA:'), { text: `${n2(v.tasaAplicada)} Bs`, bold: true, alignment: 'center' }],
                [
                  etiqueta('CI:'),
                  documento,
                  {
                    // Recuadro independiente, como en el modelo impreso
                    colSpan: 2,
                    rowSpan: 2,
                    margin: [6, 0, 0, 0],
                    table: {
                      widths: ['*'],
                      body: [[{ text: 'FORMA DE PAGO:', bold: true, alignment: 'center' }], [{ text: formaPago, alignment: 'center' }]],
                    },
                    layout: { ...conBordes, hLineWidth: (i: number) => (i === 1 ? 0 : 0.7) },
                  },
                  {},
                ],
                [etiqueta('TELF:'), vacio(v.cliente.telefono), {}, {}],
                [etiqueta('DIR:'), { text: direccion, colSpan: 3 }, {}, {}],
              ],
            },
            layout: 'noBorders',
          },
        ],
      ],
    },
    layout: conBordes,
  };

  // ---------- Productos ----------
  const cabeceraProductos: TableCell[] = [
    { text: '', fillColor: GRIS },
    { text: 'PRODUCTO', bold: true, alignment: 'center', fillColor: GRIS },
    { text: 'CANT.', bold: true, alignment: 'center', fillColor: GRIS },
    { text: 'PRECIO\nUD ($)', bold: true, alignment: 'center', fillColor: GRIS },
    { text: 'TOTAL ($)', bold: true, alignment: 'center', fillColor: GRIS },
  ];
  const filasProductos: TableCell[][] = v.detalles.map((d) => [
    d.codigoProducto,
    d.nombreProducto,
    { text: String(d.cantidad), alignment: 'right' },
    { text: n2(d.precioUnitUsd), alignment: 'right' },
    { text: n2(d.subtotalUsd), alignment: 'right' },
  ]);
  while (filasProductos.length < FILAS_MINIMAS) filasProductos.push([' ', '', '', '', '']);

  const productos: Content = {
    table: { widths: [40, '*', 24, 36, 40], headerRows: 1, body: [cabeceraProductos, ...filasProductos] },
    layout: conBordes,
    margin: [0, -0.7, 0, 0],
  };

  // ---------- Pagos (una fila por pago, el monto en su columna) ----------
  const derecha: [string, string][] = [
    ['TOTAL ($)', n2(v.totalUsd)],
    ['1 $ = (Bs)', n2(v.tasaAplicada)],
    ['TOTAL Bs.', n2(v.totalBs)],
  ];
  const filasPago = Math.max(2, v.pagos.length);
  const cuerpoPagos: TableCell[][] = [
    [
      { text: '', fillColor: GRIS },
      { text: 'EF. $', bold: true, alignment: 'center', fillColor: GRIS },
      { text: 'EF. Bs.', bold: true, alignment: 'center', fillColor: GRIS },
      { text: 'P. M. o Tj', bold: true, alignment: 'center', fillColor: GRIS },
      { text: 'Banco', bold: true, alignment: 'center', fillColor: GRIS },
      { text: derecha[0][0], bold: true, alignment: 'right' },
      { text: derecha[0][1], alignment: 'right' },
    ],
  ];
  for (let i = 0; i < filasPago; i++) {
    const p = v.pagos[i];
    const enColumna = (metodos: string[]) => (p && metodos.includes(p.metodo) ? n2(p.monto) : '');
    const [etiquetaDer, valorDer] = derecha[i + 1] ?? ['', ''];
    cuerpoPagos.push([
      { text: ORDINAL[i] ?? `${i + 1}° PAGO`, bold: true, fontSize: 6.5, alignment: 'center', fillColor: GRIS },
      { text: enColumna(['EFECTIVO_USD']), alignment: 'right' },
      { text: enColumna(['EFECTIVO_BS']), alignment: 'right' },
      { text: enColumna(['PAGO_MOVIL', 'TARJETA', 'TRANSFERENCIA']), alignment: 'right' },
      { text: p?.cuenta?.nombre ?? '', fontSize: 6, alignment: 'center' },
      { text: etiquetaDer, bold: true, alignment: 'right' },
      { text: valorDer, alignment: 'right' },
    ]);
  }
  const pagos: Content = {
    table: { widths: [38, 30, 38, 42, '*', 40, 40], body: cuerpoPagos },
    layout: conBordes,
    margin: [0, 5, 0, 0],
  };

  // ---------- Resumen de lo cobrado ----------
  const divisasBs = sumar(v.pagos.filter((p) => p.moneda === 'USD').map((p) => p.montoBs));
  const bolivares = sumar(v.pagos.filter((p) => p.moneda === 'BS').map((p) => p.montoBs));
  const chico = { fontSize: 6, bold: true };
  const resumen: Content = {
    table: {
      widths: [48, 32, 68, 40, 46, 32],
      body: [
        [
          { text: 'DIVISAS (Bs):', ...chico },
          { text: divisasBs.gt(0) ? n2(divisasBs) : '-', alignment: 'right' },
          { text: 'EFECTIVO + P.M. Bs:', ...chico },
          { text: bolivares.gt(0) ? n2(bolivares) : '-', alignment: 'right' },
          { text: 'AL CAMBIO $:', ...chico },
          { text: n2(v.pagadoUsd), alignment: 'right' },
        ],
        [
          { text: 'PAGO TOTAL $', ...chico },
          { text: n2(v.pagadoUsd), alignment: 'right' },
          { text: 'PAGO TOTAL Bs.', ...chico },
          { text: n2(v.pagadoBs), alignment: 'right' },
          { text: '', border: [true, true, false, false] },
          { text: '', border: [false, true, false, false] },
        ],
      ],
    },
    layout: conBordes,
  };

  // ---------- Pie ----------
  const pie: Content[] = [{ text: `Atendido por: ${v.usuario.nombre}`, fontSize: 7, color: '#444444', margin: [0, 4, 0, 0] }];
  const diferencia = v.pagadoBs.minus(v.totalBs);
  if (diferencia.gt(D(0))) {
    pie.push({ text: `Pagado de más: ${n2(diferencia)} Bs`, fontSize: 7, color: '#444444' });
  }
  if (anulada) {
    pie.push({
      text: `VENTA ANULADA el ${v.anuladaEn ? fmtFechaHora(v.anuladaEn) : ''} por ${v.anuladaPor?.nombre ?? ''}. Motivo: ${v.motivoAnulacion ?? ''}`,
      fontSize: 8,
      bold: true,
      color: '#B3412E',
      margin: [0, 4, 0, 0],
    });
  }

  // Centrado vertical: el margen superior reparte el espacio libre arriba y abajo
  const filas = Math.max(FILAS_MINIMAS, v.detalles.length);
  const alto = ALTO_BASE + filas * ALTO_FILA;
  const margenSuperior = ALTO_BASE > 0 ? Math.max(14, (PAGINA.alto - alto) / 2) : 18;

  const documentoPdf: TDocumentDefinitions = {
    // Media hoja: A5 horizontal (210 × 148 mm)
    pageSize: 'A5',
    pageOrientation: 'landscape',
    pageMargins: [MARGEN_IZQUIERDO, margenSuperior, MARGEN_DERECHO, 10],
    defaultStyle: { font: 'Helvetica', fontSize: 7.2 },
    info: { title: `Venta ${v.numeroControl}`, author: titulo },
    ...(anulada ? { watermark: { text: 'ANULADA', color: '#B3412E', opacity: 0.25, bold: true } } : {}),
    content: [
      {
        // Como el modelo: la factura a la izquierda y "MÁQUINA Bs." a la derecha
        columns: [
          { width: ANCHO_FACTURA, stack: [encabezado, productos, pagos, resumen, ...pie] },
          { width: ANCHO_MAQUINA, stack: [cuadroMaquina(v)], margin: [0, 92, 0, 0] },
        ],
        columnGap: SEPARACION,
      },
    ],
  };
  return crearPdf(documentoPdf);
}
