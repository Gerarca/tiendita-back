import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Recortar } from '../../common/transformaciones.js';

export class DetalleRegaloDto {
  @IsInt()
  productoId!: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  @Max(10_000)
  cantidad!: number;
}

export class RegistrarRegaloDto {
  /** Persona o institución que recibe. */
  @Recortar()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  beneficiario!: string;

  @Recortar()
  @IsString()
  @MinLength(3, { message: 'Indica el motivo del regalo' })
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(100)
  autorizadoPor?: string;

  /** Si un producto aparece dos veces, se suman las cantidades. */
  @IsArray()
  @ArrayMinSize(1, { message: 'El regalo debe tener al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetalleRegaloDto)
  detalles!: DetalleRegaloDto[];
}
