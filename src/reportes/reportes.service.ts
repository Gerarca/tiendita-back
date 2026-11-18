import { Injectable, NotFoundException } from '@nestjs/common';
import { MetodoPago, Prisma } from '@prisma/client';
import type { Cliente } from '@prisma/client';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { D, redondear2, sumar } from '../common/dinero.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PeriodoReporteDto, ReportePagosDto } from './dto/reporte.dto.js';
import { fmtNumero } from './formato.js';
import { resolverPeriodo, type Periodo } from './periodo.js';
import { fondoDe, type Columna, type Fila, type Reporte } from './reporte.types.js';

const NOMBRE_METODO: Record<MetodoPago, string> = {
  TARJETA: 'Tarjeta',
  PAGO_MOVIL: 'Pago móvil',
  TRANSFERENCIA: 'Transferencia',
  EFECTIVO_BS: 'Efectivo Bs',
  EFECTIVO_USD: 'Efectivo $',
};

const num = (d: Prisma.Decimal) => d.toNumber();
const usd = (d: Prisma.Decimal) => `${fmtNumero(d.toNumber(), 2)} $`;
const bs = (d: Prisma.Decimal) => `${fmtNumero(d.toNumber(), 2)} Bs`;
const documento = (c: Cliente) =>
  c.tipoDocumento && c.numeroDocumento ? `${c.tipoDocumento}-${c.numeroDocumento}` : null;

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  private base(p: Periodo, u: UsuarioSesion, titulo: string, archivo: string): Omit<Reporte, 'resumen' | 'hojas'> {
    return { titulo, periodo: p.etiqueta, generadoPor: u.nombre, generadoEn: new Date(), archivo, orientacion: 'landscape' };
  }

  // ===================================================================== VENTAS
  /** Reemplaza el Excel "VENTAS DE LA TIENDA": una fila por producto vendido. */
  async ventas(q: PeriodoReporteDto, u: UsuarioSesion): Promise<Reporte> {
    const p = resolverPeriodo(q);
    const ventas = await this.prisma.venta.findMany({
      where: { fecha: p.rango },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      include: {
        cliente: true,
        usuario: { select: { nombre: true } },
        detalles: {
          orderBy: { id: 'asc' },
          include: { producto: { select: { categoria: { select: { nombre: true } } } } },
        },
        pagos: { orderBy: { id: 'asc' }, include: { cuenta: { select: { nombre: true } } } },
      },
    });
    const activas = ventas.filter((v) => v.estado === 'ACTIVA');

    // ---------- Hoja 1: formato "VENTAS DE LA TIENDA - <MES> - PRECIOS VALORADOS EN DÓLARES" ----------
    const columnasVentas: Columna[] = [
      { clave: 'fecha', titulo: 'FECHA', tipo: 'fecha' },
      { clave: 'cliente', titulo: 'CLIENTE', tipo: 'texto', ancho: 24 },
      { clave: 'codigo', titulo: 'COD', tipo: 'texto', ancho: 10 },
      { clave: 'producto', titulo: 'PRODUCTO', tipo: 'texto', ancho: 36, expandir: true },
      { clave: 'cantidad', titulo: 'CANT.', tipo: 'entero', ancho: 6 },
      { clave: 'precioUsd', titulo: 'PRECIO UD. ($)', tipo: 'usd', ancho: 9 },
      { clave: 'subtotalUsd', titulo: 'PRECIO TOTAL ($)', tipo: 'usd', ancho: 9 },
      { clave: 'totalUsd', titulo: 'TOTAL FACT. ($)', tipo: 'usd', ancho: 9, negrita: true },
      { clave: 'tasa', titulo: 'DÓLAR DEL DÍA', tipo: 'tasa', ancho: 9 },
      { clave: 'totalBs', titulo: 'TOTAL FACT. Bs.', tipo: 'bs', ancho: 12, negrita: true },
      { clave: 'formaPago', titulo: 'FORMA DE PAGO', tipo: 'texto', ancho: 14 },
      { clave: 'banco', titulo: 'BANCO', tipo: 'texto', ancho: 16 },
      { clave: 'numero', titulo: 'N° CONTROL', tipo: 'texto', ancho: 11 },
      { clave: 'pagadoUsd', titulo: 'PAGO TOTAL ($)', tipo: 'usd', ancho: 9, negrita: true },
      { clave: 'pagadoBs', titulo: 'PAGO TOTAL (Bs)', tipo: 'bs', ancho: 12, negrita: true },
    ];

    /** Etiqueta y color de la forma de pago, como en la hoja de la tienda. */
    const FORMA: Record<string, { texto: string; fondo?: string }> = {
      MIXTA: { texto: 'MIXTA', fondo: 'D9C8EE' },
      EFECTIVO_USD: { texto: 'EFECTIVO $', fondo: 'C6E7C6' },
      EFECTIVO_BS: { texto: 'EFECTIVO Bs.', fondo: 'F4C7C3' },
      PAGO_MOVIL: { texto: 'PAGO MÓVIL' },
      TRANSFERENCIA: { texto: 'TRANSFERENCIA' },
      TARJETA: { texto: 'TARJETA' },
    };

    const filasVentas: Fila[] = [];
    ventas.forEach((v, g) => {
      const cuentas = [...new Set(v.pagos.map((pg) => pg.cuenta?.nombre).filter((c): c is string => !!c))];
      const forma = FORMA[v.pagos.length > 1 ? 'MIXTA' : v.pagos[0].metodo];
      const c = v.cliente;
      // El cliente se apila en su columna: nombre, CI, teléfono, ciudad
      const lineasCliente = [
        c.nombre,
        c.tipoDocumento && c.numeroDocumento ? `${c.tipoDocumento}- ${c.numeroDocumento.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : null,
        c.telefono,
        [c.ciudad, c.estado].filter(Boolean).join(', ') || null,
      ].filter((x): x is string => !!x);

      const nFilas = Math.max(v.detalles.length, lineasCliente.length);
      for (let i = 0; i < nFilas; i++) {
        const d = v.detalles[i];
        const primera = i === 0;
        filasVentas.push({
          __grupo: g,
          __anulada: v.estado === 'ANULADA',
          // La anulada no lleva color: así no parece una venta válida
          ...(primera && forma.fondo && v.estado === 'ACTIVA' ? { [fondoDe('formaPago')]: forma.fondo } : {}),
          fecha: primera ? v.fecha : null,
          cliente: lineasCliente[i] ?? null,
          codigo: d?.codigoProducto ?? null,
          producto: d?.nombreProducto ?? null,
          cantidad: d?.cantidad ?? null,
          precioUsd: d ? num(d.precioUnitUsd) : null,
          subtotalUsd: d ? num(d.subtotalUsd) : null,
          totalUsd: primera ? num(v.totalUsd) : null,
          tasa: primera ? num(v.tasaAplicada) : null,
          totalBs: primera ? num(v.totalBs) : null,
          formaPago: primera ? forma.texto + (v.estado === 'ANULADA' ? ' (ANULADA)' : '') : null,
          banco: primera ? cuentas.join(', ') || '-' : null,
          numero: primera ? v.numeroControl : null,
          pagadoUsd: primera ? num(v.pagadoUsd) : null,
          pagadoBs: primera ? num(v.pagadoBs) : null,
        });
      }
    });

    const totalUsd = sumar(activas.map((v) => v.totalUsd));
    const totalBs = sumar(activas.map((v) => v.totalBs));
    const pagadoUsd = sumar(activas.map((v) => v.pagadoUsd));
    const pagadoBs = sumar(activas.map((v) => v.pagadoBs));

    // ---------- Hoja 2: pagos ----------
    const filasPagos: Fila[] = [];
    ventas.forEach((v, g) =>
      v.pagos.forEach((pg) =>
        filasPagos.push({
          __grupo: g,
          __anulada: v.estado === 'ANULADA',
          fecha: v.fecha,
          numero: v.numeroControl,
          cliente: v.cliente.nombre,
          metodo: NOMBRE_METODO[pg.metodo],
          cuenta: pg.cuenta?.nombre ?? '-',
          referencia: pg.referencia,
          moneda: pg.moneda === 'USD' ? '$' : 'Bs',
          monto: num(pg.monto),
          montoBs: num(pg.montoBs),
          montoUsd: num(pg.montoUsd),
        }),
      ),
    );
    const pagosActivos = activas.flatMap((v) => v.pagos);

    // ---------- Hoja 3: productos vendidos ----------
    const porProducto = new Map<string, { codigo: string; nombre: string; categoria: string; unidades: number; total: Prisma.Decimal }>();
    for (const v of activas) {
      for (const d of v.detalles) {
        const actual = porProducto.get(d.codigoProducto) ?? {
          codigo: d.codigoProducto,
          nombre: d.nombreProducto,
          categoria: d.producto.categoria.nombre,
          unidades: 0,
          total: D(0),
        };
        actual.unidades += d.cantidad;
        actual.total = actual.total.plus(d.subtotalUsd);
        porProducto.set(d.codigoProducto, actual);
      }
    }
    const productos = [...porProducto.values()].sort((a, b) => b.unidades - a.unidades || a.codigo.localeCompare(b.codigo));

    // ---------- Resumen ----------
    const resumen = [
      { etiqueta: 'Ventas registradas', valor: `${activas.length}` + (ventas.length > activas.length ? ` (además ${ventas.length - activas.length} anulada/s, no suman)` : '') },
      { etiqueta: 'Total facturado', valor: `${usd(totalUsd)}  /  ${bs(totalBs)}` },
      { etiqueta: 'Total cobrado', valor: `${usd(pagadoUsd)}  /  ${bs(pagadoBs)}` },
      ...this.resumenPorMetodo(pagosActivos),
    ];

    return {
      ...this.base(p, u, `VENTAS DE LA TIENDA - ${p.etiqueta.toUpperCase()} - PRECIOS VALORADOS EN DÓLARES`, `ventas-${p.sufijo}`),
      fuentePdf: 6.5,
      resumen,
      hojas: [
        {
          nombre: 'Ventas',
          titulo: `VENTAS DE LA TIENDA - ${p.etiqueta.toUpperCase()} - PRECIOS VALORADOS EN DÓLARES`,
          columnas: columnasVentas,
          grupos: [{ titulo: 'TOTAL PAGADO', desde: 'pagadoUsd', hasta: 'pagadoBs' }],
          filas: filasVentas,
          totales: {
            producto: 'TOTAL (ventas activas)',
            cantidad: activas.reduce((s, v) => s + v.detalles.reduce((t, d) => t + d.cantidad, 0), 0),
            totalUsd: num(totalUsd),
            totalBs: num(totalBs),
            pagadoUsd: num(pagadoUsd),
            pagadoBs: num(pagadoBs),
          },
          nota: 'Precios valorados en dólares. Montos en Bs con el dólar del día de cada venta. Las ventas anuladas aparecen tachadas y no suman en los totales.',
        },
        {
          nombre: 'Pagos',
          titulo: 'Detalle de pagos',
          columnas: [
            { clave: 'fecha', titulo: 'Fecha', tipo: 'fechaHora' },
            { clave: 'numero', titulo: 'N° control', tipo: 'texto', ancho: 11 },
            { clave: 'cliente', titulo: 'Cliente', tipo: 'texto', ancho: 26, expandir: true },
            { clave: 'metodo', titulo: 'Forma de pago', tipo: 'texto', ancho: 14 },
            { clave: 'cuenta', titulo: 'Cuenta', tipo: 'texto', ancho: 20 },
            { clave: 'referencia', titulo: 'Referencia', tipo: 'texto', ancho: 14 },
            { clave: 'moneda', titulo: 'Moneda', tipo: 'texto', ancho: 8 },
            { clave: 'monto', titulo: 'Monto', tipo: 'bs' },
            { clave: 'montoBs', titulo: 'Equivalente Bs', tipo: 'bs' },
            { clave: 'montoUsd', titulo: 'Equivalente $', tipo: 'usd' },
          ],
          filas: filasPagos,
          totales: {
            cliente: 'TOTAL (ventas activas)',
            montoBs: num(sumar(pagosActivos.map((pg) => pg.montoBs))),
            montoUsd: num(pagadoUsd),
          },
        },
        {
          nombre: 'Productos vendidos',
          titulo: 'Productos vendidos en el período',
          columnas: [
            { clave: 'codigo', titulo: 'Código', tipo: 'texto', ancho: 12 },
            { clave: 'producto', titulo: 'Producto', tipo: 'texto', ancho: 36, expandir: true },
            { clave: 'categoria', titulo: 'Categoría', tipo: 'texto', ancho: 18 },
            { clave: 'unidades', titulo: 'Unidades', tipo: 'entero', ancho: 10 },
            { clave: 'totalUsd', titulo: 'Total $', tipo: 'usd' },
          ],
          filas: productos.map((x) => ({ codigo: x.codigo, producto: x.nombre, categoria: x.categoria, unidades: x.unidades, totalUsd: num(x.total) })),
          totales: {
            producto: 'TOTAL',
            unidades: productos.reduce((s, x) => s + x.unidades, 0),
            totalUsd: num(totalUsd),
          },
        },
      ],
    };
  }

  // ===================================================================== PAGOS / CUENTA
  /**
   * Formato de la hoja "PROVINCIAL JURÍDICO - ENERO 2026 - TIENDA":
   * una fila por producto vendido, el cliente apilado (nombre, CI, teléfono,
   * ciudad) y los pagos repartidos en columnas. Con cuentaId muestra solo las
   * ventas que tuvieron algún pago a esa cuenta.
   */
  async pagos(q: ReportePagosDto, u: UsuarioSesion): Promise<Reporte> {
    const p = resolverPeriodo(q);

    let nombreCuenta: string | null = null;
    if (q.cuentaId) {
      const cuenta = await this.prisma.cuentaBancaria.findUnique({ where: { id: q.cuentaId } });
      if (!cuenta) throw new NotFoundException('Cuenta bancaria no encontrada');
      nombreCuenta = cuenta.nombre;
    }

    const ventas = await this.prisma.venta.findMany({
      where: {
        fecha: p.rango,
        estado: 'ACTIVA',
        ...(q.cuentaId || q.metodo
          ? { pagos: { some: { ...(q.cuentaId ? { cuentaId: q.cuentaId } : {}), ...(q.metodo ? { metodo: q.metodo } : {}) } } }
          : {}),
      },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      include: {
        cliente: true,
        detalles: { orderBy: { id: 'asc' } },
        pagos: { orderBy: { id: 'asc' } },
      },
    });

    // Columna "PAGO MÓVIL Bs": lo que entró a la cuenta elegida; sin cuenta, todo lo bancario
    const esBancario = (pg: { metodo: MetodoPago; cuentaId: number | null }) =>
      q.cuentaId ? pg.cuentaId === q.cuentaId : pg.metodo !== 'EFECTIVO_BS' && pg.metodo !== 'EFECTIVO_USD';
    const bs = (d: Prisma.Decimal) => redondear2(d);

    const filas: Fila[] = [];
    const t = { pm: D(0), fact: D(0), factUsd: D(0), efBs: D(0), pagBs: D(0), pagBsUsd: D(0), efUsd: D(0), totalBs: D(0), totalUsd: D(0) };

    ventas.forEach((v, g) => {
      const bancarios = v.pagos.filter(esBancario);
      const pm = sumar(bancarios.map((pg) => pg.montoBs));
      const efBs = sumar(v.pagos.filter((pg) => pg.metodo === 'EFECTIVO_BS').map((pg) => pg.monto));
      const efUsd = sumar(v.pagos.filter((pg) => pg.metodo === 'EFECTIVO_USD').map((pg) => pg.monto));
      const pagadoBs = pm.plus(efBs); // "EF. Bs + PAGO MÓVIL"
      const referencias = bancarios.map((pg) => pg.referencia).filter(Boolean).join(', ');

      t.pm = t.pm.plus(pm);
      t.fact = t.fact.plus(v.totalBs);
      t.factUsd = t.factUsd.plus(v.totalUsd);
      t.efBs = t.efBs.plus(efBs);
      t.pagBs = t.pagBs.plus(pagadoBs);
      t.pagBsUsd = t.pagBsUsd.plus(redondear2(pagadoBs.div(v.tasaAplicada)));
      t.efUsd = t.efUsd.plus(efUsd);
      t.totalBs = t.totalBs.plus(v.pagadoBs);
      t.totalUsd = t.totalUsd.plus(v.pagadoUsd);

      // El cliente se apila en la columna CLIENTE, una línea por fila
      const c = v.cliente;
      const lineasCliente = [
        c.nombre,
        c.tipoDocumento && c.numeroDocumento ? `${c.tipoDocumento}- ${c.numeroDocumento.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : null,
        c.telefono,
        [c.ciudad, c.estado].filter(Boolean).join(', ') || null,
      ].filter((x): x is string => !!x);

      const nFilas = Math.max(v.detalles.length, lineasCliente.length);
      for (let i = 0; i < nFilas; i++) {
        const d = v.detalles[i];
        const primera = i === 0;
        filas.push({
          __grupo: g,
          fecha: primera ? v.fecha : null,
          tasa: primera ? num(v.tasaAplicada) : null,
          pm: primera && pm.gt(0) ? num(pm) : null,
          referencia: primera ? referencias || null : null,
          cliente: lineasCliente[i] ?? null,
          producto: d?.nombreProducto ?? null,
          cantidad: d?.cantidad ?? null,
          precioBs: d ? num(bs(d.precioUnitUsd.times(v.tasaAplicada))) : null,
          totalLineaBs: d ? num(bs(d.subtotalUsd.times(v.tasaAplicada))) : null,
          factBs: primera ? num(v.totalBs) : null,
          factUsd: primera ? num(v.totalUsd) : null,
          efBs: primera && efBs.gt(0) ? num(efBs) : null,
          pagadoBs: primera ? num(pagadoBs) : null,
          pagadoUsd: primera ? num(redondear2(pagadoBs.div(v.tasaAplicada))) : null,
          efUsd: primera && efUsd.gt(0) ? num(efUsd) : null,
          totalBs: primera ? num(v.pagadoBs) : null,
          totalUsd: primera ? num(v.pagadoUsd) : null,
          numero: primera ? v.numeroControl : null,
        });
      }
    });

    const encabezado = [nombreCuenta ?? 'PAGOS', p.etiqueta, 'TIENDA'].join(' - ').toUpperCase();
    const slug = (nombreCuenta ?? 'todas')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();

    return {
      ...this.base(p, u, encabezado, `pagos-${slug}-${p.sufijo}`),
      fuentePdf: 6,
      resumen: [
        { etiqueta: 'Ventas', valor: String(ventas.length) },
        { etiqueta: nombreCuenta ? `Entró a ${nombreCuenta}` : 'Pagos bancarios', valor: bs(t.pm).toFixed(2) === '0.00' ? '-' : `${fmtNumero(t.pm.toNumber(), 2)} Bs` },
        { etiqueta: 'Efectivo Bs', valor: `${fmtNumero(t.efBs.toNumber(), 2)} Bs` },
        { etiqueta: 'Efectivo $', valor: `${fmtNumero(t.efUsd.toNumber(), 2)} $` },
        { etiqueta: 'Total general', valor: `${fmtNumero(t.totalBs.toNumber(), 2)} Bs  /  ${fmtNumero(t.totalUsd.toNumber(), 2)} $` },
      ],
      hojas: [
        {
          nombre: nombreCuenta ?? 'Pagos',
          titulo: encabezado,
          columnas: [
            { clave: 'fecha', titulo: 'FECHA', tipo: 'fecha' },
            { clave: 'tasa', titulo: 'DÓLAR DEL DÍA', tipo: 'tasa', ancho: 9 },
            { clave: 'pm', titulo: 'PAGO MÓVIL Bs', tipo: 'bs', ancho: 12 },
            { clave: 'referencia', titulo: 'REF.', tipo: 'texto', ancho: 10 },
            { clave: 'cliente', titulo: 'CLIENTE', tipo: 'texto', ancho: 24 },
            { clave: 'producto', titulo: 'PRODUCTOS', tipo: 'texto', ancho: 36, expandir: true },
            { clave: 'cantidad', titulo: 'CANT.', tipo: 'entero', ancho: 6 },
            { clave: 'precioBs', titulo: 'PRECIO UD (Bs.)', tipo: 'bs', ancho: 11 },
            { clave: 'totalLineaBs', titulo: 'PRECIO TOTAL (Bs.)', tipo: 'bs', ancho: 11 },
            { clave: 'factBs', titulo: 'TOTAL FACT. (Bs)', tipo: 'bs', ancho: 12, negrita: true },
            { clave: 'factUsd', titulo: 'AL CAMBIO $', tipo: 'usd', ancho: 9, negrita: true },
            { clave: 'efBs', titulo: 'EF. Bs.', tipo: 'bs', ancho: 10 },
            { clave: 'pagadoBs', titulo: 'EF. Bs + PAGO MÓVIL', tipo: 'bs', ancho: 12 },
            { clave: 'pagadoUsd', titulo: 'AL CAMBIO $', tipo: 'usd', ancho: 9 },
            { clave: 'efUsd', titulo: 'EF. $', tipo: 'usd', ancho: 8 },
            { clave: 'totalBs', titulo: 'PAGO TOTAL Bs', tipo: 'bs', ancho: 12, negrita: true },
            { clave: 'totalUsd', titulo: 'PAGO TOTAL $', tipo: 'usd', ancho: 9, negrita: true },
            { clave: 'numero', titulo: 'N° CONTROL', tipo: 'texto', ancho: 11 },
          ],
          grupos: [
            { titulo: 'TOTAL FACTURADO', desde: 'factBs', hasta: 'factUsd' },
            { titulo: 'TOTAL PAGADO EN Bs.', desde: 'pagadoBs', hasta: 'pagadoUsd' },
            { titulo: 'TOTAL GENERAL', desde: 'totalBs', hasta: 'totalUsd' },
          ],
          filas,
          totales: {
            cliente: 'TOTAL',
            pm: num(t.pm),
            factBs: num(t.fact),
            factUsd: num(t.factUsd),
            efBs: num(t.efBs),
            pagadoBs: num(t.pagBs),
            pagadoUsd: num(t.pagBsUsd),
            efUsd: num(t.efUsd),
            totalBs: num(t.totalBs),
            totalUsd: num(t.totalUsd),
          },
          nota: nombreCuenta
            ? `PAGO MÓVIL Bs: lo que entró a ${nombreCuenta} (pago móvil, transferencia o tarjeta). Solo ventas activas con algún pago a esa cuenta.`
            : 'PAGO MÓVIL Bs: pagos bancarios (pago móvil, transferencia o tarjeta). Solo ventas activas.',
        },
      ],
    };
  }

  // ===================================================================== REGALOS
  async regalos(q: PeriodoReporteDto, u: UsuarioSesion): Promise<Reporte> {
    const p = resolverPeriodo(q);
    const regalos = await this.prisma.regalo.findMany({
      where: { fecha: p.rango },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      include: {
        usuario: { select: { nombre: true } },
        detalles: { orderBy: { id: 'asc' }, include: { producto: { select: { codigo: true, nombre: true } } } },
      },
    });

    const filas: Fila[] = [];
    regalos.forEach((r, g) =>
      r.detalles.forEach((d, i) => {
        const primera = i === 0;
        filas.push({
          __grupo: g,
          fecha: primera ? r.fecha : null,
          beneficiario: primera ? r.beneficiario : null,
          motivo: primera ? r.motivo : null,
          autorizadoPor: primera ? r.autorizadoPor : null,
          registradoPor: primera ? r.usuario.nombre : null,
          codigo: d.producto.codigo,
          producto: d.producto.nombre,
          cantidad: d.cantidad,
          valorUnitUsd: num(d.valorRefUsd),
          valorTotalUsd: num(d.valorRefUsd.times(d.cantidad)),
        });
      }),
    );

    const detalles = regalos.flatMap((r) => r.detalles);
    const unidades = detalles.reduce((s, d) => s + d.cantidad, 0);
    const valor = sumar(detalles.map((d) => d.valorRefUsd.times(d.cantidad)));

    return {
      ...this.base(p, u, 'Control de regalos', `regalos-${p.sufijo}`),
      resumen: [
        { etiqueta: 'Regalos entregados', valor: String(regalos.length) },
        { etiqueta: 'Unidades', valor: fmtNumero(unidades, 0) },
        { etiqueta: 'Valor (precio de venta del momento)', valor: usd(valor) },
      ],
      hojas: [
        {
          nombre: 'Regalos',
          titulo: 'Control de regalos',
          columnas: [
            { clave: 'fecha', titulo: 'Fecha', tipo: 'fechaHora' },
            { clave: 'beneficiario', titulo: 'Beneficiario', tipo: 'texto', ancho: 26, expandir: true },
            { clave: 'motivo', titulo: 'Motivo', tipo: 'texto', ancho: 30, expandir: true },
            { clave: 'autorizadoPor', titulo: 'Autorizado por', tipo: 'texto', ancho: 18 },
            { clave: 'registradoPor', titulo: 'Registrado por', tipo: 'texto', ancho: 16, pdf: false },
            { clave: 'codigo', titulo: 'Código', tipo: 'texto', ancho: 11 },
            { clave: 'producto', titulo: 'Producto', tipo: 'texto', ancho: 30, expandir: true },
            { clave: 'cantidad', titulo: 'Cant.', tipo: 'entero', ancho: 7 },
            { clave: 'valorUnitUsd', titulo: 'Valor unit. $', tipo: 'usd' },
            { clave: 'valorTotalUsd', titulo: 'Valor total $', tipo: 'usd' },
          ],
          filas,
          totales: { beneficiario: 'TOTAL', cantidad: unidades, valorTotalUsd: num(valor) },
        },
      ],
    };
  }

  // ===================================================================== TRASPASOS
  async traspasos(q: PeriodoReporteDto, u: UsuarioSesion): Promise<Reporte> {
    const p = resolverPeriodo(q);
    const traspasos = await this.prisma.traspaso.findMany({
      where: { fecha: p.rango },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      include: {
        usuario: { select: { nombre: true } },
        detalles: { orderBy: { id: 'asc' }, include: { producto: { select: { codigo: true, nombre: true } } } },
      },
    });

    const filas: Fila[] = [];
    traspasos.forEach((r, g) =>
      r.detalles.forEach((d, i) => {
        const primera = i === 0;
        filas.push({
          __grupo: g,
          fecha: primera ? r.fecha : null,
          departamento: primera ? r.departamento : null,
          hermanaEncargada: primera ? r.hermanaEncargada : null,
          autorizadoPor: primera ? r.autorizadoPor : null,
          registradoPor: primera ? r.usuario.nombre : null,
          codigo: d.producto.codigo,
          producto: d.producto.nombre,
          cantidad: d.cantidad,
          valorUnitUsd: num(d.valorRefUsd),
          valorTotalUsd: num(d.valorRefUsd.times(d.cantidad)),
        });
      }),
    );

    const detalles = traspasos.flatMap((r) => r.detalles);
    const unidades = detalles.reduce((s, d) => s + d.cantidad, 0);
    const valor = sumar(detalles.map((d) => d.valorRefUsd.times(d.cantidad)));

    return {
      ...this.base(p, u, 'Detalles de traspasos', `traspasos-${p.sufijo}`),
      resumen: [
        { etiqueta: 'Traspasos realizados', valor: String(traspasos.length) },
        { etiqueta: 'Unidades', valor: fmtNumero(unidades, 0) },
        { etiqueta: 'Valor (precio de venta del momento)', valor: usd(valor) },
      ],
      hojas: [
        {
          nombre: 'Traspasos',
          titulo: 'Detalles de traspasos',
          columnas: [
            { clave: 'fecha', titulo: 'Fecha', tipo: 'fechaHora' },
            { clave: 'departamento', titulo: 'Departamento de venta', tipo: 'texto', ancho: 26, expandir: true },
            { clave: 'hermanaEncargada', titulo: 'Hermana encargada', tipo: 'texto', ancho: 24, expandir: true },
            { clave: 'autorizadoPor', titulo: 'Autorizado por', tipo: 'texto', ancho: 18 },
            { clave: 'registradoPor', titulo: 'Registrado por', tipo: 'texto', ancho: 16, pdf: false },
            { clave: 'codigo', titulo: 'Código', tipo: 'texto', ancho: 11 },
            { clave: 'producto', titulo: 'Producto', tipo: 'texto', ancho: 30, expandir: true },
            { clave: 'cantidad', titulo: 'Cant.', tipo: 'entero', ancho: 7 },
            { clave: 'valorUnitUsd', titulo: 'Valor unit. $', tipo: 'usd' },
            { clave: 'valorTotalUsd', titulo: 'Valor total $', tipo: 'usd' },
          ],
          filas,
          totales: { departamento: 'TOTAL', cantidad: unidades, valorTotalUsd: num(valor) },
        },
      ],
    };
  }

  // ===================================================================== INVENTARIO
  /**
   * Movimiento de inventario del período por producto:
   * stock inicial + ingresos − ventas − regalos − traspasos ± ajustes = stock final.
   * Sale del kardex, así que puede consultarse para cualquier mes pasado.
   */
  async inventario(q: PeriodoReporteDto, u: UsuarioSesion): Promise<Reporte> {
    const p = resolverPeriodo(q);

    const [productos, saldosIniciales, saldosFinales, movimientos] = await Promise.all([
      this.prisma.producto.findMany({
        include: { categoria: { include: { padre: true } } },
      }),
      this.saldosAntesDe(p.rango.gte),
      this.saldosAntesDe(p.rango.lt),
      this.prisma.movimientoInventario.groupBy({
        by: ['productoId', 'tipo'],
        where: { fecha: p.rango },
        _sum: { cantidad: true },
      }),
    ]);

    const movs = new Map<number, Record<string, number>>();
    for (const m of movimientos) {
      const actual = movs.get(m.productoId) ?? {};
      actual[m.tipo] = m._sum.cantidad ?? 0;
      movs.set(m.productoId, actual);
    }

    const ordenados = [...productos].sort((a, b) => {
      const ka = [a.categoria.padre?.orden ?? a.categoria.orden, a.categoria.padre ? a.categoria.orden : -1];
      const kb = [b.categoria.padre?.orden ?? b.categoria.orden, b.categoria.padre ? b.categoria.orden : -1];
      return ka[0] - kb[0] || ka[1] - kb[1] || a.nombre.localeCompare(b.nombre, 'es');
    });

    let descuadres = 0;
    let unidadesFinales = 0;
    let valorFinal = D(0);
    let stockBajo = 0;
    const filas: Fila[] = [];

    for (const prod of ordenados) {
      const m = movs.get(prod.id) ?? {};
      const inicial = saldosIniciales.get(prod.id) ?? 0;
      const final = saldosFinales.get(prod.id) ?? 0;
      const ingresos = m.INGRESO ?? 0;
      const ventas = -((m.VENTA ?? 0) + (m.ANULACION_VENTA ?? 0)); // ventas netas de anulaciones
      const regalos = -(m.REGALO ?? 0);
      const traspasos = -(m.TRASPASO_SALIDA ?? 0);
      const ajustes = m.AJUSTE ?? 0;
      const huboMovimiento = Object.keys(m).length > 0;

      // Productos inactivos sin stock ni movimiento no aportan nada al reporte
      if (!prod.activo && inicial === 0 && final === 0 && !huboMovimiento) continue;

      if (inicial + ingresos - ventas - regalos - traspasos + ajustes !== final) descuadres++;
      const valor = prod.precioUsd.times(final);
      unidadesFinales += final;
      valorFinal = valorFinal.plus(valor);
      const bajo = prod.stockMinimo !== null && final <= prod.stockMinimo;
      if (bajo && prod.activo) stockBajo++;

      filas.push({
        codigo: prod.codigo,
        producto: prod.nombre + (prod.activo ? '' : ' (inactivo)'),
        // Solo la categoría del producto (Pasta, Galletas...), sin la principal
        categoria: prod.categoria.nombre,
        precioUsd: num(prod.precioUsd),
        inicial,
        ingresos,
        ventas,
        regalos,
        traspasos,
        ajustes,
        final,
        valorUsd: num(valor),
        minimo: prod.stockMinimo,
        alerta: bajo && prod.activo ? 'STOCK BAJO' : null,
      });
    }

    const resumen = [
      { etiqueta: 'Productos', valor: String(filas.length) },
      { etiqueta: 'Unidades en stock al cierre', valor: fmtNumero(unidadesFinales, 0) },
      { etiqueta: 'Valor del inventario al cierre', valor: `${usd(valorFinal)} (a precios actuales)` },
      { etiqueta: 'Productos en stock bajo', valor: String(stockBajo) },
    ];
    if (descuadres > 0) {
      resumen.push({
        etiqueta: 'ATENCIÓN',
        valor: `${descuadres} producto(s) no cuadran (inicial + movimientos ≠ final). Revisa su kardex.`,
      });
    }

    return {
      ...this.base(p, u, 'Inventario', `inventario-${p.sufijo}`),
      resumen,
      hojas: [
        {
          nombre: 'Inventario',
          titulo: 'Movimiento de inventario por producto',
          columnas: [
            { clave: 'codigo', titulo: 'Código', tipo: 'texto', ancho: 11 },
            { clave: 'producto', titulo: 'Producto', tipo: 'texto', ancho: 32, expandir: true },
            { clave: 'categoria', titulo: 'Categoría', tipo: 'texto', ancho: 16 },
            { clave: 'precioUsd', titulo: 'Precio $', tipo: 'usd' },
            { clave: 'inicial', titulo: 'Stock inicial', tipo: 'entero', ancho: 10 },
            { clave: 'ingresos', titulo: 'Ingresos', tipo: 'entero', ancho: 10 },
            { clave: 'ventas', titulo: 'Ventas', tipo: 'entero', ancho: 10 },
            { clave: 'regalos', titulo: 'Regalos', tipo: 'entero', ancho: 10 },
            { clave: 'traspasos', titulo: 'Traspasos', tipo: 'entero', ancho: 10 },
            { clave: 'ajustes', titulo: 'Ajustes (+/-)', tipo: 'entero', ancho: 10 },
            { clave: 'final', titulo: 'Stock final', tipo: 'entero', ancho: 10 },
            { clave: 'valorUsd', titulo: 'Valor $', tipo: 'usd' },
            { clave: 'minimo', titulo: 'Mínimo', tipo: 'entero', ancho: 9, pdf: false },
            { clave: 'alerta', titulo: 'Alerta', tipo: 'texto', ancho: 12 },
          ],
          filas,
          totales: {
            producto: 'TOTAL',
            inicial: filas.reduce((s, f) => s + (f.inicial as number), 0),
            ingresos: filas.reduce((s, f) => s + (f.ingresos as number), 0),
            ventas: filas.reduce((s, f) => s + (f.ventas as number), 0),
            regalos: filas.reduce((s, f) => s + (f.regalos as number), 0),
            traspasos: filas.reduce((s, f) => s + (f.traspasos as number), 0),
            ajustes: filas.reduce((s, f) => s + (f.ajustes as number), 0),
            final: unidadesFinales,
            valorUsd: num(valorFinal),
          },
          nota: 'Ventas netas de anulaciones. El valor se calcula con el precio de venta actual de cada producto.',
        },
      ],
    };
  }

  /** Stock de cada producto justo antes de un instante, leído del último saldo del kardex. */
  private async saldosAntesDe(instante: Date): Promise<Map<number, number>> {
    // El instante se pasa como texto ISO con zona (Z) y se convierte explícitamente,
    // para no depender de la zona horaria configurada en PostgreSQL
    const filas = await this.prisma.$queryRaw<{ producto_id: number; saldo: number }[]>`
      SELECT producto_id, SUM(saldo_resultante)::int AS saldo
      FROM (
        SELECT DISTINCT ON (producto_id, ubicacion_id) producto_id, saldo_resultante
        FROM movimientos_inventario
        WHERE fecha < ${instante.toISOString()}::timestamptz
        ORDER BY producto_id, ubicacion_id, id DESC
      ) ultimos
      GROUP BY producto_id`;
    return new Map(filas.map((f) => [f.producto_id, f.saldo]));
  }

  private resumenPorMetodo(pagos: { metodo: MetodoPago; montoBs: Prisma.Decimal; montoUsd: Prisma.Decimal }[]) {
    const grupos = new Map<MetodoPago, { n: number; bs: Prisma.Decimal; usd: Prisma.Decimal }>();
    for (const pg of pagos) {
      const g = grupos.get(pg.metodo) ?? { n: 0, bs: D(0), usd: D(0) };
      g.n++;
      g.bs = g.bs.plus(pg.montoBs);
      g.usd = g.usd.plus(pg.montoUsd);
      grupos.set(pg.metodo, g);
    }
    return [...grupos.entries()].map(([metodo, g]) => ({
      etiqueta: `   ${NOMBRE_METODO[metodo]}`,
      valor: `${bs(g.bs)}  (${usd(g.usd)}) — ${g.n} pago${g.n === 1 ? '' : 's'}`,
    }));
  }
}
