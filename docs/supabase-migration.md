# Traslado y configuración

La app usa Apps Script como backend y Supabase como única base de datos operativa. La migración de datos ya se completó; el código de migración y las utilidades de Google Sheets se han retirado. No vuelvas a ejecutar una migración ni `supabase/schema.sql` al trasladar el proyecto.

## Entornos DEV y PRO por versión

`src/Config.gs` contiene `SUPABASE_ENV`, que se incorpora al código de cada versión (`DEV` o `PRO`). Apps Script comparte Script Properties entre sus despliegues, pero cada despliegue publicado conserva la versión que se le asignó. Por eso `/dev` puede apuntar a la base DEV mientras la implementación productiva publicada sigue apuntando a PRO, siempre que no se actualice esa implementación con una versión DEV.

Configura en **Configuración del proyecto → Propiedades del script** estas claves para cada proyecto Supabase:

| Propiedad | Valor |
|---|---|
| `SUPABASE_DEV_URL` | URL del proyecto Supabase de desarrollo |
| `SUPABASE_DEV_SECRET_KEY` | Secret key del proyecto de desarrollo (`sb_secret_...`) |
| `SUPABASE_DEV_PUBLISHABLE_KEY` | Publishable key del proyecto de desarrollo, usada solo por Realtime en el navegador |
| `SUPABASE_PRO_URL` | URL del proyecto Supabase productivo |
| `SUPABASE_PRO_SECRET_KEY` | Secret key del proyecto productivo (`sb_secret_...`) |
| `SUPABASE_PRO_PUBLISHABLE_KEY` | Publishable key del proyecto productivo, usada solo por Realtime en el navegador |

Las propiedades DEV y PRO pueden coexistir en el mismo proyecto Apps Script. No pongas ninguna Secret key en `Config.gs`, HTML ni en Git. El backend selecciona el URL y Secret key de acuerdo con `SUPABASE_ENV`; el bootstrap entrega al navegador solo el URL y la Publishable key del mismo entorno. Sin Publishable key, la app sigue actualizando con su consulta de respaldo cada 30 segundos.

Flujo de publicación:

1. Mantén `SUPABASE_ENV = 'DEV'`, guarda el código y valida la aplicación mediante `/dev`.
2. Cuando quieras publicar, cambia `SUPABASE_ENV` a `'PRO'`, guarda y crea una versión nueva.
3. Actualiza la implementación productiva para que use esa versión PRO.
4. Vuelve el código fuente a `'DEV'` y guárdalo. `/dev` usará la base DEV; la implementación productiva seguirá en la versión PRO asignada.

No actualices el despliegue productivo mientras el código que vas a publicar tenga `SUPABASE_ENV = 'DEV'`. Si falta la URL o Secret key del entorno seleccionado, el backend falla explícitamente en lugar de caer a una conexión genérica.

## Crear una base de desarrollo vacía

1. En Supabase Dashboard, crea un proyecto nuevo para desarrollo. Guarda la contraseña de PostgreSQL en un gestor de secretos.
2. En la configuración/API del proyecto, copia la Project URL, la Secret key y la Publishable key.
3. Abre el SQL Editor y ejecuta el contenido completo de `supabase/schema.sql`. Crea las diez tablas del dominio, índices, RLS y permisos de `service_role`; no inserta datos de negocio.
4. Ejecuta después el contenido completo de `supabase/realtime.sql`. Crea `app_sync_state`, sus triggers y la publicación Realtime. Inserta deliberadamente una única fila técnica en `app_sync_state`; las diez tablas de negocio permanecen vacías.
5. En las Script Properties, configura las tres propiedades `SUPABASE_DEV_*` anteriores con los datos de este proyecto. Configura también las tres `SUPABASE_PRO_*` cuando tengas los datos del proyecto productivo. No reutilices las claves entre proyectos.
6. Deja `SUPABASE_ENV = 'DEV'`, guarda el código y abre la implementación `/dev`. Comprueba en Table Editor que hay cero filas en las diez tablas de negocio y una fila en `app_sync_state`.

La app permite el primer acceso a la base vacía mediante uno de los correos estáticos de `CONFIG.ADMIN_EMAILS` y `CONFIG.ADMIN_MASTER_PIN` en `src/Config.gs`; el valor actual del PIN maestro es `0000`. Úsalo solo para arrancar DEV y cambia el PIN en el código antes de crear una versión productiva. Desde ese acceso de admin podrás crear temporada, equipos y el resto de datos iniciales desde la propia aplicación, sin scripts de semillas.

## Llevar el proyecto a otra cuenta

1. Copia los archivos del proyecto Apps Script a la cuenta de destino, incluidos `src/`, `ui/` y `appsscript.json`. Mantén `Schema.gs`, que declara las tablas y columnas permitidas por `DataAccess.gs`.
2. Si vas a conservar la misma base de datos, configura en **Configuración del proyecto → Propiedades del script** las propiedades de URL, Secret key y Publishable key del entorno seleccionado en `src/Config.gs`. La clave de servidor debe ser una Secret key (`sb_secret_...`), nunca la Publishable key, y no debe ponerse en HTML ni en el repositorio. Si es un Supabase nuevo y vacío, sigue primero los pasos de «Crear una base de desarrollo vacía».
3. Revisa `ADMIN_EMAILS` en `src/Config.gs` y añade el correo que deba tener rol administrador. Si se usa `ADMIN_MASTER_PIN`, cámbialo por un PIN privado y seguro.
4. Crea una implementación de tipo **Aplicación web** con **Ejecutar como: usuario que implementa** y acceso **Cualquiera**. Autoriza las solicitudes de UrlFetch y correo que muestra Google.
5. Configura el trigger semanal desde **Activadores** en la cuenta nueva para `triggerGenerarSesiones`, si se desea generación automática. Los activadores y las propiedades del script no se copian con los archivos.
6. Prueba inicio de sesión, carga de datos, guardado de asistencia y notificaciones antes de retirar la implementación anterior. Desactiva el trigger anterior al completar el cambio para evitar ejecuciones duplicadas.

Si se conserva el mismo proyecto Supabase, los datos y la configuración SQL de Realtime permanecen allí; no hace falta copiar tablas ni volver a ejecutar SQL. Las propiedades de URL y Publishable key del entorno seleccionado se leen desde Script Properties y se entregan al navegador en el bootstrap; la Secret key de backend solo debe estar en las propiedades del script. Si se retira el acceso de la cuenta anterior, revoca o rota las credenciales que tenía configuradas.

## Seguridad y sincronización

La SPA escucha solo `public.app_sync_state` vía Supabase Realtime. Al recibir una señal, solicita `cargarDatos(auth)` a Apps Script, que aplica el filtrado de datos por rol. No suscribas el navegador a las tablas de negocio: contienen PIN, códigos familiares y datos personales. El navegador solo debe usar la clave publishable; la Secret key de Apps Script omite RLS y permite operaciones privilegiadas.

Si Realtime no conecta, la SPA usa una comprobación de respaldo cada 30 segundos. Los cambios se agrupan y se aplazan mientras el usuario edita formularios, asistencia o un modal. Apps Script sigue siendo el backend, por lo que conserva sus límites de ejecución y latencia.