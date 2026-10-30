# Traslado y configuración

La app usa Apps Script como backend y Supabase como única base de datos operativa. La migración de datos ya se completó; el código de migración y las utilidades de Google Sheets se han retirado. No vuelvas a ejecutar una migración ni `supabase/schema.sql` al trasladar el proyecto.

## Publicación en DEV y PRO

Las publicaciones normales usan el flujo local controlado descrito en [`docs/publicacion.md`](publicacion.md). No cambies manualmente `SUPABASE_ENV` ni `SUPABASE_EXPECTED_URL` para publicar: el builder fija entorno y URL esperada solo en la copia de cada build, y actualiza las implementaciones DEV/PRO existentes sin cambiar sus URL `/exec`.

Configura en **Configuración del proyecto → Propiedades del script** las URL y claves DEV/PRO indicadas en la guía de publicación. Las propiedades son compartidas por ambas implementaciones; el código de cada versión selecciona su entorno y el backend rechaza una URL que no coincida con la esperada. Nunca guardes una Secret key en código, HTML ni Git.

Usa la implementación web `/exec` de DEV para revisar la publicación de desarrollo. `/dev` ejecuta el código de desarrollo del editor y ya no es el flujo principal de revisión; el código fuente queda fail-closed como `UNPUBLISHED`. La herramienta no publica automáticamente al hacer push ni ejecuta SQL o cambios en Supabase.

## Crear una base de desarrollo vacía

1. En Supabase Dashboard, crea un proyecto nuevo para desarrollo. Guarda la contraseña de PostgreSQL en un gestor de secretos.
2. En la configuración/API del proyecto, copia la Project URL, la Secret key y la Publishable key.
3. Abre el SQL Editor y ejecuta el contenido completo de `supabase/schema.sql`. Crea las diez tablas del dominio y la tabla privada `Administradores`, índices, RLS y permisos de `service_role`; no inserta datos de negocio.
4. Ejecuta después el contenido completo de `supabase/realtime.sql`. Crea `app_sync_state`, sus triggers y la publicación Realtime. Inserta deliberadamente una única fila técnica en `app_sync_state`; las tablas del dominio permanecen vacías.
5. En las Script Properties, configura las tres propiedades `SUPABASE_DEV_*` anteriores con los datos de este proyecto. Configura también las tres `SUPABASE_PRO_*` cuando tengas los datos del proyecto productivo. No reutilices las claves entre proyectos.
6. Sigue [`docs/publicacion.md`](publicacion.md) para configurar y publicar la implementación DEV existente mediante la CLI; valida en Table Editor que hay cero filas en las diez tablas de negocio y una fila en `app_sync_state`. El código `/dev` del editor no es el flujo de revisión.
7. En bases ya existentes, ejecuta `supabase/metricas.sql` (idempotente) antes de publicar la versión de estadísticas: añade las columnas de cancelación, primer registro, altas/bajas y minutos de retraso que `Schema.gs` envía en cada alta.
8. Ejecuta también `supabase/perfil.sql` (idempotente) antes de publicar la versión con pantalla de Perfil y bienvenida: añade `Entrenadores.FotoURL` y `Jugadores.BienvenidaVista`.

La tabla `Administradores` es privada y el servidor la consulta para validar correo y PIN; no hay correos ni PIN de administrador en el código. Para sembrar la cuenta inicial, temporada y migrar administradores antiguos, ejecuta `supabase/bootstrap-pro.sql` en la base PRO después de `schema.sql`. Antes de ejecutarlo, reemplaza `__INTRODUCIR_PIN_ADMIN__` por el PIN solicitado directamente en SQL Editor y no guardes esa copia en Git. El script crea o activa `CB Baeza Baloncesto 2026-2027`, del 1 de septiembre de 2026 al 30 de junio de 2027, y habilita `vnpablo2002@gmail.com` como administrador. Después de añadir la tabla, vuelve a ejecutar `supabase/realtime.sql` para instalar también su trigger de sincronización.

El PIN se guarda en una tabla accesible únicamente con `service_role`, pero un PIN de cuatro cifras sigue siendo débil ante intentos repetidos. Conviene cambiarlo por uno más largo y limitar el acceso a las propiedades secretas de Apps Script.

## Llevar el proyecto a otra cuenta

1. Copia los archivos del proyecto Apps Script a la cuenta de destino, incluidos `src/`, `ui/` y `appsscript.json`. Mantén `Schema.gs`, que declara las tablas y columnas permitidas por `DataAccess.gs`.
2. Si vas a conservar la misma base de datos, configura en **Configuración del proyecto → Propiedades del script** las URL, Secret keys y Publishable keys de ambos entornos DEV y PRO, siguiendo [`docs/publicacion.md`](publicacion.md). Las versiones publicadas seleccionan su entorno; la fuente no se edita manualmente para cambiarlo. No pongas keys en HTML ni en el repositorio. Si es un Supabase nuevo y vacío, sigue primero los pasos de «Crear una base de desarrollo vacía».
3. Registra las cuentas administrativas en la tabla `Administradores` de la base activa usando SQL Editor; no se configuran administradores en `src/Config.gs`.
4. El flujo local de publicación de este repositorio está fijado al Script ID actual y no migra implementaciones a otro proyecto. Si la transferencia implica crear otro proyecto Apps Script, planifica ese cambio como un cutover independiente; no uses el flujo normal de publicación hasta que el destino esté configurado intencionalmente. Para una nueva implementación, configura **Ejecutar como: usuario que implementa** y el acceso requerido, y autoriza las solicitudes de UrlFetch y correo que muestra Google.
5. Configura el trigger semanal desde **Activadores** en la cuenta nueva para `triggerGenerarSesiones`, si se desea generación automática. Los activadores y las propiedades del script no se copian con los archivos.
6. Prueba inicio de sesión, carga de datos, guardado de asistencia y notificaciones antes de retirar la implementación anterior. Desactiva el trigger anterior al completar el cambio para evitar ejecuciones duplicadas.

Si se conserva el mismo proyecto Supabase, los datos y la configuración SQL de Realtime permanecen allí; no hace falta copiar tablas ni volver a ejecutar SQL. El bootstrap entrega al navegador solo la URL y Publishable key del entorno de la versión desplegada; la Secret key de backend permanece en Script Properties. Si se retira el acceso de la cuenta anterior, revoca o rota las credenciales que tenía configuradas.

## Seguridad y sincronización

La SPA escucha solo `public.app_sync_state` vía Supabase Realtime. Al recibir una señal, solicita `cargarDatos(auth)` a Apps Script, que aplica el filtrado de datos por rol. No suscribas el navegador a las tablas de negocio: contienen PIN, códigos familiares y datos personales. El navegador solo debe usar la clave publishable; la Secret key de Apps Script omite RLS y permite operaciones privilegiadas.

Si Realtime no conecta, la SPA usa una comprobación de respaldo cada 30 segundos. Los cambios se agrupan y se aplazan mientras el usuario edita formularios, asistencia o un modal. Apps Script sigue siendo el backend, por lo que conserva sus límites de ejecución y latencia.