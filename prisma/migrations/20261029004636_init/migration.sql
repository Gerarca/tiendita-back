-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('V', 'E', 'J', 'G', 'P');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('INGRESO', 'VENTA', 'ANULACION_VENTA', 'REGALO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('ACTIVA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('TARJETA', 'PAGO_MOVIL', 'TRANSFERENCIA', 'EFECTIVO_BS', 'EFECTIVO_USD');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('BS', 'USD');

-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('JURIDICA', 'NATURAL');

-- CreateEnum
CREATE TYPE "FuenteTasa" AS ENUM ('BCV', 'MANUAL');

-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('CREAR', 'ACTUALIZAR', 'ANULAR', 'DESACTIVAR');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "usuario" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'VENDEDOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "padre_id" INTEGER,
    "prefijo_codigo" VARCHAR(10),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "categoria_id" INTEGER NOT NULL,
    "precio_usd" DECIMAL(12,2) NOT NULL,
    "imagen_url" VARCHAR(255),
    "stock_minimo" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_precios" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "precio_anterior" DECIMAL(12,2) NOT NULL,
    "precio_nuevo" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "historial_precios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencias" (
    "producto_id" INTEGER NOT NULL,
    "ubicacion_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "existencias_pkey" PRIMARY KEY ("producto_id","ubicacion_id")
);

-- CreateTable
CREATE TABLE "movimientos_inventario" (
    "id" BIGSERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "ubicacion_id" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "saldo_resultante" INTEGER NOT NULL,
    "venta_id" INTEGER,
    "ingreso_id" INTEGER,
    "regalo_id" INTEGER,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" INTEGER NOT NULL,
    "nota" TEXT,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresos" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ubicacion_id" INTEGER NOT NULL,
    "proveedor" VARCHAR(150),
    "nota" TEXT,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "ingresos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingreso_detalle" (
    "id" SERIAL NOT NULL,
    "ingreso_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unit_usd" DECIMAL(12,2),

    CONSTRAINT "ingreso_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regalos" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ubicacion_id" INTEGER NOT NULL,
    "beneficiario" VARCHAR(150) NOT NULL,
    "motivo" TEXT NOT NULL,
    "autorizado_por" VARCHAR(100),
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "regalos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regalo_detalle" (
    "id" SERIAL NOT NULL,
    "regalo_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "valor_ref_usd" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "regalo_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasas_cambio" (
    "fecha" DATE NOT NULL,
    "bs_por_usd" DECIMAL(14,4) NOT NULL,
    "fuente" "FuenteTasa" NOT NULL DEFAULT 'MANUAL',
    "usuario_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasas_cambio_pkey" PRIMARY KEY ("fecha")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "tipo_documento" "TipoDocumento",
    "numero_documento" VARCHAR(15),
    "nombre" VARCHAR(150) NOT NULL,
    "telefono" VARCHAR(20),
    "direccion" VARCHAR(200),
    "ciudad" VARCHAR(80),
    "estado" VARCHAR(50),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "numero_control" VARCHAR(12) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cliente_id" INTEGER NOT NULL,
    "ubicacion_id" INTEGER NOT NULL,
    "tasa_aplicada" DECIMAL(14,4) NOT NULL,
    "total_usd" DECIMAL(12,2) NOT NULL,
    "total_bs" DECIMAL(14,2) NOT NULL,
    "pagado_usd" DECIMAL(12,2) NOT NULL,
    "pagado_bs" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'ACTIVA',
    "motivo_anulacion" TEXT,
    "anulada_por_id" INTEGER,
    "anulada_en" TIMESTAMPTZ(6),
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_detalle" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "codigo_producto" VARCHAR(20) NOT NULL,
    "nombre_producto" VARCHAR(150) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unit_usd" DECIMAL(12,2) NOT NULL,
    "subtotal_usd" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "venta_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_bancarias" (
    "id" SERIAL NOT NULL,
    "banco" VARCHAR(60) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "titular" VARCHAR(150) NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "ultimos_digitos" VARCHAR(4),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cuentas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "monto_usd" DECIMAL(12,2) NOT NULL,
    "monto_bs" DECIMAL(14,2) NOT NULL,
    "cuenta_id" INTEGER,
    "referencia" VARCHAR(30),

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlativos" (
    "anio" INTEGER NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "correlativos_pkey" PRIMARY KEY ("anio")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "tabla" VARCHAR(50) NOT NULL,
    "registro_id" VARCHAR(50) NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "datos_antes" JSONB,
    "datos_despues" JSONB,
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "usuarios"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_padre_id_nombre_key" ON "categorias"("padre_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_key" ON "productos"("codigo");

-- CreateIndex
CREATE INDEX "productos_categoria_id_idx" ON "productos"("categoria_id");

-- CreateIndex
CREATE INDEX "productos_nombre_idx" ON "productos"("nombre");

-- CreateIndex
CREATE INDEX "historial_precios_producto_id_fecha_idx" ON "historial_precios"("producto_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_nombre_key" ON "ubicaciones"("nombre");

-- CreateIndex
CREATE INDEX "movimientos_inventario_producto_id_fecha_idx" ON "movimientos_inventario"("producto_id", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_inventario_fecha_idx" ON "movimientos_inventario"("fecha");

-- CreateIndex
CREATE INDEX "movimientos_inventario_venta_id_idx" ON "movimientos_inventario"("venta_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_ingreso_id_idx" ON "movimientos_inventario"("ingreso_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_regalo_id_idx" ON "movimientos_inventario"("regalo_id");

-- CreateIndex
CREATE INDEX "ingresos_fecha_idx" ON "ingresos"("fecha");

-- CreateIndex
CREATE INDEX "ingreso_detalle_ingreso_id_idx" ON "ingreso_detalle"("ingreso_id");

-- CreateIndex
CREATE INDEX "ingreso_detalle_producto_id_idx" ON "ingreso_detalle"("producto_id");

-- CreateIndex
CREATE INDEX "regalos_fecha_idx" ON "regalos"("fecha");

-- CreateIndex
CREATE INDEX "regalo_detalle_regalo_id_idx" ON "regalo_detalle"("regalo_id");

-- CreateIndex
CREATE INDEX "regalo_detalle_producto_id_idx" ON "regalo_detalle"("producto_id");

-- CreateIndex
CREATE INDEX "clientes_nombre_idx" ON "clientes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tipo_documento_numero_documento_key" ON "clientes"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_numero_control_key" ON "ventas"("numero_control");

-- CreateIndex
CREATE INDEX "ventas_fecha_idx" ON "ventas"("fecha");

-- CreateIndex
CREATE INDEX "ventas_cliente_id_idx" ON "ventas"("cliente_id");

-- CreateIndex
CREATE INDEX "ventas_estado_fecha_idx" ON "ventas"("estado", "fecha");

-- CreateIndex
CREATE INDEX "venta_detalle_venta_id_idx" ON "venta_detalle"("venta_id");

-- CreateIndex
CREATE INDEX "venta_detalle_producto_id_idx" ON "venta_detalle"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_bancarias_nombre_key" ON "cuentas_bancarias"("nombre");

-- CreateIndex
CREATE INDEX "pagos_venta_id_idx" ON "pagos"("venta_id");

-- CreateIndex
CREATE INDEX "pagos_cuenta_id_idx" ON "pagos"("cuenta_id");

-- CreateIndex
CREATE INDEX "auditoria_tabla_registro_id_idx" ON "auditoria"("tabla", "registro_id");

-- CreateIndex
CREATE INDEX "auditoria_fecha_idx" ON "auditoria"("fecha");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_precios" ADD CONSTRAINT "historial_precios_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_precios" ADD CONSTRAINT "historial_precios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencias" ADD CONSTRAINT "existencias_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ingreso_id_fkey" FOREIGN KEY ("ingreso_id") REFERENCES "ingresos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_regalo_id_fkey" FOREIGN KEY ("regalo_id") REFERENCES "regalos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingreso_detalle" ADD CONSTRAINT "ingreso_detalle_ingreso_id_fkey" FOREIGN KEY ("ingreso_id") REFERENCES "ingresos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingreso_detalle" ADD CONSTRAINT "ingreso_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regalos" ADD CONSTRAINT "regalos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regalos" ADD CONSTRAINT "regalos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regalo_detalle" ADD CONSTRAINT "regalo_detalle_regalo_id_fkey" FOREIGN KEY ("regalo_id") REFERENCES "regalos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regalo_detalle" ADD CONSTRAINT "regalo_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_detalle" ADD CONSTRAINT "venta_detalle_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_detalle" ADD CONSTRAINT "venta_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
