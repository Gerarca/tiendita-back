-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "aplica_iva" BOOLEAN NOT NULL DEFAULT false;

-- =============================================================
-- Productos que ya existían: toman el IVA de la voz fiscal que tenían
-- (la propia o la de su categoría). Así no pasan todos a "exento".
-- Los que no tenían voz quedan sin IVA (el valor por defecto).
--
--   1) npx prisma migrate dev --create-only --name aplica_iva
--   2) Abrir el migration.sql generado: ya trae el ALTER TABLE que crea
--      la columna. Pegar ESTE contenido al final, debajo de ese ALTER.
--   3) npx prisma migrate dev
-- =============================================================

UPDATE productos AS p
SET aplica_iva = NOT vf.exento_iva
FROM categorias c, voces_fiscales vf
WHERE c.id = p.categoria_id
  AND vf.id = COALESCE(p.voz_fiscal_id, c.voz_fiscal_id);
