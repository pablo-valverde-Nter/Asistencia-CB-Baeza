---
name: publicar-apps-script
description: Usa este proceso cuando el usuario pida publicar o desplegar Apps Script en DEV o PRO, preparar un commit para publicar o promocionar cambios de DEV a PRO.
---

# Publicar Apps Script

Antes de actuar, lee [`docs/publicacion.md`](../../../docs/publicacion.md): es la fuente única de comandos, prerrequisitos, controles y remediación.

- No hagas commits, pushes ni despliegues sin una petición explícita. La petición de publicar autoriza únicamente los commits y pushes pertinentes e imprescindibles para ese destino, además del despliegue solicitado; conserva cambios ajenos. Una petición de commit por sí sola no autoriza publicar. Si el usuario no indica entorno, publica DEV; PRO requiere revisión humana de DEV aprobada y autorización explícita para promocionar.
- Para preparar un commit, revisa solo los cambios pertinentes, conserva cambios ajenos y no uses `git add .`. Usa el formato conventional con asunto en español; commitea solo si el usuario pidió el commit o la publicación lo requiere.
- Para publicar, sigue literalmente la secuencia y los criterios de la guía; usa la CLI local. No sustituyas el proceso por cambios manuales de configuración o por publicar desde la interfaz web.
- Para PRO, confirma que la revisión aprobada corresponde al mismo SHA que se promoverá y detente si falta aprobación, autorización o una comprobación requerida.

Informa el entorno, SHA y URL `/exec` resultantes, o el control concreto que impidió publicar.