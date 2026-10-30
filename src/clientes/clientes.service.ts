import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TipoDocumento } from '@prisma/client';
import type { Cliente } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto.js';
import { DatosClienteDto } from './dto/datos-cliente.dto.js';
import { ListarClientesDto } from './dto/listar-clientes.dto.js';

export const NOMBRE_CONSUMIDOR_FINAL = 'CONSUMIDOR FINAL';
type ClienteBD = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ClientesService {
  private consumidorFinalCache: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve el id del cliente de la venta (ver reglas en DatosClienteDto). */
  async resolverParaVenta(tx: Prisma.TransactionClient, datos?: DatosClienteDto): Promise<number> {
    if (datos?.clienteId) {
      const existe = await tx.cliente.findUnique({ where: { id: datos.clienteId }, select: { id: true } });
      if (!existe) throw new BadRequestException('El cliente indicado no existe');
      return existe.id;
    }

    const sinDocumento = !datos?.tipoDocumento && !datos?.numeroDocumento;
    if (sinDocumento) {
      if (datos?.nombre) {
        throw new BadRequestException('Para registrar al cliente indica su cédula o RIF (o deja el cliente vacío)');
      }
      return this.consumidorFinalId(tx);
    }

    if (!datos?.tipoDocumento || !datos.numeroDocumento) {
      throw new BadRequestException('Indica el tipo (V, E, J, G, P) y el número de documento del cliente');
    }

    const contacto = this.soloCamposConValor(datos);
    const existente = await tx.cliente.findUnique({
      where: {
        tipoDocumento_numeroDocumento: {
          tipoDocumento: datos.tipoDocumento,
          numeroDocumento: datos.numeroDocumento,
        },
      },
    });

    if (existente) {
      // Mantiene al día los datos de contacto con lo último que se escribió en caja
      if (Object.keys(contacto).length > 0) {
        await tx.cliente.update({ where: { id: existente.id }, data: contacto });
      }
      return existente.id;
    }

    if (!datos.nombre) throw new BadRequestException('El cliente es nuevo: indica su nombre');
    const creado = await tx.cliente.create({
      data: {
        tipoDocumento: datos.tipoDocumento,
        numeroDocumento: datos.numeroDocumento,
        nombre: datos.nombre,
        ...contacto,
      },
    });
    return creado.id;
  }

  async consumidorFinalId(cliente: ClienteBD = this.prisma): Promise<number> {
    if (this.consumidorFinalCache !== null) return this.consumidorFinalCache;
    const existente = await cliente.cliente.findFirst({
      where: { nombre: NOMBRE_CONSUMIDOR_FINAL, numeroDocumento: null },
    });
    const id = existente?.id ?? (await cliente.cliente.create({ data: { nombre: NOMBRE_CONSUMIDOR_FINAL } })).id;
    this.consumidorFinalCache = id;
    return id;
  }

  async listar(q: ListarClientesDto) {
    const where: Prisma.ClienteWhereInput = q.buscar
      ? {
          OR: [
            { nombre: { contains: q.buscar, mode: 'insensitive' } },
            { numeroDocumento: { contains: q.buscar.replace(/\D/g, '') || q.buscar } },
          ],
        }
      : {};
    const [total, clientes] = await this.prisma.$transaction([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
      }),
    ]);
    return { datos: clientes.map((c) => this.mapear(c)), total, pagina: q.pagina, porPagina: q.porPagina };
  }

  /** Para autocompletar en la pantalla de ventas al escribir la cédula. */
  async porDocumento(tipo: string, numero: string) {
    const tipoDocumento = tipo.toUpperCase();
    if (!Object.values(TipoDocumento).includes(tipoDocumento as TipoDocumento)) {
      throw new BadRequestException('Tipo de documento inválido (V, E, J, G, P)');
    }
    const cliente = await this.prisma.cliente.findUnique({
      where: {
        tipoDocumento_numeroDocumento: {
          tipoDocumento: tipoDocumento as TipoDocumento,
          numeroDocumento: numero.replace(/\D/g, ''),
        },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente no registrado');
    return this.mapear(cliente);
  }

  async obtener(id: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return this.mapear(cliente);
  }

  async actualizar(id: number, dto: ActualizarClienteDto) {
    await this.obtener(id);
    const actualizado = await this.prisma.cliente.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        telefono: dto.telefono === undefined ? undefined : dto.telefono || null,
        direccion: dto.direccion === undefined ? undefined : dto.direccion || null,
        ciudad: dto.ciudad === undefined ? undefined : dto.ciudad || null,
        estado: dto.estado === undefined ? undefined : dto.estado || null,
      },
    });
    return this.mapear(actualizado);
  }

  /** Solo los datos de contacto que vienen con valor (no borra lo que ya existe). */
  private soloCamposConValor(d: DatosClienteDto) {
    const campos: { nombre?: string; telefono?: string; direccion?: string; ciudad?: string; estado?: string } = {};
    if (d.nombre) campos.nombre = d.nombre;
    if (d.telefono) campos.telefono = d.telefono;
    if (d.direccion) campos.direccion = d.direccion;
    if (d.ciudad) campos.ciudad = d.ciudad;
    if (d.estado) campos.estado = d.estado;
    return campos;
  }

  mapear(c: Cliente) {
    return {
      id: c.id,
      documento: c.tipoDocumento && c.numeroDocumento ? `${c.tipoDocumento}-${c.numeroDocumento}` : null,
      tipoDocumento: c.tipoDocumento,
      numeroDocumento: c.numeroDocumento,
      nombre: c.nombre,
      telefono: c.telefono,
      direccion: c.direccion,
      ciudad: c.ciudad,
      estado: c.estado,
    };
  }
}
