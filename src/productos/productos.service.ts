import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UsuarioSesion } from '../auth/auth.types.js';
import type { ArchivoSubido } from '../common/archivo-subido.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import { CrearProductoDto } from './dto/crear-producto.dto.js';
import { ListarProductosDto } from './dto/listar-productos.dto.js';
import { borrarImagen, detectarTipoImagen, directorioImagenes, URL_IMAGENES } from './imagenes.util.js';

const INCLUIR = {
  categoria: {
    select: {
      id: true,
      nombre: true,
      padre: { select: { id: true, nombre: true } },
      vozFiscal: { select: { id: true, nombre: true, exentoIva: true } },
    },
  },
  vozFiscal: { select: { id: true, nombre: true, exentoIva: true } },
  existencias: { select: { cantidad: true } },
} satisfies Prisma.ProductoInclude;

type ProductoCompleto = Prisma.ProductoGetPayload<{ include: typeof INCLUIR }>;
type ClienteBD = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------------------------------------------- consultas

  async listar(q: ListarProductosDto) {
    const condiciones: Prisma.ProductoWhereInput[] = [];

    if (!q.incluirInactivos) condiciones.push({ activo: true });
    if (q.categoriaId) {
      // Una categoría principal trae también los productos de sus subcategorías
      condiciones.push({ OR: [{ categoriaId: q.categoriaId }, { categoria: { padreId: q.categoriaId } }] });
    }
    if (q.buscar) {
      condiciones.push({
        OR: [
          { codigo: { contains: q.buscar, mode: 'insensitive' } },
          { nombre: { contains: q.buscar, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.ProductoWhereInput = { AND: condiciones };
    const orderBy: Prisma.ProductoOrderByWithRelationInput[] = [
      { categoria: { orden: 'asc' } },
      { nombre: 'asc' },
    ];

    // Stock bajo depende de una suma: con pocos cientos de productos
    // es más simple y claro filtrarlo en memoria que en SQL.
    if (q.soloStockBajo) {
      const todos = await this.prisma.producto.findMany({ where, include: INCLUIR, orderBy });
      const bajos = todos.map((p) => this.mapear(p)).filter((p) => p.stockBajo);
      const inicio = (q.pagina - 1) * q.porPagina;
      return {
        datos: bajos.slice(inicio, inicio + q.porPagina),
        total: bajos.length,
        pagina: q.pagina,
        porPagina: q.porPagina,
      };
    }

    const [total, productos] = await this.prisma.$transaction([
      this.prisma.producto.count({ where }),
      this.prisma.producto.findMany({
        where,
        include: INCLUIR,
        orderBy,
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
      }),
    ]);

    return {
      datos: productos.map((p) => this.mapear(p)),
      total,
      pagina: q.pagina,
      porPagina: q.porPagina,
    };
  }

  async obtener(id: number) {
    const producto = await this.prisma.producto.findUnique({ where: { id }, include: INCLUIR });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return this.mapear(producto);
  }

  /** Búsqueda exacta por código: la usa la pantalla de ventas (campo "COD"). */
  async porCodigo(codigo: string) {
    const producto = await this.prisma.producto.findUnique({
      where: { codigo: codigo.trim().toUpperCase() },
      include: INCLUIR,
    });
    if (!producto) throw new NotFoundException(`No existe un producto con código ${codigo.toUpperCase()}`);
    return this.mapear(producto);
  }

  async historialPrecios(id: number) {
    await this.obtener(id);
    const historial = await this.prisma.historialPrecio.findMany({
      where: { productoId: id },
      orderBy: { fecha: 'desc' },
      include: { usuario: { select: { nombre: true } } },
    });
    return historial.map((h) => ({
      fecha: h.fecha,
      precioAnterior: h.precioAnterior.toString(),
      precioNuevo: h.precioNuevo.toString(),
      usuario: h.usuario.nombre,
    }));
  }

  // ----------------------------------------------------------- escritura

  async crear(dto: CrearProductoDto) {
    try {
      const creado = await this.crearRegistro(this.prisma, dto);
      return await this.obtener(creado.id);
    } catch (e) {
      this.traducirCodigoDuplicado(e, dto.codigo);
    }
  }

  /**
   * Crea el producto con el cliente indicado. Recibe `cliente` para poder
   * usarse dentro de una transacción (p. ej. ingreso de un producto nuevo).
   */
  async crearRegistro(cliente: ClienteBD, dto: CrearProductoDto) {
    await this.validarCategoria(dto.categoriaId, cliente);
    return cliente.producto.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        descripcion: dto.descripcion || null,
        categoriaId: dto.categoriaId,
        precioUsd: new Prisma.Decimal(dto.precioUsd.toFixed(2)),
        stockMinimo: dto.stockMinimo ?? null,
        vozFiscalId: dto.vozFiscalId ?? null,
      },
    });
  }

  /**
   * Cambia el precio y deja constancia en el historial. Debe ejecutarse
   * dentro de una transacción. Devuelve false si el precio no cambió.
   */
  async aplicarCambioPrecio(
    tx: Prisma.TransactionClient,
    producto: { id: number; precioUsd: Prisma.Decimal },
    nuevoPrecio: Prisma.Decimal,
    usuarioId: number,
  ): Promise<boolean> {
    if (nuevoPrecio.equals(producto.precioUsd)) return false;
    await tx.producto.update({ where: { id: producto.id }, data: { precioUsd: nuevoPrecio } });
    await tx.historialPrecio.create({
      data: { productoId: producto.id, precioAnterior: producto.precioUsd, precioNuevo: nuevoPrecio, usuarioId },
    });
    return true;
  }

  async actualizar(id: number, dto: ActualizarProductoDto, actor: UsuarioSesion) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actual = await tx.producto.findUnique({ where: { id } });
        if (!actual) throw new NotFoundException('Producto no encontrado');

        if (dto.categoriaId !== undefined && dto.categoriaId !== actual.categoriaId) {
          await this.validarCategoria(dto.categoriaId, tx);
        }

        const nuevoPrecio =
          dto.precioUsd !== undefined ? new Prisma.Decimal(dto.precioUsd.toFixed(2)) : undefined;
        const cambiaPrecio = nuevoPrecio !== undefined && !nuevoPrecio.equals(actual.precioUsd);

        const actualizado = await tx.producto.update({
          where: { id },
          data: {
            codigo: dto.codigo,
            nombre: dto.nombre,
            descripcion: dto.descripcion === undefined ? undefined : dto.descripcion || null,
            categoriaId: dto.categoriaId,
            precioUsd: cambiaPrecio ? nuevoPrecio : undefined,
            stockMinimo: dto.stockMinimo,
            activo: dto.activo,
            vozFiscalId: dto.vozFiscalId,
          },
          include: INCLUIR,
        });

        if (cambiaPrecio) {
          await tx.historialPrecio.create({
            data: {
              productoId: id,
              precioAnterior: actual.precioUsd,
              precioNuevo: nuevoPrecio,
              usuarioId: actor.id,
            },
          });
        }

        return this.mapear(actualizado);
      });
    } catch (e) {
      this.traducirCodigoDuplicado(e, dto.codigo);
    }
  }

  // ----------------------------------------------------------- imágenes

  async subirImagen(id: number, archivo: ArchivoSubido | undefined) {
    if (!archivo) throw new BadRequestException('Envía la imagen en el campo "imagen" (multipart/form-data)');

    const extension = detectarTipoImagen(archivo.buffer);
    if (!extension) throw new BadRequestException('Formato no permitido. Usa JPG, PNG o WEBP');

    const producto = await this.prisma.producto.findUnique({ where: { id } });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    // Nombre nuevo en cada subida: evita que el navegador muestre la imagen vieja en caché
    const nombreArchivo = `${id}-${Date.now()}.${extension}`;
    const ruta = join(directorioImagenes(), nombreArchivo);
    await mkdir(directorioImagenes(), { recursive: true });
    await writeFile(ruta, archivo.buffer);

    let actualizado: ProductoCompleto;
    try {
      actualizado = await this.prisma.producto.update({
        where: { id },
        data: { imagenUrl: `${URL_IMAGENES}${nombreArchivo}` },
        include: INCLUIR,
      });
    } catch (e) {
      await rm(ruta, { force: true }); // no dejar archivos huérfanos
      throw e;
    }

    await borrarImagen(producto.imagenUrl);
    return this.mapear(actualizado);
  }

  async quitarImagen(id: number) {
    const producto = await this.prisma.producto.findUnique({ where: { id } });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    const actualizado = await this.prisma.producto.update({
      where: { id },
      data: { imagenUrl: null },
      include: INCLUIR,
    });
    await borrarImagen(producto.imagenUrl);
    return this.mapear(actualizado);
  }

  // ----------------------------------------------------------- auxiliares

  /** La categoría debe existir, estar activa y no tener subcategorías. */
  private async validarCategoria(categoriaId: number, cliente: ClienteBD) {
    const categoria = await cliente.categoria.findUnique({
      where: { id: categoriaId },
      include: { _count: { select: { hijas: true } } },
    });
    if (!categoria) throw new BadRequestException('La categoría indicada no existe');
    if (!categoria.activo) throw new BadRequestException(`La categoría "${categoria.nombre}" está inactiva`);
    if (categoria._count.hijas > 0) {
      throw new BadRequestException(
        `"${categoria.nombre}" tiene subcategorías: asigna el producto a una de ellas`,
      );
    }
  }

  traducirCodigoDuplicado(e: unknown, codigo?: string): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException(`Ya existe un producto con el código ${codigo ?? ''}`.trim());
    }
    throw e;
  }

  private mapear(p: ProductoCompleto) {
    const stock = p.existencias.reduce((suma: number, e: { cantidad: number }) => suma + e.cantidad, 0);
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precioUsd: p.precioUsd.toString(),
      imagenUrl: p.imagenUrl,
      stock,
      stockMinimo: p.stockMinimo,
      stockBajo: p.stockMinimo !== null && stock <= p.stockMinimo,
      activo: p.activo,
      // La voz propia del producto manda; si no tiene, la de su categoría
      vozFiscalId: p.vozFiscalId,
      vozFiscal: p.vozFiscal
        ? { ...p.vozFiscal, origen: 'producto' as const }
        : p.categoria.vozFiscal
          ? { ...p.categoria.vozFiscal, origen: 'categoria' as const }
          : null,
      categoria: {
        id: p.categoria.id,
        nombre: p.categoria.nombre,
        padre: p.categoria.padre,
      },
      creadoEn: p.creadoEn,
      actualizadoEn: p.actualizadoEn,
    };
  }
}
