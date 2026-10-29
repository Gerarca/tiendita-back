import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { BCRYPT_COSTO } from '../auth/auth.service.js';
import { USUARIO_SISTEMA } from '../common/sistema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { RestablecerPasswordDto } from './dto/restablecer-password.dto.js';

/** Campos que se devuelven al cliente. Nunca el hash. */
const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  usuario: true,
  rol: true,
  activo: true,
  creadoEn: true,
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.usuario.findMany({
      where: { usuario: { not: USUARIO_SISTEMA } },
      select: CAMPOS_PUBLICOS,
      orderBy: { nombre: 'asc' },
    });
  }

  async obtener(id: number) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
    // El usuario interno no se ve ni se edita (actualizar y restablecer pasan por aquí)
    if (!usuario || usuario.usuario === USUARIO_SISTEMA) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }

  async crear(dto: CrearUsuarioDto) {
    try {
      return await this.prisma.usuario.create({
        data: {
          nombre: dto.nombre,
          usuario: dto.usuario,
          passwordHash: await hash(dto.password, BCRYPT_COSTO),
          rol: dto.rol ?? 'VENDEDOR',
        },
        select: CAMPOS_PUBLICOS,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ese nombre de usuario ya existe');
      }
      throw e;
    }
  }

  async actualizar(id: number, dto: ActualizarUsuarioDto, actorId: number) {
    const actual = await this.obtener(id);

    // Evitar quedarse sin administradores (el sistema quedaría inmanejable)
    const dejaDeSerAdminActivo =
      actual.rol === 'ADMIN' &&
      actual.activo &&
      ((dto.rol !== undefined && dto.rol !== 'ADMIN') || dto.activo === false);

    if (dejaDeSerAdminActivo) {
      if (id === actorId) {
        throw new BadRequestException(
          'No puedes quitarte el rol de administrador ni desactivarte a ti mismo',
        );
      }
      const otrosAdmins = await this.prisma.usuario.count({
        where: { rol: 'ADMIN', activo: true, id: { not: id } },
      });
      if (otrosAdmins === 0) {
        throw new BadRequestException('Debe quedar al menos un administrador activo');
      }
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { nombre: dto.nombre, rol: dto.rol, activo: dto.activo },
      select: CAMPOS_PUBLICOS,
    });
  }

  /** El admin asigna una contraseña nueva (p. ej. si alguien la olvidó). */
  async restablecerPassword(id: number, dto: RestablecerPasswordDto) {
    await this.obtener(id);
    await this.prisma.usuario.update({
      where: { id },
      data: { passwordHash: await hash(dto.password, BCRYPT_COSTO) },
    });
  }
}
