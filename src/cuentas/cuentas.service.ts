import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarCuentaDto, CrearCuentaDto } from './dto/cuenta.dto.js';

@Injectable()
export class CuentasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(incluirInactivas = false) {
    return this.prisma.cuentaBancaria.findMany({
      where: incluirInactivas ? {} : { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async crear(dto: CrearCuentaDto) {
    try {
      return await this.prisma.cuentaBancaria.create({ data: dto });
    } catch (e) {
      this.nombreDuplicado(e);
    }
  }

  async actualizar(id: number, dto: ActualizarCuentaDto) {
    const cuenta = await this.prisma.cuentaBancaria.findUnique({ where: { id } });
    if (!cuenta) throw new NotFoundException('Cuenta no encontrada');
    try {
      return await this.prisma.cuentaBancaria.update({ where: { id }, data: dto });
    } catch (e) {
      this.nombreDuplicado(e);
    }
  }

  private nombreDuplicado(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Ya existe una cuenta con ese nombre');
    }
    throw e;
  }
}
