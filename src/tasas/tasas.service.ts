import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TasaCambio } from '@prisma/client';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { aFechaDb, deFechaDb, diasEntre, fechaHoyNegocio } from '../common/fecha.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListarTasasDto } from './dto/listar-tasas.dto.js';
import { RegistrarTasaDto } from './dto/registrar-tasa.dto.js';

type TasaConUsuario = TasaCambio & { usuario?: { nombre: string } | null };

const INCLUIR_USUARIO = { usuario: { select: { nombre: true } } } as const;

@Injectable()
export class TasasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Antigüedad máxima (en días) de la tasa para poder vender. */
  private get maxDiasParaVender(): number {
    return Number(process.env.TASA_MAX_DIAS ?? 3);
  }

  /**
   * Registra la tasa de una fecha (por defecto, hoy).
   * - Si no existe: cualquier usuario puede crearla.
   * - Si ya existe: solo un ADMIN puede corregirla, y queda en auditoría.
   * Las ventas ya hechas NO cambian: guardan su propia copia de la tasa.
   */
  async registrar(dto: RegistrarTasaDto, actor: UsuarioSesion) {
    const hoy = fechaHoyNegocio();
    const fecha = dto.fecha ?? hoy;
    const fechaDb = aFechaDb(fecha);

    if (fecha > hoy) {
      throw new BadRequestException('No se puede registrar una tasa con fecha futura');
    }

    const valor = new Prisma.Decimal(dto.bsPorUsd.toString());
    const fuente = dto.fuente ?? 'MANUAL';

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existente = await tx.tasaCambio.findUnique({ where: { fecha: fechaDb } });

        if (!existente) {
          const creada = await tx.tasaCambio.create({
            data: { fecha: fechaDb, bsPorUsd: valor, fuente, usuarioId: actor.id },
            include: INCLUIR_USUARIO,
          });
          return { accion: 'CREADA' as const, tasa: this.mapear(creada) };
        }

        if (actor.rol !== 'ADMIN') {
          throw new ForbiddenException(
            `La tasa del ${fecha} ya está registrada. Solo un administrador puede corregirla.`,
          );
        }

        if (existente.bsPorUsd.equals(valor) && existente.fuente === fuente) {
          const sinCambios = await tx.tasaCambio.findUniqueOrThrow({
            where: { fecha: fechaDb },
            include: INCLUIR_USUARIO,
          });
          return { accion: 'SIN_CAMBIOS' as const, tasa: this.mapear(sinCambios) };
        }

        const actualizada = await tx.tasaCambio.update({
          where: { fecha: fechaDb },
          data: { bsPorUsd: valor, fuente, usuarioId: actor.id },
          include: INCLUIR_USUARIO,
        });

        await tx.auditoria.create({
          data: {
            tabla: 'tasas_cambio',
            registroId: fecha,
            accion: 'ACTUALIZAR',
            datosAntes: {
              bsPorUsd: existente.bsPorUsd.toString(),
              fuente: existente.fuente,
              usuarioId: existente.usuarioId,
            },
            datosDespues: { bsPorUsd: valor.toString(), fuente, usuarioId: actor.id },
            usuarioId: actor.id,
          },
        });

        return { accion: 'ACTUALIZADA' as const, tasa: this.mapear(actualizada) };
      });
    } catch (e) {
      // Dos usuarios registrando la misma fecha al mismo tiempo
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`La tasa del ${fecha} se acaba de registrar. Recarga e intenta de nuevo.`);
      }
      throw e;
    }
  }

  /** Última tasa con fecha <= hoy, con indicadores para la interfaz. */
  async vigente() {
    const hoy = fechaHoyNegocio();
    const tasa = await this.buscarVigente(hoy);
    if (!tasa) throw new NotFoundException('No hay tasas registradas');

    const fecha = deFechaDb(tasa.fecha);
    const diasAntiguedad = diasEntre(fecha, hoy);

    return {
      ...this.mapear(tasa),
      esDeHoy: diasAntiguedad === 0,
      diasAntiguedad,
      validaParaVender: diasAntiguedad <= this.maxDiasParaVender,
    };
  }

  /**
   * Tasa que usará el módulo de ventas.
   * Acepta la última tasa si no tiene más de TASA_MAX_DIAS días
   * (cubre fines de semana y feriados sin publicación del BCV).
   */
  async obtenerParaVenta() {
    const hoy = fechaHoyNegocio();
    const tasa = await this.buscarVigente(hoy);
    if (!tasa) {
      throw new BadRequestException('No hay tasa registrada. Registra la tasa del día antes de vender.');
    }

    const fecha = deFechaDb(tasa.fecha);
    const dias = diasEntre(fecha, hoy);
    if (dias > this.maxDiasParaVender) {
      throw new BadRequestException(
        `La última tasa es del ${fecha} (hace ${dias} días). Registra la tasa del día antes de vender.`,
      );
    }
    return { fecha, bsPorUsd: tasa.bsPorUsd };
  }

  async obtener(fecha: string) {
    const tasa = await this.prisma.tasaCambio.findUnique({
      where: { fecha: aFechaDb(fecha) },
      include: INCLUIR_USUARIO,
    });
    if (!tasa) throw new NotFoundException(`No hay tasa registrada para el ${fecha}`);
    return this.mapear(tasa);
  }

  /** Historial. Sin rango: últimas 30. Con rango: hasta 366 registros. */
  async listar(query: ListarTasasDto) {
    const { desde, hasta } = query;
    if (desde && hasta && desde > hasta) {
      throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
    }

    const filtroFecha: Prisma.DateTimeFilter = {};
    if (desde) filtroFecha.gte = aFechaDb(desde);
    if (hasta) filtroFecha.lte = aFechaDb(hasta);
    const hayRango = Boolean(desde || hasta);

    const tasas = await this.prisma.tasaCambio.findMany({
      where: hayRango ? { fecha: filtroFecha } : undefined,
      orderBy: { fecha: 'desc' },
      take: hayRango ? 366 : 30,
      include: INCLUIR_USUARIO,
    });
    return tasas.map((t) => this.mapear(t));
  }

  private buscarVigente(hoy: string) {
    return this.prisma.tasaCambio.findFirst({
      where: { fecha: { lte: aFechaDb(hoy) } },
      orderBy: { fecha: 'desc' },
      include: INCLUIR_USUARIO,
    });
  }

  /** Fechas como AAAA-MM-DD y montos como string (sin pérdida de precisión). */
  private mapear(t: TasaConUsuario) {
    return {
      fecha: deFechaDb(t.fecha),
      bsPorUsd: t.bsPorUsd.toString(),
      fuente: t.fuente,
      registradaPor: t.usuario?.nombre ?? null,
      creadoEn: t.creadoEn,
    };
  }
}
