-- Los usuarios ya no pueden desactivar la monetización: se reactiva en todas las cuentas.
-- (El campo se conserva para que el operador pueda suspenderla en casos de fraude.)
UPDATE "User" SET "monetizationEnabled" = true WHERE "monetizationEnabled" = false;
