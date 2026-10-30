import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Imágenes de productos: /uploads/productos/xxx.jpg (fuera de /api y sin login,
  // porque una etiqueta <img> no puede enviar el token)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/', index: false, maxAge: '7d' });

  // whitelist: descarta campos que no estén en el DTO
  // forbidNonWhitelisted: y además responde 400 si los envían
  // transform: convierte el body a la clase del DTO (necesario para @Transform)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Solo para desarrollo con Next en otro puerto.
  // En producción Next se servirá desde Nest y CORS no hará falta.
  app.enableCors({ origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000') });

  const port = Number(config.get('PORT', 3001));
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api`);
}
void bootstrap();
