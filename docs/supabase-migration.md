# Traslado y configuración

La app usa Apps Script como backend y Supabase como única base de datos operativa. La migración de datos ya se completó; el código de migración y las utilidades de Google Sheets se han retirado. No vuelvas a ejecutar una migración ni `supabase/schema.sql` al trasladar el proyecto.

## Llevar el proyecto a otra cuenta

1. Copia los archivos del proyecto Apps Script a la cuenta de destino, incluidos `src/`, `ui/` y `appsscript.json`. Mantén `Schema.gs`, que declara las tablas y columnas permitidas por `DataAccess.gs`.
2. En el proyecto nuevo, configura en **Configuración del proyecto → Propiedades del script** `SUPABASE_URL` y `SUPABASE_SECRET_KEY`, usando el mismo proyecto Supabase. La clave debe ser una Secret key (`sb_secret_...`), nunca la publishable key, y no debe ponerse en HTML ni en el repositorio.
3. Revisa `ADMIN_EMAILS` en `src/Config.gs` y añade el correo que deba tener rol administrador. Si se usa `ADMIN_MASTER_PIN`, cámbialo por un PIN privado y seguro.
4. Crea una implementación de tipo **Aplicación web** con **Ejecutar como: usuario que implementa** y acceso **Cualquiera**. Autoriza las solicitudes de UrlFetch y correo que muestra Google.
5. Configura el trigger semanal desde **Activadores** en la cuenta nueva para `triggerGenerarSesiones`, si se desea generación automática. Los activadores y las propiedades del script no se copian con los archivos.
6. Prueba inicio de sesión, carga de datos, guardado de asistencia y notificaciones antes de retirar la implementación anterior. Desactiva el trigger anterior al completar el cambio para evitar ejecuciones duplicadas.

Si se conserva el mismo proyecto Supabase, los datos y la configuración SQL de Realtime permanecen allí; no hace falta copiar tablas ni volver a ejecutar SQL. La URL y la clave publishable de Realtime están en `ui/app.html`; la clave secreta de backend solo debe estar en las propiedades del script. Si se retira el acceso de la cuenta anterior, revoca o rota las credenciales que tenía configuradas.

## Seguridad y sincronización

La SPA escucha solo `public.app_sync_state` vía Supabase Realtime. Al recibir una señal, solicita `cargarDatos(auth)` a Apps Script, que aplica el filtrado de datos por rol. No suscribas el navegador a las tablas de negocio: contienen PIN, códigos familiares y datos personales. El navegador solo debe usar la clave publishable; la Secret key de Apps Script omite RLS y permite operaciones privilegiadas.

Si Realtime no conecta, la SPA usa una comprobación de respaldo cada 30 segundos. Los cambios se agrupan y se aplazan mientras el usuario edita formularios, asistencia o un modal. Apps Script sigue siendo el backend, por lo que conserva sus límites de ejecución y latencia.