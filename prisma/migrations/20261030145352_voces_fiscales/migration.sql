-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "voz_fiscal_id" INTEGER;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "voz_fiscal_id" INTEGER;

-- AlterTable
ALTER TABLE "venta_detalle" ADD COLUMN     "exento_iva" BOOLEAN,
ADD COLUMN     "voz_fiscal" VARCHAR(40);

-- CreateTable
CREATE TABLE "voces_fiscales" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "exento_iva" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "voces_fiscales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voces_fiscales_nombre_key" ON "voces_fiscales"("nombre");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_voz_fiscal_id_fkey" FOREIGN KEY ("voz_fiscal_id") REFERENCES "voces_fiscales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_voz_fiscal_id_fkey" FOREIGN KEY ("voz_fiscal_id") REFERENCES "voces_fiscales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
