import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BCRYPT_COSTO } from '../../auth/auth.service.js';
import { aFechaDb, deFechaDb, diasEntre, esFechaValida, fechaHoyNegocio } from '../../common/fecha.util.js';
import { USUARIO_SISTEMA } from '../../common/sistema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { descargarHtml } from './bcv.http.js';
import { parsearPaginaBcv, type TasaBcv } from './bcv.parser.js';

export type ResultadoSincronizacion =
  | { estado: 'REGISTRADA'; fecha: string; bsPorUsd: string }
  | { estado: 'YA_EXISTE'; fecha: string; fuente: string; bsPorUsd: string }
  | { estado: 'RECHAZADA'; mensaje: string }
  | { estado: 'ERROR'; mensaje: string }
  | { estado: 'DESACTIVADA' | 'EN_CURSO' };

@Injectable()
export class BcvService implements OnApplicationBootstrap {
  private readonly logger = new Logger('TasaBCV');
  private usuarioSistemaId: number | null = null;
  private ejecutando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get habilitado() {
    return this.config.get<string>('BCV_AUTO', 'true') === 'true';
  }

  async onApplicationBootstrap() {
    this.usuarioSistemaId = await this.asegurarUsuarioSistema();
    // Al encender la PC en la mañana se intenta de una vez, sin bloquear el arranque
    if (this.habilitado) void this.sincronizar();
  }

  /**
   * Varias veces al día porque la hora de publicación del BCV varía.
   * Si la tasa ya existe, la ejecución no hace nada.
   */
  @Cron('0 0 8,12,17,20 * * *', { name: 'tasa-bcv', timeZone: 'America/Caracas' })
  async tareaProgramada() {
    if (this.habilitado) await this.sincronizar();
  }

  /** Solo consulta y lee la página; no guarda nada. */
  async consultar(): Promise<TasaBcv> {
    const url = this.config.get<string>('BCV_URL', 'https://www.bcv.org.ve/');
    const tlsInseguro = this.config.get<string>('BCV_TLS_INSEGURO', 'false') === 'true';
    const html = await descargarHtml(url, { tlsInseguro, caExtra: this.leerCertificadoExtra() });
    try {
      return parsearPaginaBcv(html);
    } catch (e) {
      // Guardar lo descargado para poder ajustar el lector si el BCV cambia su página
      const ruta = 'logs/bcv-ultima-respuesta.html';
      try {
        mkdirSync('logs', { recursive: true });
        writeFileSync(ruta, html, 'utf8');
      } catch {
        /* si no se puede guardar, se informa igual el error original */
      }
      const motivo = e instanceof Error ? e.message : String(e);
      throw new Error(`${motivo}. HTML descargado guardado en ${ruta}`);
    }
  }

  /**
   * Obtiene la tasa del BCV y la guarda si corresponde.
   * Nunca lanza excepciones: devuelve el resultado para registrarlo o mostrarlo.
   */
  async sincronizar(): Promise<ResultadoSincronizacion> {
    if (!this.habilitado) return { estado: 'DESACTIVADA' };
    if (this.ejecutando) return { estado: 'EN_CURSO' };
    this.ejecutando = true;

    try {
      const resultado = await this.sincronizarInterno();
      const nivel = resultado.estado === 'ERROR' || resultado.estado === 'RECHAZADA' ? 'warn' : 'log';
      this.logger[nivel](JSON.stringify(resultado));
      return resultado;
    } finally {
      this.ejecutando = false;
    }
  }

  private async sincronizarInterno(): Promise<ResultadoSincronizacion> {
    let tasa: TasaBcv;
    try {
      tasa = await this.consultar();
    } catch (e) {
      return { estado: 'ERROR', mensaje: e instanceof Error ? e.message : String(e) };
    }

    // --- Validaciones de cordura: mejor no guardar que guardar un dato malo ---
    if (!esFechaValida(tasa.fecha)) {
      return { estado: 'RECHAZADA', mensaje: `Fecha leída inválida: ${tasa.fecha}` };
    }
    const desfase = diasEntre(fechaHoyNegocio(), tasa.fecha);
    // La fecha valor puede ser el próximo día hábil (hasta 4 días tras un feriado largo)
    if (desfase > 7 || desfase < -30) {
      return { estado: 'RECHAZADA', mensaje: `Fecha valor fuera de rango: ${tasa.fecha}` };
    }

    const valor = new Prisma.Decimal(tasa.bsPorUsd).toDecimalPlaces(4);
    if (valor.lte(0)) {
      return { estado: 'RECHAZADA', mensaje: `Valor leído no válido: ${tasa.bsPorUsd}` };
    }

    const fechaDb = aFechaDb(tasa.fecha);

    // --- Nunca sobrescribir una tasa existente (manual o automática) ---
    const existente = await this.prisma.tasaCambio.findUnique({ where: { fecha: fechaDb } });
    if (existente) {
      return {
        estado: 'YA_EXISTE',
        fecha: tasa.fecha,
        fuente: existente.fuente,
        bsPorUsd: existente.bsPorUsd.toString(),
      };
    }

    // --- Comparar con la tasa anterior: un salto enorme suele ser un error de lectura ---
    const maxVariacion = new Prisma.Decimal(this.config.get<string>('BCV_MAX_VARIACION', '0.3'));
    const anterior = await this.prisma.tasaCambio.findFirst({
      where: { fecha: { lt: fechaDb } },
      orderBy: { fecha: 'desc' },
    });
    if (anterior) {
      const variacion = valor.minus(anterior.bsPorUsd).abs().div(anterior.bsPorUsd);
      if (variacion.gt(maxVariacion)) {
        return {
          estado: 'RECHAZADA',
          mensaje:
            `Variación de ${variacion.times(100).toFixed(1)}% respecto a la tasa del ` +
            `${deFechaDb(anterior.fecha)} (${anterior.bsPorUsd.toString()}). ` +
            `Leído: ${valor.toString()}. Regístrala a mano si es correcta.`,
        };
      }
    }

    try {
      await this.prisma.tasaCambio.create({
        data: {
          fecha: fechaDb,
          bsPorUsd: valor,
          fuente: 'BCV',
          usuarioId: this.usuarioSistemaId ?? (await this.asegurarUsuarioSistema()),
        },
      });
    } catch (e) {
      // Alguien la registró a mano justo en este momento
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const ya = await this.prisma.tasaCambio.findUniqueOrThrow({ where: { fecha: fechaDb } });
        return { estado: 'YA_EXISTE', fecha: tasa.fecha, fuente: ya.fuente, bsPorUsd: ya.bsPorUsd.toString() };
      }
      throw e;
    }

    return { estado: 'REGISTRADA', fecha: tasa.fecha, bsPorUsd: valor.toString() };
  }

  /**
   * Lee el certificado intermedio del BCV (ruta en BCV_CA_CERT).
   * Se lee en cada consulta: si se reemplaza el archivo no hay que reiniciar.
   */
  private leerCertificadoExtra(): string | undefined {
    const ruta = this.config.get<string>('BCV_CA_CERT');
    if (!ruta) return undefined;
    try {
      const pem = readFileSync(ruta, 'utf8');
      if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
        throw new Error('el archivo no está en formato PEM (Base64)');
      }
      return pem;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      throw new Error(`No se pudo leer BCV_CA_CERT (${ruta}): ${motivo}`);
    }
  }

  /** Crea (o garantiza inactivo) el usuario interno "sistema". */
  private async asegurarUsuarioSistema(): Promise<number> {
    const usuario = await this.prisma.usuario.upsert({
      where: { usuario: USUARIO_SISTEMA },
      update: { activo: false },
      create: {
        nombre: 'Sistema (automático)',
        usuario: USUARIO_SISTEMA,
        // Clave aleatoria que nadie conoce; además el usuario está inactivo
        passwordHash: await hash(randomBytes(32).toString('hex'), BCRYPT_COSTO),
        rol: 'VENDEDOR',
        activo: false,
      },
    });
    this.usuarioSistemaId = usuario.id;
    return usuario.id;
  }
}
