import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { AnularVentaDto } from './dto/anular-venta.dto.js';
import { ListarVentasDto } from './dto/listar-ventas.dto.js';
import { CotizarVentaDto, RegistrarVentaDto } from './dto/registrar-venta.dto.js';
import { VentasService } from './ventas.service.js';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  /** GET /api/ventas?desde=2026-10-01&hasta=2026-10-31&estado=ACTIVA&buscar=ulacio */
  @Get()
  listar(@Query() query: ListarVentasDto) {
    return this.ventas.listar(query);
  }

  /** GET /api/ventas/numero/20260001 */
  @Get('numero/:numeroControl')
  porNumero(@Param('numeroControl') numeroControl: string) {
    return this.ventas.porNumeroControl(numeroControl);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.ventas.obtener(id);
  }

  /** POST /api/ventas/cotizar — totales en $ y Bs sin guardar nada */
  @Post('cotizar')
  @HttpCode(200)
  cotizar(@Body() dto: CotizarVentaDto) {
    return this.ventas.cotizar(dto);
  }

  @Post()
  registrar(@Body() dto: RegistrarVentaDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.ventas.registrar(dto, usuario);
  }

  /** POST /api/ventas/:id/anular — devuelve el stock; la venta queda en el historial */
  @Roles('ADMIN')
  @Post(':id/anular')
  @HttpCode(200)
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularVentaDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.ventas.anular(id, dto, usuario);
  }
}
