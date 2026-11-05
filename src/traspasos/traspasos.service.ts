import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { sumar } from '../common/dinero.js';
import { rangoDiasNegocio } from '../common/fecha.util.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListarTraspasosDto } from './dto/listar-traspasos.dto.js';
import { RegistrarTraspasoDto } from './dto/registrar-traspaso.dto.js';

const INCLUIR = {
  usuario: { select: { nombre: true } },
  detalles: {
    orderBy: { id: 'asc' },
    include: { producto: { select: { codigo: true, nombre: true } } },
  },
} satisfies Prisma.TraspasoInclude;

type TraspasoCompleto = Prisma.TraspasoGetPayload<{ include: typeof INCLUIR }>;

/**
 * Traspasos de material: mercancía que sale de la tienda hacia un departamento
 * de venta. Funciona igual que un regalo: descuenta stock por el kardex y cada
 * producto guarda su precio del momento para reportar el valor traspasado.
 */
@Injectable()
export class TraspasosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
  ) {}

  async registrar(dto: RegistrarTraspasoDto, actor: UsuarioSesion) {
    const lineas = this.agrupar(dto.detalles);

    const traspasoId = await this.prisma.$transaction(
      async (tx) => {
        const productos = await tx.producto.findMany({ where: { id: { in: lineas.map((l) => l.productoId) } } });
        const porId = new Map(productos.map((p) => [p.id, p]));
        for (const l of lineas) {
          const p = porId.get(l.productoId);
          if (!p) throw new BadRequestException(`El producto ${l.productoId} no existe`);
          if (!p.activo) throw new BadRequestException(`${p.codigo} (${p.nombre}) está inactivo`);
        }

        const ubicacionId = await this.inventario.ubicacionPrincipalId(tx);
        const traspaso = await tx.traspaso.create({
          data: {
            ubicacionId,
            departamento: dto.departamento,
            hermanaEncargada: dto.hermanaEncargada,
            autorizadoPor: dto.autorizadoPor || null,
            usuarioId: actor.id,
            detalles: {
              create: lineas.map((l) => ({
                productoId: l.productoId,
                cantidad: l.cantidad,
                valorRefUsd: porId.get(l.productoId)!.precioUsd,
              })),
            },
          },
        });

        for (const l of [...lineas].sort((a, b) => a.productoId - b.productoId)) {
          await this.inventario.registrarMovimiento(tx, {
            productoId: l.productoId,
            ubicacionId,
            tipo: 'TRASPASO_SALIDA',
            cantidad: -l.cantidad,
            traspasoId: traspaso.id,
            usuarioId: actor.id,
          });
        }
        return traspaso.id;
      },
      { timeout: 20_000 },
    );

    return this.obtener(traspasoId);
  }

  async obtener(id: number) {
    const traspaso = await this.prisma.traspaso.findUnique({ where: { id }, include: INCLUIR });
    if (!traspaso) throw new NotFoundException('Traspaso no encontrado');
    return this.mapear(traspaso);
  }

  async listar(q: ListarTraspasosDto) {
    const condiciones: Prisma.TraspasoWhereInput[] = [];
    const rango = rangoDiasNegocio(q.desde, q.hasta);
    if (rango) condiciones.push({ fecha: rango });
    if (q.buscar) {
      condiciones.push({
        OR: [
          { departamento: { contains: q.buscar, mode: 'insensitive' } },
          { hermanaEncargada: { contains: q.buscar, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.TraspasoWhereInput = { AND: condiciones };

    const [total, traspasos, detallesPeriodo] = await this.prisma.$transaction([
      this.prisma.traspaso.count({ where }),
      this.prisma.traspaso.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
        include: INCLUIR,
      }),
      // Para el resumen del período completo (no solo de la página)
      this.prisma.traspasoDetalle.findMany({
        where: { traspaso: where },
        select: { cantidad: true, valorRefUsd: true },
      }),
    ]);

    return {
      datos: traspasos.map((r) => this.mapear(r)),
      total,
      pagina: q.pagina,
      porPagina: q.porPagina,
      resumen: {
        traspasos: total,
        unidades: detallesPeriodo.reduce((s, d) => s + d.cantidad, 0),
        valorTotalUsd: sumar(detallesPeriodo.map((d) => d.valorRefUsd.times(d.cantidad))).toFixed(2),
      },
    };
  }

  private agrupar(detalles: { productoId: number; cantidad: number }[]) {
    const mapa = new Map<number, number>();
    for (const d of detalles) mapa.set(d.productoId, (mapa.get(d.productoId) ?? 0) + d.cantidad);
    return [...mapa.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad }));
  }

  private mapear(r: TraspasoCompleto) {
    const detalles = r.detalles.map((d) => ({
      productoId: d.productoId,
      codigo: d.producto.codigo,
      nombre: d.producto.nombre,
      cantidad: d.cantidad,
      valorUnitUsd: d.valorRefUsd.toFixed(2),
      valorTotalUsd: d.valorRefUsd.times(d.cantidad).toFixed(2),
    }));
    return {
      id: r.id,
      fecha: r.fecha,
      departamento: r.departamento,
      hermanaEncargada: r.hermanaEncargada,
      autorizadoPor: r.autorizadoPor,
      registradoPor: r.usuario.nombre,
      unidades: detalles.reduce((s, d) => s + d.cantidad, 0),
      valorTotalUsd: sumar(r.detalles.map((d) => d.valorRefUsd.times(d.cantidad))).toFixed(2),
      detalles,
    };
  }
}
