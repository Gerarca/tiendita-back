import { Module } from '@nestjs/common';
import { CuentasController } from './cuentas.controller.js';
import { CuentasService } from './cuentas.service.js';

@Module({ controllers: [CuentasController], providers: [CuentasService] })
export class CuentasModule {}
