-- AlterEnum
ALTER TYPE "TipoMovimiento" ADD VALUE 'TRASPASO_SALIDA';

-- AlterTable
ALTER TABLE "movimientos_inventario" ADD COLUMN     "traspaso_id" INTEGER;

-- CreateTable
CREATE TABLE "traspasos" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ubicacion_id" INTEGER NOT NULL,
    "departamento" VARCHAR(150) NOT NULL,
    "hermana_encargada" VARCHAR(150) NOT NULL,
    "autorizado_por" VARCHAR(100),
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "traspasos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traspaso_detalle" (
    "id" SERIAL NOT NULL,
    "traspaso_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "valor_ref_usd" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "traspaso_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "traspasos_fecha_idx" ON "traspasos"("fecha");

-- CreateIndex
CREATE INDEX "traspaso_detalle_traspaso_id_idx" ON "traspaso_detalle"("traspaso_id");

-- CreateIndex
CREATE INDEX "traspaso_detalle_producto_id_idx" ON "traspaso_detalle"("producto_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_traspaso_id_idx" ON "movimientos_inventario"("traspaso_id");

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_traspaso_id_fkey" FOREIGN KEY ("traspaso_id") REFERENCES "traspasos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspaso_detalle" ADD CONSTRAINT "traspaso_detalle_traspaso_id_fkey" FOREIGN KEY ("traspaso_id") REFERENCES "traspasos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traspaso_detalle" ADD CONSTRAINT "traspaso_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
