import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetodoPago, Moneda, Prisma } from '@prisma/client';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { D, desdeNumero, redondear2, sumar } from '../common/dinero.js';
import { fechaHoyNegocio, rangoDiasNegocio } from '../common/fecha.util.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasasService } from '../tasas/tasas.service.js';
import { AnularVentaDto } from './dto/anular-venta.dto.js';
import { ListarVentasDto } from './dto/listar-ventas.dto.js';
import { CotizarVentaDto, PagoVentaDto, RegistrarVentaDto } from './dto/registrar-venta.dto.js';

export const INCLUIR_VENTA = {
  cliente: true,
  usuario: { select: { nombre: true } },
  anuladaPor: { select: { nombre: true } },
  detalles: { orderBy: { id: 'asc' } },
  pagos: {
    orderBy: { id: 'asc' },
    include: { cuenta: { select: { id: true, nombre: true, banco: true } } },
  },
} satisfies Prisma.VentaInclude;

export type VentaCompleta = Prisma.VentaGetPayload<{ include: typeof INCLUIR_VENTA }>;

const METODOS_EFECTIVO: MetodoPago[] = ['EFECTIVO_BS', 'EFECTIVO_USD'];

const NOMBRE_METODO: Record<MetodoPago, string> = {
  TARJETA: 'pago con tarjeta',
  PAGO_MOVIL: 'pago móvil',
  TRANSFERENCIA: 'transferencia',
  EFECTIVO_BS: 'efectivo en Bs',
  EFECTIVO_USD: 'efectivo en $',
};

const OPCIONES_TX = { timeout: 20_000 };

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tasas: TasasService,
    private readonly inventario: InventarioService,
    private readonly clientes: ClientesService,
  ) {}

  // =================================================================== registrar

  /**
   * Registra una venta completa en UNA transacción:
   * N° de control + cliente + detalle + pagos + salida de stock.
   * Si algo falla (stock, pago insuficiente...), no queda nada a medias
   * y el correlativo no se consume.
   */
  async registrar(dto: RegistrarVentaDto, actor: UsuarioSesion) {
    // 1. Tasa vigente (máx. TASA_MAX_DIAS de antigüedad)
    const { bsPorUsd: tasa } = await this.tasas.obtenerParaVenta();
    if (dto.tasaEsperada && !D(dto.tasaEsperada).equals(tasa)) {
      throw new ConflictException({
        message: `La tasa cambió a ${tasa.toString()} Bs/$ mientras se registraba la venta. Revisa los montos.`,
        tasaActual: tasa.toString(),
      });
    }

    // 2. Validaciones que no requieren base de datos
    const lineasPedidas = this.agruparLineas(dto.detalles);
    this.validarEstructuraPagos(dto.pagos);

    const ventaId = await this.prisma.$transaction(async (tx) => {
      // 3. Productos y precios ACTUALES (nunca se confía en precios del cliente)
      const lineas = await this.prepararLineas(tx, lineasPedidas);

      const totalUsd = sumar(lineas.map((l) => l.subtotal));
      const totalBs = redondear2(totalUsd.times(tasa));

      if (dto.totalUsdEsperado && !D(dto.totalUsdEsperado).equals(totalUsd)) {
        throw new ConflictException({
          message: `Los precios cambiaron: el total ahora es ${totalUsd.toFixed(2)} $. Revisa la venta.`,
          totalUsdActual: totalUsd.toFixed(2),
        });
      }

      // 4. Pagos: cuentas válidas y montos convertidos con la tasa de la venta
      await this.validarCuentas(tx, dto.pagos);
      const pagos = dto.pagos.map((p) => this.calcularPago(p, tasa));
      const pagadoBs = sumar(pagos.map((p) => p.montoBs));
      // El total en $ se deriva del total en Bs (cifra exacta de la caja), no de
      // sumar dólares ya redondeados por separado (eso acumula errores de 0,01)
      const pagadoUsd = redondear2(pagadoBs.div(tasa));
      this.validarMontoPagado(totalBs, pagadoBs, tasa, pagos.length);

      // 5. Cliente, ubicación y N° de control
      const clienteId = await this.clientes.resolverParaVenta(tx, dto.cliente);
      const ubicacionId = await this.inventario.ubicacionPrincipalId(tx);
      const numeroControl = await this.siguienteNumeroControl(tx);

      // 6. Venta con su detalle y pagos
      const venta = await tx.venta.create({
        data: {
          numeroControl,
          clienteId,
          ubicacionId,
          tasaAplicada: tasa,
          totalUsd,
          totalBs,
          pagadoUsd,
          pagadoBs,
          usuarioId: actor.id,
          detalles: {
            create: lineas.map((l) => ({
              productoId: l.producto.id,
              codigoProducto: l.producto.codigo,
              nombreProducto: l.producto.nombre,
              cantidad: l.cantidad,
              precioUnitUsd: l.producto.precioUsd,
              subtotalUsd: l.subtotal,
              // Copias al vender: el departamento de la máquina fiscal (voz del producto o de
              // su categoría) y si el producto lleva IVA (casilla "Aplica IVA" del producto)
              vozFiscal: (l.producto.vozFiscal ?? l.producto.categoria.vozFiscal)?.nombre ?? null,
              exentoIva: !l.producto.aplicaIva,
            })),
          },
          pagos: {
            create: pagos.map((p) => ({
              metodo: p.metodo,
              moneda: p.moneda,
              monto: p.monto,
              montoUsd: p.montoUsd,
              montoBs: p.montoBs,
              cuentaId: p.cuentaId ?? null,
              referencia: p.referencia || null,
            })),
          },
        },
      });

      // 7. Salida de stock (orden por productoId para evitar bloqueos cruzados)
      for (const l of [...lineas].sort((a, b) => a.producto.id - b.producto.id)) {
        await this.inventario.registrarMovimiento(tx, {
          productoId: l.producto.id,
          ubicacionId,
          tipo: 'VENTA',
          cantidad: -l.cantidad,
          ventaId: venta.id,
          usuarioId: actor.id,
        });
      }

      return venta.id;
    }, OPCIONES_TX);

    return this.obtener(ventaId, actor);
  }

  // =================================================================== cotizar

  /**
   * Calcula la venta SIN guardar nada, con la misma lógica que registrar():
   * totales en $ y Bs, stock disponible y, si se envían pagos, cuánto falta
   * o sobra. Devuelve tasaEsperada y totalUsdEsperado para enviarlos luego
   * al registrar (así se detecta si algo cambió entre cotizar y cobrar).
   */
  async cotizar(dto: CotizarVentaDto) {
    const { bsPorUsd: tasa, fecha: fechaTasa } = await this.tasas.obtenerParaVenta();
    const lineas = await this.prepararLineas(this.prisma, this.agruparLineas(dto.detalles));

    const existencias = await this.prisma.existencia.findMany({
      where: { productoId: { in: lineas.map((l) => l.producto.id) } },
    });
    const stockPorId = new Map<number, number>();
    for (const e of existencias) stockPorId.set(e.productoId, (stockPorId.get(e.productoId) ?? 0) + e.cantidad);

    const totalUsd = sumar(lineas.map((l) => l.subtotal));
    const totalBs = redondear2(totalUsd.times(tasa));

    const lineasRespuesta = lineas.map((l) => {
      const stock = stockPorId.get(l.producto.id) ?? 0;
      return {
        productoId: l.producto.id,
        codigo: l.producto.codigo,
        nombre: l.producto.nombre,
        cantidad: l.cantidad,
        precioUnitUsd: l.producto.precioUsd.toFixed(2),
        precioUnitBs: redondear2(l.producto.precioUsd.times(tasa)).toFixed(2),
        subtotalUsd: l.subtotal.toFixed(2),
        subtotalBs: redondear2(l.subtotal.times(tasa)).toFixed(2),
        stockDisponible: stock,
        stockSuficiente: stock >= l.cantidad,
      };
    });

    let pago = null;
    if (dto.pagos && dto.pagos.length > 0) {
      const pagos = dto.pagos.map((p) => this.calcularPago(p, tasa));
      const pagadoBs = sumar(pagos.map((p) => p.montoBs));
      // El total en $ se deriva del total en Bs (cifra exacta de la caja), no de
      // sumar dólares ya redondeados por separado (eso acumula errores de 0,01)
      const pagadoUsd = redondear2(pagadoBs.div(tasa));
      const evaluacion = this.evaluarPago(totalBs, pagadoBs, tasa, pagos.length);
      pago = {
        estado: evaluacion.estado,
        mensaje: evaluacion.mensaje,
        pagadoUsd: pagadoUsd.toFixed(2),
        pagadoBs: pagadoBs.toFixed(2),
        diferenciaBs: evaluacion.diferenciaBs.toFixed(2),
        diferenciaUsd: redondear2(evaluacion.diferenciaBs.div(tasa)).toFixed(2),
        detalle: pagos.map((p) => ({
          metodo: p.metodo,
          moneda: p.moneda,
          monto: p.monto.toFixed(2),
          montoUsd: p.montoUsd.toFixed(2),
          montoBs: p.montoBs.toFixed(2),
        })),
      };
    }

    return {
      tasa: tasa.toString(),
      fechaTasa,
      lineas: lineasRespuesta,
      totalUsd: totalUsd.toFixed(2),
      totalBs: totalBs.toFixed(2),
      stockSuficiente: lineasRespuesta.every((l) => l.stockSuficiente),
      pago,
      // Para enviar tal cual al registrar la venta
      tasaEsperada: tasa.toString(),
      totalUsdEsperado: totalUsd.toFixed(2),
    };
  }

  // =================================================================== anular

  /**
   * Anula una venta: la marca ANULADA y devuelve el stock. La venta y sus
   * pagos NO se borran (quedan en el historial); los reportes la excluyen.
   */
  async anular(id: number, dto: AnularVentaDto, actor: UsuarioSesion) {
    await this.prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findUnique({ where: { id }, include: { detalles: true } });
      if (!venta) throw new NotFoundException('Venta no encontrada');

      // UPDATE condicionado: si dos personas anulan a la vez, solo una lo logra
      const resultado = await tx.venta.updateMany({
        where: { id, estado: 'ACTIVA' },
        data: { estado: 'ANULADA', anuladaEn: new Date(), anuladaPorId: actor.id, motivoAnulacion: dto.motivo },
      });
      if (resultado.count === 0) throw new ConflictException(`La venta ${venta.numeroControl} ya estaba anulada`);

      for (const d of [...venta.detalles].sort((a, b) => a.productoId - b.productoId)) {
        await this.inventario.registrarMovimiento(tx, {
          productoId: d.productoId,
          ubicacionId: venta.ubicacionId,
          tipo: 'ANULACION_VENTA',
          cantidad: d.cantidad,
          ventaId: venta.id,
          usuarioId: actor.id,
        });
      }

      await tx.auditoria.create({
        data: {
          tabla: 'ventas',
          registroId: String(venta.id),
          accion: 'ANULAR',
          datosAntes: { estado: 'ACTIVA', numeroControl: venta.numeroControl, totalUsd: venta.totalUsd.toString() },
          datosDespues: { estado: 'ANULADA', motivo: dto.motivo },
          usuarioId: actor.id,
        },
      });
    }, OPCIONES_TX);

    return this.obtener(id);
  }

  // =================================================================== consultas

  /**
   * Un VENDEDOR solo ve sus propias ventas. Si pide una ajena se responde
   * "no encontrada" (no se revela que existe). Sin actor = uso interno.
   */
  private soloPropias(actor?: UsuarioSesion): Prisma.VentaWhereInput {
    return actor?.rol === 'VENDEDOR' ? { usuarioId: actor.id } : {};
  }

  async obtener(id: number, actor?: UsuarioSesion) {
    const venta = await this.prisma.venta.findFirst({ where: { id, ...this.soloPropias(actor) }, include: INCLUIR_VENTA });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    return this.mapear(venta);
  }

  /** Venta con todos sus datos, para generar la factura en PDF. */
  async paraFactura(id: number, actor?: UsuarioSesion): Promise<VentaCompleta> {
    const venta = await this.prisma.venta.findFirst({ where: { id, ...this.soloPropias(actor) }, include: INCLUIR_VENTA });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    return venta;
  }

  async porNumeroControl(numeroControl: string, actor?: UsuarioSesion) {
    const venta = await this.prisma.venta.findFirst({ where: { numeroControl, ...this.soloPropias(actor) }, include: INCLUIR_VENTA });
    if (!venta) throw new NotFoundException(`No existe la venta N° ${numeroControl}`);
    return this.mapear(venta);
  }

  async listar(q: ListarVentasDto, actor?: UsuarioSesion) {
    const condiciones: Prisma.VentaWhereInput[] = [this.soloPropias(actor)];
    const rango = rangoDiasNegocio(q.desde, q.hasta);
    if (rango) condiciones.push({ fecha: rango });
    if (q.clienteId) condiciones.push({ clienteId: q.clienteId });
    if (q.buscar) {
      const digitos = q.buscar.replace(/\D/g, '');
      condiciones.push({
        OR: [
          ...(digitos ? [{ numeroControl: { contains: digitos } }] : []),
          { cliente: { nombre: { contains: q.buscar, mode: 'insensitive' } } },
          ...(digitos ? [{ cliente: { numeroDocumento: { contains: digitos } } }] : []),
        ],
      });
    }
    const whereBase: Prisma.VentaWhereInput = { AND: condiciones };
    const where: Prisma.VentaWhereInput = q.estado ? { AND: [...condiciones, { estado: q.estado }] } : whereBase;

    const [total, ventas, totales] = await this.prisma.$transaction([
      this.prisma.venta.count({ where }),
      this.prisma.venta.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
        include: INCLUIR_VENTA,
      }),
      // Totales del período: SOLO ventas activas (las anuladas no suman)
      this.prisma.venta.aggregate({
        where: { AND: [...condiciones, { estado: 'ACTIVA' }] },
        _count: true,
        _sum: { totalUsd: true, totalBs: true, pagadoUsd: true, pagadoBs: true },
      }),
    ]);

    return {
      datos: ventas.map((v) => this.mapearResumen(v)),
      total,
      pagina: q.pagina,
      porPagina: q.porPagina,
      resumen: {
        ventasActivas: totales._count,
        totalUsd: (totales._sum.totalUsd ?? D(0)).toFixed(2),
        totalBs: (totales._sum.totalBs ?? D(0)).toFixed(2),
        pagadoUsd: (totales._sum.pagadoUsd ?? D(0)).toFixed(2),
        pagadoBs: (totales._sum.pagadoBs ?? D(0)).toFixed(2),
      },
    };
  }

  // =================================================================== reglas internas

  /** Suma cantidades si el mismo producto aparece varias veces. */
  private agruparLineas(detalles: { productoId: number; cantidad: number }[]) {
    const mapa = new Map<number, number>();
    for (const d of detalles) mapa.set(d.productoId, (mapa.get(d.productoId) ?? 0) + d.cantidad);
    return [...mapa.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad }));
  }

  private validarEstructuraPagos(pagos: PagoVentaDto[]) {
    pagos.forEach((p, i) => {
      const etiqueta = pagos.length > 1 ? `Pago ${i + 1} (${NOMBRE_METODO[p.metodo]})` : 'El pago';
      const esEfectivo = METODOS_EFECTIVO.includes(p.metodo);
      if (esEfectivo && p.cuentaId) {
        throw new BadRequestException(`${etiqueta}: el efectivo no lleva cuenta bancaria`);
      }
      if (!esEfectivo && !p.cuentaId) {
        throw new BadRequestException(`${etiqueta}: indica la cuenta bancaria donde entró el ${NOMBRE_METODO[p.metodo]}`);
      }
    });
  }

  private async validarCuentas(tx: Prisma.TransactionClient, pagos: PagoVentaDto[]) {
    const ids = [...new Set(pagos.map((p) => p.cuentaId).filter((id): id is number => id !== undefined))];
    if (ids.length === 0) return;
    const cuentas = await tx.cuentaBancaria.findMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      const cuenta = cuentas.find((c) => c.id === id);
      if (!cuenta) throw new BadRequestException(`La cuenta bancaria ${id} no existe`);
      if (!cuenta.activo) throw new BadRequestException(`La cuenta "${cuenta.nombre}" está inactiva`);
    }
  }

  /** Convierte cada pago a $ y Bs con la tasa de la venta. */
  private calcularPago(p: PagoVentaDto, tasa: Prisma.Decimal) {
    const moneda: Moneda = p.metodo === 'EFECTIVO_USD' ? 'USD' : 'BS';
    const monto = desdeNumero(p.monto);
    return {
      metodo: p.metodo,
      moneda,
      monto,
      montoUsd: moneda === 'USD' ? monto : redondear2(monto.div(tasa)),
      montoBs: moneda === 'BS' ? monto : redondear2(monto.times(tasa)),
      cuentaId: p.cuentaId,
      referencia: p.referencia,
    };
  }

  /**
   * El total se compara en Bs (moneda en que se cuadra la caja).
   * - Falta dinero → INCOMPLETO, indicando cuánto falta.
   * - Sobra un poco (redondeo del efectivo, como 15,02 $ por 15,00 $) → COMPLETO.
   * - Sobra mucho → EXCEDIDO: probablemente un error de tipeo o vuelto no descontado.
   */
  private evaluarPago(totalBs: Prisma.Decimal, pagadoBs: Prisma.Decimal, tasa: Prisma.Decimal, nPagos: number) {
    const toleranciaRedondeo = D('0.01').times(nPagos);
    const diferencia = pagadoBs.minus(totalBs);

    if (diferencia.plus(toleranciaRedondeo).lt(0)) {
      const faltaBs = diferencia.negated();
      return {
        estado: 'INCOMPLETO' as const,
        diferenciaBs: diferencia,
        mensaje: `Pago incompleto: faltan ${faltaBs.toFixed(2)} Bs (${redondear2(faltaBs.div(tasa)).toFixed(2)} $)`,
      };
    }

    const pctMaximo = D(this.config.get<string>('VENTA_MAX_SOBRANTE_PCT', '0.05'));
    const sobranteMaximo = Prisma.Decimal.max(totalBs.times(pctMaximo), tasa.times('0.10'));
    if (diferencia.gt(sobranteMaximo)) {
      return {
        estado: 'EXCEDIDO' as const,
        diferenciaBs: diferencia,
        mensaje:
          `El pago supera el total por ${diferencia.toFixed(2)} Bs. ` +
          'Registra solo el monto que queda en caja (descuenta el vuelto) o revisa si hay un error de tipeo.',
      };
    }

    return { estado: 'COMPLETO' as const, diferenciaBs: diferencia, mensaje: null };
  }

  private validarMontoPagado(totalBs: Prisma.Decimal, pagadoBs: Prisma.Decimal, tasa: Prisma.Decimal, nPagos: number) {
    const evaluacion = this.evaluarPago(totalBs, pagadoBs, tasa, nPagos);
    if (evaluacion.estado !== 'COMPLETO') throw new BadRequestException(evaluacion.mensaje);
  }

  /** Productos con su precio ACTUAL. Lo usan la venta y la cotización. */
  private async prepararLineas(
    cliente: PrismaService | Prisma.TransactionClient,
    pedidas: { productoId: number; cantidad: number }[],
  ) {
    const productos = await cliente.producto.findMany({
      where: { id: { in: pedidas.map((l) => l.productoId) } },
      include: { vozFiscal: true, categoria: { include: { vozFiscal: true } } },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));

    return pedidas.map((l) => {
      const p = porId.get(l.productoId);
      if (!p) throw new BadRequestException(`El producto ${l.productoId} no existe`);
      if (!p.activo) throw new BadRequestException(`${p.codigo} (${p.nombre}) está inactivo`);
      return { producto: p, cantidad: l.cantidad, subtotal: p.precioUsd.times(l.cantidad) };
    });
  }

  /**
   * Siguiente N° de control del año (AAAA + 4 dígitos), atómico y sin huecos:
   * el incremento es parte de la transacción, si la venta falla se revierte.
   */
  private async siguienteNumeroControl(tx: Prisma.TransactionClient): Promise<string> {
    const anio = Number(fechaHoyNegocio().slice(0, 4));
    const [fila] = await tx.$queryRaw<{ ultimo_numero: number }[]>`
      INSERT INTO correlativos (anio, ultimo_numero) VALUES (${anio}, 1)
      ON CONFLICT (anio) DO UPDATE SET ultimo_numero = correlativos.ultimo_numero + 1
      RETURNING ultimo_numero`;
    return `${anio}${String(fila.ultimo_numero).padStart(4, '0')}`;
  }

  // =================================================================== respuesta

  private formaPago(v: VentaCompleta): string {
    return v.pagos.length > 1 ? 'MIXTA' : (v.pagos[0]?.metodo ?? '-');
  }

  private mapearResumen(v: VentaCompleta) {
    return {
      id: v.id,
      numeroControl: v.numeroControl,
      fecha: v.fecha,
      estado: v.estado,
      cliente: this.clientes.mapear(v.cliente),
      totalUsd: v.totalUsd.toFixed(2),
      totalBs: v.totalBs.toFixed(2),
      pagadoUsd: v.pagadoUsd.toFixed(2),
      pagadoBs: v.pagadoBs.toFixed(2),
      tasa: v.tasaAplicada.toString(),
      formaPago: this.formaPago(v),
      productos: v.detalles.length,
      unidades: v.detalles.reduce((s, d) => s + d.cantidad, 0),
      vendedor: v.usuario.nombre,
    };
  }

  private mapear(v: VentaCompleta) {
    const tasa = v.tasaAplicada;
    return {
      ...this.mapearResumen(v),
      diferenciaUsd: v.pagadoUsd.minus(v.totalUsd).toFixed(2),
      diferenciaBs: v.pagadoBs.minus(v.totalBs).toFixed(2),
      detalles: v.detalles.map((d) => ({
        productoId: d.productoId,
        codigo: d.codigoProducto,
        nombre: d.nombreProducto,
        cantidad: d.cantidad,
        precioUnitUsd: d.precioUnitUsd.toFixed(2),
        precioUnitBs: redondear2(d.precioUnitUsd.times(tasa)).toFixed(2),
        subtotalUsd: d.subtotalUsd.toFixed(2),
        subtotalBs: redondear2(d.subtotalUsd.times(tasa)).toFixed(2),
      })),
      pagos: v.pagos.map((p) => ({
        metodo: p.metodo,
        moneda: p.moneda,
        monto: p.monto.toFixed(2),
        montoUsd: p.montoUsd.toFixed(2),
        montoBs: p.montoBs.toFixed(2),
        cuenta: p.cuenta,
        referencia: p.referencia,
      })),
      anulacion:
        v.estado === 'ANULADA'
          ? { motivo: v.motivoAnulacion, por: v.anuladaPor?.nombre ?? null, en: v.anuladaEn }
          : null,
    };
  }
}
