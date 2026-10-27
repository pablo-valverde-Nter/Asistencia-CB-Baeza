# Publicación local de Apps Script (DEV/PRO)

Esta guía es la referencia operativa para publicar esta aplicación. El flujo usa una instalación local de `clasp` y actualiza las dos implementaciones web existentes del mismo proyecto de Apps Script. No crea ni elimina implementaciones, no cambia sus URL `/exec` y no ejecuta migraciones SQL.

## Qué preparar y qué aportar

El proyecto Apps Script está fijado en el código de despliegue:

- **Script ID** (ya conocido; no es necesario que lo aportes): `1pLLShVaGOPsiQO5V6hA9xHEa7-2KqK8ta6WaTDKpmzpIys6NBcrqBybi`.
- **ID de implementación DEV** y **ID de implementación PRO** existentes. Cópialos en Apps Script, **Implementar → Gestionar implementaciones**, abriendo los detalles de cada aplicación web. Son distintos del Script ID y de la URL `/exec`. Usa las implementaciones que ya sirven las URL que quieres conservar; no crees otras.
- **URL pública del proyecto Supabase DEV** y **URL pública del proyecto Supabase PRO**, con forma `https://<referencia>.supabase.co`. Deben ser HTTPS y distintas. Son URL de proyecto, no claves.

Configura también en **Configuración del proyecto → Propiedades del script** las propiedades de ambos entornos:

| Propiedad | Valor |
|---|---|
| `SUPABASE_DEV_URL` | URL del proyecto DEV indicada en la configuración local |
| `SUPABASE_DEV_SECRET_KEY` | Secret key del proyecto DEV |
| `SUPABASE_DEV_PUBLISHABLE_KEY` | Publishable key del proyecto DEV |
| `SUPABASE_PRO_URL` | URL del proyecto PRO indicada en la configuración local |
| `SUPABASE_PRO_SECRET_KEY` | Secret key del proyecto PRO |
| `SUPABASE_PRO_PUBLISHABLE_KEY` | Publishable key del proyecto PRO |

Las URL configuradas en Script Properties deben coincidir con las URL esperadas tras la normalización que aplica el backend. Las Secret keys solo van en Script Properties. **No aportes ni guardes en Git claves Supabase, tokens de Google/clasp, credenciales ni PIN.** Para preparar el despliegue solo se necesitan los dos IDs de implementación y las dos URL públicas de Supabase; nunca se necesitan las keys.

## Requisitos e instalación

1. Usa Node.js **22 o superior** (Node 24 y npm 11 son la referencia del repositorio). Instala dependencias desde la raíz con `npm ci`; usa `npm install` si necesitas regenerar el lockfile.
2. Activa **Google Apps Script API** para la cuenta que administra el proyecto: <https://script.google.com/home/usersettings>.
3. En la rama `develop`, configura los IDs existentes y las URL públicas:

   ```text
   npm run deploy:setup -- --dev-id <ID_IMPLEMENTACION_DEV> --pro-id <ID_IMPLEMENTACION_PRO> --dev-url https://<ref-dev>.supabase.co --pro-url https://<ref-pro>.supabase.co
   ```

   `deploy.config.json` es un archivo versionado: conserva el Script ID fijo, ramas asignadas, IDs de implementaciones y URL esperadas. `null` representa un valor todavía pendiente; no lo inventes. `deploy:setup` rellena este archivo localmente, no necesita autenticación y no hace escrituras remotas. Sus datos no son secretos; no añadas claves.
4. Para `deploy:doctor` y publicaciones reales, inicia sesión con `npm exec clasp login`. Completa el acceso de Google con la cuenta que tiene permisos sobre el proyecto. La ruta `/u/1` solo selecciona un perfil del navegador: **no** autentica ni demuestra que hayas elegido la cuenta propietaria correcta. La configuración local con `deploy:setup` no requiere login.

Antes de publicar, incluye el `deploy.config.json` configurado en un commit de la rama destino y súbelo a `origin/<rama>`. Para el flujo normal, configúralo y publícalo en `develop`; llegará a `main` con la promoción fast-forward del SHA aprobado. Setup solo actualiza el archivo local: no publica, no actualiza implementaciones ni modifica Supabase. El archivo no contiene Secret keys.

Antes de una escritura remota, la herramienta vuelve a comprobar que los IDs configurados corresponden a las implementaciones existentes y que cada URL `/exec` es la esperada. Si ID o URL no coinciden, detente: no cambies la URL ni crees una implementación como solución.

## Publicar DEV

DEV es el destino predeterminado cuando se solicita publicar sin especificar entorno. La rama asignada es `develop`.

1. Revisa solo los cambios pertinentes y ejecuta `npm test` antes de preparar el commit. Una petición explícita de publicación autoriza los commits necesarios para publicar esos cambios; una petición de commit sin publicación no autoriza despliegues. Usa asunto conventional en español y añade explícitamente los archivos pertinentes, nunca todos los cambios del árbol. No incluyas cambios ajenos.
2. Publica el commit en `origin/develop`. Antes de una publicación real, la rama debe ser `develop`, el árbol de trabajo estar limpio y el SHA local estar en `origin/develop`; la herramienta hace `fetch` y comprueba esas condiciones antes de escribir remotamente.

3. Ejecuta `npm run deploy:doctor` para comprobar configuración, autenticación y correspondencia con las implementaciones existentes. Para revisar las comprobaciones previas sin autenticar ni hacer escrituras remotas, usa `npm run deploy:dev -- --dry-run`.
4. Publica con `npm run deploy:dev`. El comando prepara un build aislado desde los archivos fuente rastreados en el commit (GAS conserva sus rutas y nombres), asigna entorno y URL esperada solo a la copia, sube ese contenido al HEAD remoto, crea una versión, la clona y compara todos sus ficheros antes de actualizar la implementación DEV existente. No cambies a mano las constantes de entorno en `src/Config.gs`.
5. Tras verificar la actualización, se abre la URL web `/exec` de DEV en una ventana privada del navegador predeterminado. Comprueba allí la versión publicada.
La comparación se hace contra la versión remota inmutable recién creada, incluyendo el manifiesto JSON y el contenido de todos los archivos; normaliza finales de línea y las extensiones `.gs`/`.js` tal como `clasp` las representa. El build conserva los nombres y rutas del repositorio (`src/Code.gs`, `ui/Index.html`, entre otros); el builder solo admite `src/Config.gs` como archivo de configuración fuente.

La actualización se confirma con la respuesta de Google a `update-deployment`, comprobando ID, número de versión y descripción exactos. No depende de una segunda consulta inmediata al listado: en la primera publicación el listado no coincidió inmediatamente, aunque una consulta posterior confirmó la actualización. Si la respuesta de actualización falta o es incoherente, la herramienta sigue deteniéndose y exige inspeccionar el estado antes de volver a publicar.

La apertura privada se aplica tanto a DEV como a PRO: incógnito en Chrome/Brave, InPrivate en Edge y ventana privada en Firefox. Si el navegador predeterminado no admite esta apertura, se informa la URL para abrirla manualmente; no se cambia silenciosamente a una ventana normal. Las ventanas privadas de un mismo navegador pueden compartir sesión mientras permanezcan abiertas: cierra todas si necesitas comenzar sin ninguna sesión previa.

`deploy:doctor` nunca escribe remotamente. Consulta `clasp show-authorized-user --json`; sin login informa y omite las APIs. Con login lista las implementaciones y clona sus versiones actuales para detectar el `SUPABASE_ENV` real y verificar entrypoint `WEB_APP` y URL `/exec`; no ejecuta funciones de la app. Si falta configuración informa los datos pendientes. El modo `--dry-run` es offline: no usa clasp, autenticación ni fetch remoto; valida rama, limpieza del árbol (el lock ignorado no cuenta), configuración, placeholders en HEAD y la referencia cacheada `origin/<rama>`. No publica ni prueba permisos remotos.

## Promover a PRO

PRO siempre requiere aprobación humana explícita de la revisión hecha en DEV **para el mismo SHA** y autorización explícita del usuario para promocionar. No se deduce aprobación de que una publicación DEV haya terminado.

1. Termina y revisa en DEV el commit exacto que se promoverá; confirma con la persona responsable que la revisión de DEV está aprobada.
2. Promociona Git sin crear un merge commit: `git switch main`, `git merge --ff-only develop` y `git push origin main`. El SHA de `main` que se desplegará debe ser exactamente el SHA revisado en DEV. Si el fast-forward no es posible, detente y resuelve la divergencia mediante el flujo normal de revisión; no fuerces ni resetees ramas.
3. Comprueba de nuevo la configuración y autorización. PRO exige `--confirm-pro`:

   ```text
   npm run deploy:pro -- --confirm-pro
   ```

   Para la comprobación local previa, sin autenticación ni escrituras remotas, añade `--dry-run` al comando. No equivale a la autorización de promoción ni a una publicación.
4. La herramienta comprueba que la implementación DEV existente describe `CBBAEZA DEV <SHA completo>` y clona su versión inmutable para comparar todo el contenido con el build DEV de ese SHA. Después sube el build PRO, crea una versión, la clona y compara todos los ficheros antes de actualizar PRO. Tras iniciar el push del build PRO, debe restaurar el HEAD remoto con el build DEV y verificarlo clonando y comparando el HEAD antes de permitir la actualización PRO, tanto si la preparación PRO termina bien como si falla. Si no se verifica la restauración, aborta PRO.
5. La implementación PRO existente se actualiza solo después de superar esas comprobaciones. Tras verificarla, se abre su URL `/exec` conservada en una ventana privada del navegador predeterminado.

Los pushes a `develop`/`main` no despliegan automáticamente. No hay workflows de GitHub Actions de publicación ni tokens Google en GitHub. Se recomiendan protecciones humanas que bloqueen force-push y borrado, mantengan historial lineal y permitan promover `develop` a `main` mediante fast-forward; estas protecciones no se afirman ya configuradas. Una política que exija PR con merge, squash o rebase para esa promoción puede cambiar el SHA o impedir el fast-forward, rompiendo la identidad DEV→PRO. Si la organización exige esa política, adapta explícitamente el proceso antes de usar PRO; no la eludas ni uses force-push.

La rama heredada `origin/new-dev` queda fuera del flujo: no la mezcles con `develop`/`main` ni la uses como destino de publicación. Si está instalada la extensión GAS GitHub Assistance, desactiva su auto-sync y auto-deploy; no sustituye commits versionados ni esta CLI. PRO se publica únicamente mediante el flujo local documentado.

## Qué hace y qué no aísla este flujo

- DEV y PRO deben permitir abrir la pantalla de acceso sin una sesión de Google; la autenticación por usuario/email y PIN sigue siendo propia de la aplicación. En el manifiesto, `ANYONE` exige una cuenta de Google y `ANYONE_ANONYMOUS` permite ese acceso sin sesión. Mantén la identidad de ejecución `USER_DEPLOYING`; cambiar el acceso web no debe cambiar la base de datos ni eliminar el login de la app.
- La configuración fuente mantiene `SUPABASE_ENV = 'UNPUBLISHED'` y `SUPABASE_EXPECTED_URL = ''`. El build sustituye esos valores solo en su copia temporal. El backend rechaza un entorno distinto de DEV/PRO y una URL de Script Properties que no corresponda a la URL esperada; no hay una clave secreta en el navegador.
- Las dos implementaciones pertenecen al mismo proyecto Apps Script. Script Properties, caches y activadores son compartidos; DEV y PRO **no son proyectos físicamente aislados**. Que cada implementación conserve una versión diferente no separa esos recursos compartidos.
- Los activadores instalados ejecutan el HEAD del proyecto, no la versión de la implementación PRO. Como este flujo deja el HEAD en DEV, un activador como `triggerGenerarSesiones` trabajará en DEV. No lo uses para automatizar tareas PRO suponiendo que sigue la implementación productiva; eso requiere una configuración de activadores separada, preferiblemente en otro proyecto Apps Script.
- La publicación PRO cambia temporalmente el HEAD remoto mientras crea y compara una versión. Evita publicar desde dos procesos simultáneos, editar el proyecto desde la interfaz, o ejecutar activadores durante esa ventana. El bloqueo local de publicación protege procesos locales concurrentes, no operadores manuales ni otros equipos.
- No publiques código PRO que dependa de una Secret key PRO colocada en propiedades compartidas esperando que la protección de URL la oculte del código DEV. El flujo no protege frente a cambios manuales de Script Properties, implementación equivocada u operador que ignore sus controles.
- La CLI no crea bases, no ejecuta `supabase/schema.sql`, `supabase/realtime.sql` ni migraciones, y no escribe en Supabase. Si la versión requiere un cambio de esquema, aplícalo manualmente en las bases DEV y PRO antes de publicar.

## Remediación

- **No se abre Google o `clasp` no está autorizado:** activa Apps Script API en la cuenta correcta y repite `npm exec clasp login`. Comprueba en la ventana de Google qué cuenta inició sesión; `/u/1` por sí solo no basta. Si las lecturas funcionan pero `push` responde `User has not enabled the Apps Script API`, consulta la cuenta con `npm exec -- clasp show-authorized-user --json` y comprueba el interruptor **Google Apps Script API** en `https://script.google.com/home/usersettings` para ese mismo correo. Si lo acabas de activar, Google indica que la propagación puede tardar unos minutos; no cambies despliegues ni permisos de Supabase como solución.
- **Falta configuración o `deploy:doctor` no encuentra una implementación:** copia los IDs de las implementaciones existentes en Gestionar implementaciones y repite `deploy:setup`. Comprueba que no confundiste Script ID, deployment ID y URL `/exec`. No crees ni borres implementaciones como reparación.
- **Falla la comprobación de URL:** compara las URL públicas de `deploy.config.json` con `SUPABASE_DEV_URL`/`SUPABASE_PRO_URL` en Script Properties y corrige la propiedad en Apps Script. No copies una key como si fuera una URL ni cambies la constante fuente.
- **Falla rama, limpieza o push:** vuelve a la rama que corresponde al destino, incorpora únicamente los cambios autorizados en un commit y publica ese SHA en `origin/<rama>`; no descartes cambios de otras personas ni uses push forzado/reset.
- **PRO no encuentra la versión DEV exacta:** detente; termina la publicación DEV del SHA aprobado y vuelve a comprobar su revisión. No omitas `--confirm-pro` ni rebajes la comparación.
- **No se pudo restaurar el HEAD DEV durante una promoción PRO:** no continúes ni intentes actualizar PRO manualmente. Conserva la salida de error y pide intervención para restaurar el estado de DEV antes de otra publicación.
- **Un proceso terminó y dejó el bloqueo local `.deploy.lock` en la raíz:** confirma que no queda ningún proceso de publicación activo; entonces elimina manualmente solo ese archivo. No hay recuperación automática; si hay duda, no lo borres. Después ejecuta `deploy:doctor` y el `--dry-run` del entorno antes de reintentar.
- **El navegador no puede abrir una ventana privada al terminar:** si la herramienta informa que el despliegue ya se publicó, usa la URL `/exec` indicada para abrirlo manualmente en incógnito; no repitas la publicación solo para abrir la página.
