import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { rangoDiasNegocio } from '../common/fecha.util.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductosService } from '../productos/productos.service.js';
import { IngresoProductoNuevoDto } from './dto/ingreso-producto-nuevo.dto.js';
import { ListarIngresosDto } from './dto/listar-ingresos.dto.js';
import { RegistrarIngresoDto } from './dto/registrar-ingreso.dto.js';

const INCLUIR_DETALLE = {
  usuario: { select: { nombre: true } },
  ubicacion: { select: { nombre: true } },
  detalles: {
    orderBy: { id: 'asc' },
    include: { producto: { select: { codigo: true, nombre: true } } },
  },
} satisfies Prisma.IngresoInclude;

type IngresoCompleto = Prisma.IngresoGetPayload<{ include: typeof INCLUIR_DETALLE }>;

/** Las transacciones con muchos productos pueden pasar de los 5 s por defecto. */
const OPCIONES_TX = { timeout: 20_000 };

@Injectable()
export class IngresosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
    private readonly productos: ProductosService,
  ) {}

  /** Ingreso de productos existentes (boceto "Existente"). */
  async registrar(dto: RegistrarIngresoDto, actor: UsuarioSesion) {
    const ids = dto.detalles.map((d) => d.productoId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Hay productos repetidos en el ingreso: suma las cantidades en una sola línea');
    }
    if (actor.rol !== 'ADMIN' && dto.detalles.some((d) => d.nuevoPrecioUsd !== undefined)) {
      throw new ForbiddenException('Solo un administrador puede cambiar precios');
    }

    const ingresoId = await this.prisma.$transaction(async (tx) => {
      const productos = await tx.producto.findMany({ where: { id: { in: ids } } });
      const porId = new Map(productos.map((p) => [p.id, p]));

      for (const d of dto.detalles) {
        const p = porId.get(d.productoId);
        if (!p) throw new BadRequestException(`El producto ${d.productoId} no existe`);
        if (!p.activo) throw new BadRequestException(`${p.codigo} está inactivo. Reactívalo antes de ingresarlo.`);
      }

      const ubicacionId = await this.inventario.ubicacionPrincipalId(tx);
      const ingreso = await tx.ingreso.create({
        data: {
          ubicacionId,
          proveedor: dto.proveedor || null,
          nota: dto.nota || null,
          usuarioId: actor.id,
          detalles: {
            create: dto.detalles.map((d) => ({
              productoId: d.productoId,
              cantidad: d.cantidad,
              costoUnitUsd: d.costoUnitUsd !== undefined ? new Prisma.Decimal(d.costoUnitUsd.toFixed(2)) : null,
            })),
          },
        },
      });

      // Orden por productoId: evita bloqueos cruzados con otras operaciones simultáneas
      const ordenados = [...dto.detalles].sort((a, b) => a.productoId - b.productoId);
      for (const d of ordenados) {
        if (d.nuevoPrecioUsd !== undefined) {
          const producto = porId.get(d.productoId)!;
          await this.productos.aplicarCambioPrecio(
            tx,
            producto,
            new Prisma.Decimal(d.nuevoPrecioUsd.toFixed(2)),
            actor.id,
          );
        }
        await this.inventario.registrarMovimiento(tx, {
          productoId: d.productoId,
          ubicacionId,
          tipo: 'INGRESO',
          cantidad: d.cantidad,
          ingresoId: ingreso.id,
          usuarioId: actor.id,
        });
      }

      return ingreso.id;
    }, OPCIONES_TX);

    return this.obtener(ingresoId);
  }

  /** Producto nuevo + su primer ingreso (boceto "Nuevo"). Solo ADMIN. */
  async registrarProductoNuevo(dto: IngresoProductoNuevoDto, actor: UsuarioSesion) {
    try {
      const { productoId, ingresoId } = await this.prisma.$transaction(async (tx) => {
        const producto = await this.productos.crearRegistro(tx, dto.producto);
        const ubicacionId = await this.inventario.ubicacionPrincipalId(tx);

        const ingreso = await tx.ingreso.create({
          data: {
            ubicacionId,
            proveedor: dto.proveedor || null,
            nota: dto.nota || null,
            usuarioId: actor.id,
            detalles: {
              create: {
                productoId: producto.id,
                cantidad: dto.cantidad,
                costoUnitUsd:
                  dto.costoUnitUsd !== undefined ? new Prisma.Decimal(dto.costoUnitUsd.toFixed(2)) : null,
              },
            },
          },
        });

        await this.inventario.registrarMovimiento(tx, {
          productoId: producto.id,
          ubicacionId,
          tipo: 'INGRESO',
          cantidad: dto.cantidad,
          ingresoId: ingreso.id,
          usuarioId: actor.id,
        });

        return { productoId: producto.id, ingresoId: ingreso.id };
      }, OPCIONES_TX);

      return {
        producto: await this.productos.obtener(productoId),
        ingreso: await this.obtener(ingresoId),
      };
    } catch (e) {
      this.productos.traducirCodigoDuplicado(e, dto.producto.codigo);
    }
  }

  async obtener(id: number) {
    const ingreso = await this.prisma.ingreso.findUnique({ where: { id }, include: INCLUIR_DETALLE });
    if (!ingreso) throw new NotFoundException('Ingreso no encontrado');
    return this.mapear(ingreso);
  }

  async listar(q: ListarIngresosDto) {
    const rango = rangoDiasNegocio(q.desde, q.hasta);
    const where: Prisma.IngresoWhereInput = rango ? { fecha: rango } : {};

    const [total, ingresos] = await this.prisma.$transaction([
      this.prisma.ingreso.count({ where }),
      this.prisma.ingreso.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
        include: INCLUIR_DETALLE,
      }),
    ]);

    return { datos: ingresos.map((i) => this.mapear(i)), total, pagina: q.pagina, porPagina: q.porPagina };
  }

  private mapear(i: IngresoCompleto) {
    const detalles = i.detalles.map((d) => ({
      productoId: d.productoId,
      codigo: d.producto.codigo,
      nombre: d.producto.nombre,
      cantidad: d.cantidad,
      costoUnitUsd: d.costoUnitUsd?.toString() ?? null,
      costoTotalUsd: d.costoUnitUsd ? d.costoUnitUsd.times(d.cantidad).toFixed(2) : null,
    }));

    const conCosto = i.detalles.filter((d) => d.costoUnitUsd !== null);
    const costoTotal = conCosto.reduce(
      (suma: Prisma.Decimal, d) => suma.plus(d.costoUnitUsd!.times(d.cantidad)),
      new Prisma.Decimal(0),
    );

    return {
      id: i.id,
      fecha: i.fecha,
      ubicacion: i.ubicacion.nombre,
      proveedor: i.proveedor,
      nota: i.nota,
      usuario: i.usuario.nombre,
      totalProductos: detalles.length,
      totalUnidades: detalles.reduce((s, d) => s + d.cantidad, 0),
      costoTotalUsd: conCosto.length > 0 ? costoTotal.toFixed(2) : null,
      detalles,
    };
  }
}
