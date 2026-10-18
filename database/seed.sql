-- =====================================================================
-- Datos de ejemplo (ejecutar después de schema.sql, como dueño del esquema)
--
-- Crea una agencia de ejemplo con su configuración inicial, para desarrollo y
-- pruebas. En producción las agencias las crea el dueño de la plataforma desde
-- la web (POST /api/platform/agencies), con la misma configuración inicial.
-- Los métodos de envío, estados y roles son catálogos de la plataforma y ya
-- están en schema.sql.
-- =====================================================================

set search_path = paqueteria, public;

insert into agencias (nombre, correo_contacto, telefono)
values ('Agencia de ejemplo', 'contacto@agencia-ejemplo.test', '+505 2222 0000');

-- Lo que sigue pertenece a esa agencia (agencia_id por defecto de la sesión).
select set_config('paqueteria.agencia_id', id::text, false) from agencias where nombre = 'Agencia de ejemplo';

insert into ubicaciones (codigo, nombre, pais) values
  ('MIA', 'Bodega Miami',    'US'),
  ('MGA', 'Agencia Managua', 'NI');

insert into rutas (origen_id, destino_id, nombre)
select o.id, d.id, 'Miami → Managua'
from ubicaciones o, ubicaciones d
where o.codigo = 'MIA' and d.codigo = 'MGA';

-- EJEMPLO: tarifa aérea del documento de instrucciones (3.50 USD por libra).
-- La tarifa marítima la registra el administrador de la agencia desde la web.
insert into tarifas_envio (metodo_envio_id, precio_por_unidad, fecha_inicio)
select id, 3.50, date '2026-01-01'
from metodos_envio where codigo = 'AEREO';

select set_config('paqueteria.agencia_id', '', false);
