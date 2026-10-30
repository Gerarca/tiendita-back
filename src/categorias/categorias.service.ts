import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto.js';
import { CrearCategoriaDto } from './dto/crear-categoria.dto.js';

/**
 * Reglas del árbol de categorías:
 *  - Máximo dos niveles: principal → subcategoría.
 *  - Los productos van en categorías "hoja" (sin subcategorías).
 *    Ej.: Alimentos > Pasta (hoja) o Rosarios (principal sin hijas = hoja).
 *  - Nada se borra: se desactiva.
 */
@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Árbol completo: categorías principales con sus subcategorías. */
  async arbol(incluirInactivas = false) {
    const filtro = incluirInactivas ? {} : { activo: true };
    const conteo = { _count: { select: { productos: { where: { activo: true } } } } } as const;
    const orden = [{ orden: 'asc' as const }, { nombre: 'asc' as const }];

    const principales = await this.prisma.categoria.findMany({
      where: { padreId: null, ...filtro },
      orderBy: orden,
      include: { ...conteo, hijas: { where: filtro, orderBy: orden, include: conteo } },
    });

    return principales.map((p) => ({
      ...this.mapear(p),
      hijas: p.hijas.map((h) => this.mapear(h)),
    }));
  }

  async obtener(id: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id },
      include: { _count: { select: { productos: { where: { activo: true } } } } },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return this.mapear(categoria);
  }

  async crear(dto: CrearCategoriaDto) {
    const padreId = dto.padreId ?? null;

    if (padreId !== null) {
      const padre = await this.prisma.categoria.findUnique({
        where: { id: padreId },
        include: { _count: { select: { productos: true } } },
      });
      if (!padre) throw new BadRequestException('La categoría principal indicada no existe');
      if (padre.padreId !== null) {
        throw new BadRequestException('Solo se permiten dos niveles: no se puede crear una sub-subcategoría');
      }
      if (padre._count.productos > 0) {
        throw new BadRequestException(
          `"${padre.nombre}" ya tiene productos asignados. Muévelos a otra categoría antes de crearle subcategorías.`,
        );
      }
    }

    await this.verificarNombreLibre(dto.nombre, padreId);

    const creada = await this.prisma.categoria.create({
      data: {
        nombre: dto.nombre,
        padreId,
        prefijoCodigo: dto.prefijoCodigo ?? null,
        orden: dto.orden ?? 0,
      },
      include: { _count: { select: { productos: { where: { activo: true } } } } },
    });
    return this.mapear(creada);
  }

  async actualizar(id: number, dto: ActualizarCategoriaDto) {
    const actual = await this.prisma.categoria.findUnique({
      where: { id },
      include: {
        _count: { select: { productos: { where: { activo: true } } } },
        hijas: { where: { activo: true }, select: { id: true } },
      },
    });
    if (!actual) throw new NotFoundException('Categoría no encontrada');

    if (dto.nombre && dto.nombre.toLowerCase() !== actual.nombre.toLowerCase()) {
      await this.verificarNombreLibre(dto.nombre, actual.padreId, id);
    }

    if (dto.activo === false && actual.activo) {
      if (actual.hijas.length > 0) {
        throw new BadRequestException('Desactiva primero sus subcategorías');
      }
      if (actual._count.productos > 0) {
        throw new BadRequestException(
          `Tiene ${actual._count.productos} producto(s) activo(s). Desactívalos o muévelos primero.`,
        );
      }
    }

    // Reactivar una subcategoría cuyo padre está inactivo la dejaría huérfana en el menú
    if (dto.activo === true && actual.padreId !== null) {
      const padre = await this.prisma.categoria.findUniqueOrThrow({ where: { id: actual.padreId } });
      if (!padre.activo) throw new BadRequestException(`Activa primero la categoría "${padre.nombre}"`);
    }

    const actualizada = await this.prisma.categoria.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        prefijoCodigo: dto.prefijoCodigo,
        orden: dto.orden,
        activo: dto.activo,
      },
      include: { _count: { select: { productos: { where: { activo: true } } } } },
    });
    return this.mapear(actualizada);
  }

  /** La BD no impide nombres repetidos entre principales (padre_id NULL), así que se valida aquí. */
  private async verificarNombreLibre(nombre: string, padreId: number | null, excluirId?: number) {
    const repetida = await this.prisma.categoria.findFirst({
      where: {
        padreId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
    });
    if (repetida) throw new ConflictException(`Ya existe una categoría llamada "${repetida.nombre}" en ese nivel`);
  }

  private mapear(c: {
    id: number;
    nombre: string;
    padreId: number | null;
    prefijoCodigo: string | null;
    orden: number;
    activo: boolean;
    _count: { productos: number };
  }) {
    return {
      id: c.id,
      nombre: c.nombre,
      padreId: c.padreId,
      prefijoCodigo: c.prefijoCodigo,
      orden: c.orden,
      activo: c.activo,
      productosActivos: c._count.productos,
    };
  }
}
