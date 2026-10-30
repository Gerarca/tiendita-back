import { TipoCuenta } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Recortar } from '../../common/transformaciones.js';

export class CrearCuentaDto {
  @Recortar() @IsString() @IsNotEmpty() @MaxLength(60) banco!: string;
  /** Nombre corto que verán en caja. Ej.: "Provincial Jurídico" */
  @Recortar() @IsString() @IsNotEmpty() @MaxLength(80) nombre!: string;
  @Recortar() @IsString() @IsNotEmpty() @MaxLength(150) titular!: string;
  @IsEnum(TipoCuenta) tipo!: TipoCuenta;
  /** Solo los últimos 4 dígitos: no hace falta guardar el número completo. */
  @IsOptional() @Matches(/^\d{4}$/, { message: 'ultimosDigitos debe tener 4 dígitos' }) ultimosDigitos?: string;
}

export class ActualizarCuentaDto {
  @IsOptional() @Recortar() @IsString() @IsNotEmpty() @MaxLength(60) banco?: string;
  @IsOptional() @Recortar() @IsString() @IsNotEmpty() @MaxLength(80) nombre?: string;
  @IsOptional() @Recortar() @IsString() @IsNotEmpty() @MaxLength(150) titular?: string;
  @IsOptional() @IsEnum(TipoCuenta) tipo?: TipoCuenta;
  @IsOptional() @Matches(/^\d{4}$/, { message: 'ultimosDigitos debe tener 4 dígitos' }) ultimosDigitos?: string | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}
