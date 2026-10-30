import { MetodoPago } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DatosClienteDto } from '../../clientes/dto/datos-cliente.dto.js';
import { Recortar } from '../../common/transformaciones.js';

const DECIMAL_TEXTO = /^\d+(\.\d+)?$/;

export class DetalleVentaDto {
  @IsInt()
  productoId!: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  @Max(10_000)
  cantidad!: number;
}

export class PagoVentaDto {
  @IsEnum(MetodoPago, {
    message: 'metodo debe ser TARJETA, PAGO_MOVIL, TRANSFERENCIA, EFECTIVO_BS o EFECTIVO_USD',
  })
  metodo!: MetodoPago;

  /** En la moneda del método: dólares si es EFECTIVO_USD, bolívares en los demás. */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monto debe tener máximo 2 decimales' })
  @IsPositive({ message: 'monto debe ser mayor que cero' })
  @Max(1_000_000_000_000)
  monto!: number;

  /** Obligatoria para tarjeta, pago móvil y transferencia. No se envía en efectivo. */
  @IsOptional()
  @IsInt()
  cuentaId?: number;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(30)
  referencia?: string;
}

export class RegistrarVentaDto {
  /** Omitir = CONSUMIDOR FINAL */
  @IsOptional()
  @ValidateNested()
  @Type(() => DatosClienteDto)
  cliente?: DatosClienteDto;

  /** Si un producto aparece dos veces, se suman las cantidades. */
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaDto)
  detalles!: DetalleVentaDto[];

  /** Una forma de pago o varias (venta MIXTA). */
  @IsArray()
  @ArrayMinSize(1, { message: 'Indica al menos una forma de pago' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PagoVentaDto)
  pagos!: PagoVentaDto[];

  /**
   * Opcional: la tasa que mostraba la pantalla. Si la tasa vigente cambió
   * mientras se armaba la venta, se rechaza para que el cajero la revise.
   */
  @IsOptional()
  @Matches(DECIMAL_TEXTO, { message: 'tasaEsperada debe ser un decimal en texto, ej. "301.37"' })
  tasaEsperada?: string;

  /** Opcional: el total en $ que mostraba la pantalla (detecta cambios de precio). */
  @IsOptional()
  @Matches(DECIMAL_TEXTO, { message: 'totalUsdEsperado debe ser un decimal en texto, ej. "15.00"' })
  totalUsdEsperado?: string;
}

/** Calcula totales sin guardar nada. Los pagos son opcionales. */
export class CotizarVentaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Indica al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaDto)
  detalles!: DetalleVentaDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PagoVentaDto)
  pagos?: PagoVentaDto[];
}
