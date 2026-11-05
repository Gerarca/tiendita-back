import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { AnularVentaDto } from './dto/anular-venta.dto.js';
import { ListarVentasDto } from './dto/listar-ventas.dto.js';
import { CotizarVentaDto, RegistrarVentaDto } from './dto/registrar-venta.dto.js';
import { generarFacturaPdf } from './factura-pdf.js';
import { VentasService } from './ventas.service.js';

@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventas: VentasService,
    private readonly config: ConfigService,
  ) {}

  /** GET /api/ventas?desde=2026-10-01&hasta=2026-10-31&estado=ACTIVA&buscar=ulacio */
  @Get()
  listar(@Query() query: ListarVentasDto, @UsuarioActual() usuario: UsuarioSesion) {
    return this.ventas.listar(query, usuario);
  }

  /** GET /api/ventas/numero/20260001 */
  @Get('numero/:numeroControl')
  porNumero(@Param('numeroControl') numeroControl: string, @UsuarioActual() usuario: UsuarioSesion) {
    return this.ventas.porNumeroControl(numeroControl, usuario);
  }

  /** GET /api/ventas/:id/factura — factura en PDF (formato de la tienda) */
  @Get(':id/factura')
  async factura(
    @Param('id', ParseIntPipe) id: number,
    @UsuarioActual() usuario: UsuarioSesion,
    @Res({ passthrough: true }) res: Response,
  ) {
    const venta = await this.ventas.paraFactura(id, usuario);
    const titulo = this.config.get<string>('FACTURA_TITULO', 'TIENDITA MONASTERIO HUMOCARO');
    const pdf = await generarFacturaPdf(venta, titulo);
    res.set({
      'Content-Type': 'application/pdf',
      // inline: el navegador lo muestra para imprimir; también puede descargarse
      'Content-Disposition': `inline; filename="venta-${venta.numeroControl}.pdf"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(pdf);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioSesion) {
    return this.ventas.obtener(id, usuario);
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
