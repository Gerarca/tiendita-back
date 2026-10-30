import { TipoDocumento } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Mayusculas, Recortar } from '../../common/transformaciones.js';

/**
 * Cliente de una venta. Tres formas de enviarlo:
 *  1. { clienteId }                         → cliente ya registrado
 *  2. { tipoDocumento, numeroDocumento, nombre, ... } → lo busca por documento;
 *     si existe actualiza sus datos de contacto, si no, lo crea
 *  3. omitirlo                              → CONSUMIDOR FINAL
 */
export class DatosClienteDto {
  @IsOptional()
  @IsInt()
  clienteId?: number;

  @IsOptional()
  @Mayusculas()
  @IsEnum(TipoDocumento, { message: 'tipoDocumento debe ser V, E, J, G o P' })
  tipoDocumento?: TipoDocumento;

  /** Acepta "17.572.853" o "17572853": se guardan solo los dígitos. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{6,10}$/, { message: 'El número de documento debe tener entre 6 y 10 dígitos' })
  numeroDocumento?: string;

  @IsOptional()
  @Mayusculas()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @Mayusculas()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @Mayusculas()
  @IsString()
  @MaxLength(80)
  ciudad?: string;

  /** Estado geográfico (LARA, PORTUGUESA...) */
  @IsOptional()
  @Mayusculas()
  @IsString()
  @MaxLength(50)
  estado?: string;
}
