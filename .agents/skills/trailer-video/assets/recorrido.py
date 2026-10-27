"""Recorrido de capturas: copia este archivo a la carpeta de trabajo como recorrido.py y adaptalo a la app.

    python <skill>/scripts/capturas.py --url <URL> --recorrido recorrido.py --out capturas [--sesion sesion.json]

Un bloque por estado de la app que salga en el video, con una pagina nueva por bloque (estado limpio).
SOLO NAVEGA: abrir, hacer clic en pestanas, menus y dialogos, y escribir en campos para la foto. Nunca pulses
guardar, enviar, aprobar, borrar ni nada con efectos, y menos en una app de produccion.

cap.snap(page, "nombre", {elemento: destino}, {campo: "selector del input"}) guarda la captura y los rectangulos.
Destinos: "selector" (el primero) | "selector@@2" (el tercero) | "DIALOG:selector" (la ventana que lo contiene)
| "TEXT:contenedor|texto" (la opcion con ese texto) | ["sel1", "sel2"] (el rectangulo que los contiene).
Las metricas de un campo permiten animar la escritura (covers "type" en la composicion).
"""


async def recorrido(ctx, url, cap):
    async def nueva(espera=600):
        page = await ctx.new_page()
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(espera)          # que terminen animaciones y cargas
        return page

    # 1. Pantalla principal: nombra lo que vayas a senalar en el video.
    page = await nueva()
    await cap.snap(page, "inicio", {"cabecera": "header", "boton": "button"})
    await page.close()

    # 2. Un dialogo abierto con texto escrito (NO se pulsa guardar).
    # page = await nueva()
    # await page.click("#nuevo")
    # await page.wait_for_timeout(300)
    # await page.click("#cliente")
    # await page.keyboard.type("Distribuciones Norte", delay=15)
    # await cap.snap(page, "nuevo", {"dialog": "DIALOG:#cliente", "cliente": "#cliente", "guardar": "#guardar"},
    #                {"cliente": "#cliente"})
    # await page.close()

    # 3. Un desplegable abierto.
    # page = await nueva()
    # await page.click("#filtro")
    # await page.wait_for_timeout(300)
    # await cap.snap(page, "filtro", {"menu": "#menu-filtro", "opcion": "TEXT:#menu-filtro|Pendientes"})
    # await page.close()
