import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TipoMovimiento } from '@prisma/client';
import { rangoDiasNegocio } from '../common/fecha.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AjusteInventarioDto } from './dto/ajuste-inventario.dto.js';
import { KardexDto } from './dto/kardex.dto.js';

/** Nombre de la ubicación única mientras no existan traspasos. */
export const UBICACION_PRINCIPAL = 'Tienda';

export interface MovimientoNuevo {
  productoId: number;
  ubicacionId: number;
  tipo: TipoMovimiento;
  /** Positiva = entra, negativa = sale */
  cantidad: number;
  usuarioId: number;
  ventaId?: number;
  ingresoId?: number;
  regaloId?: number;
  nota?: string;
}

/**
 * ÚNICO punto por donde cambia el stock. Ingresos, ventas, regalos y ajustes
 * llaman a registrarMovimiento() dentro de su propia transacción, así:
 *  - existencias y kardex nunca se desincronizan (misma transacción),
 *  - dos operaciones simultáneas sobre el mismo producto se ordenan
 *    (bloqueo de fila con SELECT ... FOR UPDATE),
 *  - el stock nunca queda negativo.
 */
@Injectable()
export class InventarioService {
  private ubicacionPrincipalCache: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async ubicacionPrincipalId(cliente: PrismaService | Prisma.TransactionClient = this.prisma): Promise<number> {
    if (this.ubicacionPrincipalCache !== null) return this.ubicacionPrincipalCache;
    const ubicacion = await cliente.ubicacion.findUnique({ where: { nombre: UBICACION_PRINCIPAL } });
    if (!ubicacion) {
      throw new Error(`No existe la ubicación "${UBICACION_PRINCIPAL}". Ejecuta el seed (npx prisma db seed).`);
    }
    this.ubicacionPrincipalCache = ubicacion.id;
    return ubicacion.id;
  }

  /**
   * Bloquea la fila de existencias del producto hasta que termine la
   * transacción y devuelve la cantidad actual (la crea en 0 si no existe).
   */
  async bloquearExistencia(tx: Prisma.TransactionClient, productoId: number, ubicacionId: number): Promise<number> {
    await tx.$executeRaw`
      INSERT INTO existencias (producto_id, ubicacion_id, cantidad)
      VALUES (${productoId}, ${ubicacionId}, 0)
      ON CONFLICT (producto_id, ubicacion_id) DO NOTHING`;
    const filas = await tx.$queryRaw<{ cantidad: number }[]>`
      SELECT cantidad FROM existencias
      WHERE producto_id = ${productoId} AND ubicacion_id = ${ubicacionId}
      FOR UPDATE`;
    return filas[0].cantidad;
  }

  /**
   * Registra un movimiento y actualiza existencias. Debe llamarse dentro de
   * una transacción. Si hay varios productos, llamarlo en orden de productoId
   * para evitar bloqueos cruzados (deadlocks).
   */
  async registrarMovimiento(tx: Prisma.TransactionClient, m: MovimientoNuevo) {
    if (m.cantidad === 0) throw new Error('Un movimiento no puede tener cantidad 0');

    const actual = await this.bloquearExistencia(tx, m.productoId, m.ubicacionId);
    const saldo = actual + m.cantidad;

    if (saldo < 0) {
      const p = await tx.producto.findUnique({ where: { id: m.productoId }, select: { codigo: true, nombre: true } });
      throw new BadRequestException(
        `Stock insuficiente de ${p?.codigo ?? m.productoId} (${p?.nombre ?? ''}): ` +
          `hay ${actual} y se necesitan ${-m.cantidad}`,
      );
    }

    await tx.existencia.update({
      where: { productoId_ubicacionId: { productoId: m.productoId, ubicacionId: m.ubicacionId } },
      data: { cantidad: saldo },
    });

    return tx.movimientoInventario.create({
      data: {
        productoId: m.productoId,
        ubicacionId: m.ubicacionId,
        tipo: m.tipo,
        cantidad: m.cantidad,
        saldoResultante: saldo,
        ventaId: m.ventaId,
        ingresoId: m.ingresoId,
        regaloId: m.regaloId,
        usuarioId: m.usuarioId,
        nota: m.nota,
      },
    });
  }

  /**
   * Ajuste por conteo físico: se indica cuánto HAY realmente y el sistema
   * calcula la diferencia. Requiere una nota que explique el motivo.
   */
  async ajustarPorConteo(dto: AjusteInventarioDto, usuarioId: number) {
    const producto = await this.prisma.producto.findUnique({ where: { id: dto.productoId } });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    return this.prisma.$transaction(async (tx) => {
      const ubicacionId = await this.ubicacionPrincipalId(tx);
      const actual = await this.bloquearExistencia(tx, dto.productoId, ubicacionId);
      const diferencia = dto.cantidadContada - actual;

      if (diferencia === 0) {
        return { estado: 'SIN_CAMBIOS' as const, stockAnterior: actual, stockNuevo: actual, diferencia: 0 };
      }

      await this.registrarMovimiento(tx, {
        productoId: dto.productoId,
        ubicacionId,
        tipo: 'AJUSTE',
        cantidad: diferencia,
        usuarioId,
        nota: dto.nota,
      });
      return { estado: 'AJUSTADO' as const, stockAnterior: actual, stockNuevo: dto.cantidadContada, diferencia };
    });
  }

  /** Kardex de un producto: movimientos más recientes primero. */
  async kardex(productoId: number, q: KardexDto) {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: { id: true, codigo: true, nombre: true, existencias: { select: { cantidad: true } } },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    const rango = rangoDiasNegocio(q.desde, q.hasta);
    const where: Prisma.MovimientoInventarioWhereInput = { productoId, ...(rango ? { fecha: rango } : {}) };

    const [total, movimientos] = await this.prisma.$transaction([
      this.prisma.movimientoInventario.count({ where }),
      this.prisma.movimientoInventario.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
        include: {
          usuario: { select: { nombre: true } },
          venta: { select: { numeroControl: true } },
        },
      }),
    ]);

    return {
      producto: {
        id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        stockActual: producto.existencias.reduce((s: number, e: { cantidad: number }) => s + e.cantidad, 0),
      },
      datos: movimientos.map((m) => ({
        id: m.id.toString(), // BigInt no se puede enviar en JSON
        fecha: m.fecha,
        tipo: m.tipo,
        cantidad: m.cantidad,
        saldo: m.saldoResultante,
        usuario: m.usuario.nombre,
        referencia: m.ventaId
          ? { tipo: 'VENTA', id: m.ventaId, numeroControl: m.venta?.numeroControl ?? null }
          : m.ingresoId
            ? { tipo: 'INGRESO', id: m.ingresoId }
            : m.regaloId
              ? { tipo: 'REGALO', id: m.regaloId }
              : null,
        nota: m.nota,
      })),
      total,
      pagina: q.pagina,
      porPagina: q.porPagina,
    };
  }
}
