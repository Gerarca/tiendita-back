import { EstadoVenta } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { RangoFechasDto } from '../../common/paginacion.dto.js';
import { Recortar } from '../../common/transformaciones.js';

export class ListarVentasDto extends RangoFechasDto {
  @IsOptional()
  @IsEnum(EstadoVenta)
  estado?: EstadoVenta;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;

  /** Busca por N° de control, nombre o documento del cliente. */
  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(100)
  buscar?: string;
}
