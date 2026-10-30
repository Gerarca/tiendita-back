import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { sumar } from '../common/dinero.js';
import { rangoDiasNegocio } from '../common/fecha.util.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListarRegalosDto } from './dto/listar-regalos.dto.js';
import { RegistrarRegaloDto } from './dto/registrar-regalo.dto.js';

const INCLUIR = {
  usuario: { select: { nombre: true } },
  detalles: {
    orderBy: { id: 'asc' },
    include: { producto: { select: { codigo: true, nombre: true } } },
  },
} satisfies Prisma.RegaloInclude;

type RegaloCompleto = Prisma.RegaloGetPayload<{ include: typeof INCLUIR }>;

/**
 * Regalos: salida de mercancía sin cobro. Cada producto guarda su precio
 * del momento (valorRefUsd) para poder reportar "cuánto se regaló".
 */
@Injectable()
export class RegalosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
  ) {}

  async registrar(dto: RegistrarRegaloDto, actor: UsuarioSesion) {
    const lineas = this.agrupar(dto.detalles);

    const regaloId = await this.prisma.$transaction(
      async (tx) => {
        const productos = await tx.producto.findMany({ where: { id: { in: lineas.map((l) => l.productoId) } } });
        const porId = new Map(productos.map((p) => [p.id, p]));
        for (const l of lineas) {
          const p = porId.get(l.productoId);
          if (!p) throw new BadRequestException(`El producto ${l.productoId} no existe`);
          if (!p.activo) throw new BadRequestException(`${p.codigo} (${p.nombre}) está inactivo`);
        }

        const ubicacionId = await this.inventario.ubicacionPrincipalId(tx);
        const regalo = await tx.regalo.create({
          data: {
            ubicacionId,
            beneficiario: dto.beneficiario,
            motivo: dto.motivo,
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
            tipo: 'REGALO',
            cantidad: -l.cantidad,
            regaloId: regalo.id,
            usuarioId: actor.id,
          });
        }
        return regalo.id;
      },
      { timeout: 20_000 },
    );

    return this.obtener(regaloId);
  }

  async obtener(id: number) {
    const regalo = await this.prisma.regalo.findUnique({ where: { id }, include: INCLUIR });
    if (!regalo) throw new NotFoundException('Regalo no encontrado');
    return this.mapear(regalo);
  }

  async listar(q: ListarRegalosDto) {
    const condiciones: Prisma.RegaloWhereInput[] = [];
    const rango = rangoDiasNegocio(q.desde, q.hasta);
    if (rango) condiciones.push({ fecha: rango });
    if (q.buscar) {
      condiciones.push({
        OR: [
          { beneficiario: { contains: q.buscar, mode: 'insensitive' } },
          { motivo: { contains: q.buscar, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.RegaloWhereInput = { AND: condiciones };

    const [total, regalos, detallesPeriodo] = await this.prisma.$transaction([
      this.prisma.regalo.count({ where }),
      this.prisma.regalo.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
        include: INCLUIR,
      }),
      // Para el resumen del período completo (no solo de la página)
      this.prisma.regaloDetalle.findMany({
        where: { regalo: where },
        select: { cantidad: true, valorRefUsd: true },
      }),
    ]);

    return {
      datos: regalos.map((r) => this.mapear(r)),
      total,
      pagina: q.pagina,
      porPagina: q.porPagina,
      resumen: {
        regalos: total,
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

  private mapear(r: RegaloCompleto) {
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
      beneficiario: r.beneficiario,
      motivo: r.motivo,
      autorizadoPor: r.autorizadoPor,
      registradoPor: r.usuario.nombre,
      unidades: detalles.reduce((s, d) => s + d.cantidad, 0),
      valorTotalUsd: sumar(r.detalles.map((d) => d.valorRefUsd.times(d.cantidad))).toFixed(2),
      detalles,
    };
  }
}
