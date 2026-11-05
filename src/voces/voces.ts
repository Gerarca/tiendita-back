import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Mayusculas } from '../common/transformaciones.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class CrearVozDto {
  /** Como aparece en la máquina fiscal: ALIM CASEROS, PULSERAS, PASTA... */
  @Mayusculas() @IsString() @IsNotEmpty() @MaxLength(40) nombre!: string;
  @IsBoolean() exentoIva!: boolean;
}

export class ActualizarVozDto {
  @IsOptional() @Mayusculas() @IsString() @IsNotEmpty() @MaxLength(40) nombre?: string;
  @IsOptional() @IsBoolean() exentoIva?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
}

@Injectable()
export class VocesService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.vozFiscal.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { categorias: true, productos: true } } },
    });
  }

  async crear(dto: CrearVozDto) {
    try {
      return await this.prisma.vozFiscal.create({ data: dto });
    } catch (e) {
      this.duplicada(e);
    }
  }

  async actualizar(id: number, dto: ActualizarVozDto) {
    if (!(await this.prisma.vozFiscal.findUnique({ where: { id } }))) throw new NotFoundException('Voz fiscal no encontrada');
    try {
      return await this.prisma.vozFiscal.update({ where: { id }, data: dto });
    } catch (e) {
      this.duplicada(e);
    }
  }

  private duplicada(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Ya existe una voz fiscal con ese nombre');
    }
    throw e;
  }
}

/** /api/voces-fiscales — consulta para todos, cambios solo ADMIN. */
@Controller('voces-fiscales')
export class VocesController {
  constructor(private readonly voces: VocesService) {}

  @Get()
  listar() {
    return this.voces.listar();
  }

  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearVozDto) {
    return this.voces.crear(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarVozDto) {
    return this.voces.actualizar(id, dto);
  }
}

@Module({ controllers: [VocesController], providers: [VocesService] })
export class VocesModule {}
