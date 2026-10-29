/** Cálculos puros de asistencia. Todas las fechas son hora local, sin conversión de zona. */
const Estadisticas = {
  /** `indices` (Map opcional) reutiliza el indexado entre consultas del mismo lote con igual filtro. */
  consultar(datos, consulta, contexto, ahora, indices) {
    consulta = consulta || {};
    contexto = contexto || {};
    const filtro = this.normalizarFiltro_(datos.temporadas || [], consulta, ahora);
    const entidad = contexto.rol === 'jugador' ? 'propio' : (consulta.entidad || 'resumen');
    if (entidad === 'club' && contexto.rol !== 'admin') throw new Error('Consulta de estadísticas no permitida.');
    const claveIndice = [filtro.temporadaId, filtro.periodo, filtro.desde, filtro.hasta].join('|');
    let x = indices && indices.get(claveIndice);
    if (!x) {
      x = this.indexar_(datos, filtro, ahora);
      if (indices) indices.set(claveIndice, x);
    }
    let resultado;
    switch (entidad) {
      case 'resumen': resultado = this.resumen_(x, contexto); break;
      case 'club': resultado = this.club_(x); break;
      case 'equipo':
        if (!x.equipos.has(consulta.id)) throw new Error('Equipo no encontrado.');
        resultado = this.detalleEquipo_(x, consulta.id); break;
      case 'jugador':
        if (!x.jugadores.has(consulta.id)) throw new Error('Jugador no encontrado.');
        resultado = this.detalleJugador_(x, consulta.id); break;
      case 'entrenador':
        if (!x.entrenadores.has(consulta.id)) throw new Error('Entrenador no encontrado.');
        resultado = this.detalleEntrenador_(x, consulta.id); break;
      case 'propio': resultado = this.propio_(x, contexto.jugadorId); break;
      default: throw new Error('Consulta de estadísticas no permitida.');
    }
    return { filtro, temporadas: (datos.temporadas || []).map(t => ({ ID: t.ID, Nombre: t.Nombre, Activa: t.Activa })), entidad, datos: resultado };
  },

  verdadero_(valor) { return valor === true || valor === 'TRUE'; },
  fechaMs_(fecha) {
    const f = String(fecha);
    return Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10), +f.slice(11, 13) || 0, +f.slice(14, 16) || 0, +f.slice(17, 19) || 0);
  },
  desplazar_(fecha, dias) { return new Date(this.fechaMs_(fecha) + dias * 86400000).toISOString().slice(0, 10); },
  // Memo por fecha: se consulta una vez por fila en series semanales y por día.
  calendario_: new Map(),
  diaSemana_(fecha) {
    let c = this.calendario_.get(fecha);
    if (!c) {
      const dia = new Date(this.fechaMs_(fecha)).getUTCDay() || 7;
      c = { dia, semana: this.desplazar_(fecha, 1 - dia) };
      this.calendario_.set(fecha, c);
    }
    return c;
  },
  semana_(fecha) { return this.diaSemana_(fecha).semana; },
  normalizarFiltro_(temporadas, consulta, ahora) {
    let seleccionada = null;
    let reciente = null;
    let activa = null;
    for (const t of temporadas) {
      if (t.ID === consulta.temporadaId) seleccionada = t;
      if (this.verdadero_(t.Activa)) activa = t;
      if (!reciente || (t.FechaInicio || '') > (reciente.FechaInicio || '')) reciente = t;
    }
    if (consulta.temporadaId && !seleccionada) throw new Error('Temporada no encontrada.');
    seleccionada = seleccionada || activa || reciente;
    const esActiva = !!seleccionada && this.verdadero_(seleccionada.Activa);
    const periodo = esActiva && ['4s', 'mes'].includes(consulta.periodo) ? consulta.periodo : 'temporada';
    const hoy = ahora.slice(0, 10);
    let desde = seleccionada ? (seleccionada.FechaInicio || '0000-00-00') : '0000-00-00';
    if (periodo === '4s') desde = this.desplazar_(hoy, 1 - CONFIG.ESTADISTICAS.DIAS_TENDENCIA);
    if (periodo === 'mes') desde = hoy.slice(0, 7) + '-01';
    return {
      temporadaId: seleccionada ? seleccionada.ID : null,
      temporadaNombre: seleccionada ? seleccionada.Nombre : '', periodo, desde,
      hasta: seleccionada && seleccionada.FechaFin && seleccionada.FechaFin < hoy ? seleccionada.FechaFin : hoy,
      periodos: esActiva ? ['temporada', '4s', 'mes'] : ['temporada'],
    };
  },
  agregarIndice_(mapa, clave, fila) {
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(fila);
  },
  intervalo_(rel, temporadas, equipos) {
    if (!this.verdadero_(rel.Activo) && !rel.FechaBaja) return null;
    const equipo = equipos.get(rel.ID_Equipo);
    const temporada = equipo && temporadas.get(equipo.ID_Temporada);
    return { ...rel, desde: rel.FechaAlta || (temporada && temporada.FechaInicio) || '0000-00-00', hasta: rel.FechaBaja || '9999-12-31' };
  },
  vigente_(rel, fecha) { return rel.desde <= fecha && rel.hasta >= fecha; },
  relacion_(mapa, personaId, equipoId, fecha) {
    let elegida = null;
    for (const rel of mapa.get(personaId + ':' + equipoId) || []) {
      if (this.vigente_(rel, fecha) && (!elegida || rel.desde >= elegida.desde)) elegida = rel;
    }
    return elegida;
  },
  indexar_(datos, filtro, ahora) {
    const x = { filtro, ahora, recientesDesde: this.desplazar_(ahora.slice(0, 10), 1 - CONFIG.ESTADISTICAS.DIAS_TENDENCIA),
      temporadas: new Map(), equipos: new Map(), jugadores: new Map(), entrenadores: new Map(),
      equiposPeriodo: new Map(), sesiones: new Map(), sesionesEquipo: new Map(),
      sesionesRecientes: new Map(), canceladasEquipo: new Map(), pendientesEquipo: new Map(),
      recientesJugador: new Map(), recientesJugadorEquipo: new Map(),
      relacionesJugador: new Map(), relacionesEntrenador: new Map(), jugadoresEquipo: new Map(), entrenadoresEquipo: new Map(),
      filasJugador: new Map(), filasEquipo: new Map(), filasSesion: new Map(), filasEntrenador: new Map(), tecnicosSesion: new Map(),
      jugadoresPeriodo: new Set(), entrenadoresPeriodo: new Set(), computables: [], canceladas: [], pendientes: [], filas: [],
      cacheJugador: new Map(), cacheEquipo: new Map(), cacheEntrenador: new Map() };
    for (const clave of ['temporadas', 'equipos', 'jugadores', 'entrenadores']) {
      for (const fila of datos[clave] || []) x[clave].set(fila.ID, fila);
    }
    for (const equipo of x.equipos.values()) if (filtro.temporadaId && equipo.ID_Temporada === filtro.temporadaId) x.equiposPeriodo.set(equipo.ID, equipo);
    for (const [clave, persona, pares, porEquipo, conjunto] of [
      ['jugadoresEquipos', 'ID_Jugador', x.relacionesJugador, x.jugadoresEquipo, x.jugadoresPeriodo],
      ['entrenadoresEquipos', 'ID_Entrenador', x.relacionesEntrenador, x.entrenadoresEquipo, x.entrenadoresPeriodo],
    ]) {
      for (const fila of datos[clave] || []) {
        const rel = this.intervalo_(fila, x.temporadas, x.equipos);
        if (!rel) continue;
        this.agregarIndice_(pares, fila[persona] + ':' + fila.ID_Equipo, rel);
        this.agregarIndice_(porEquipo, fila.ID_Equipo, rel);
        if (x.equiposPeriodo.has(fila.ID_Equipo) && rel.desde <= filtro.hasta && rel.hasta >= filtro.desde) conjunto.add(fila[persona]);
      }
    }
    for (const s of datos.sesiones || []) {
      if (!filtro.temporadaId || s.ID_Temporada !== filtro.temporadaId) continue;
      const enPeriodo = s.Fecha >= filtro.desde && s.Fecha <= filtro.hasta;
      if (this.verdadero_(s.Cancelada)) {
        if (enPeriodo) { x.canceladas.push(s); this.agregarIndice_(x.canceladasEquipo, s.ID_Equipo, s); }
        continue;
      }
      if (s.Fecha + ' ' + (s.HoraFin || '23:59') > ahora) continue;
      if (!this.verdadero_(s.AsistenciaGuardada)) {
        if (enPeriodo) { x.pendientes.push(s); this.agregarIndice_(x.pendientesEquipo, s.ID_Equipo, s); }
        continue;
      }
      if (s.Fecha >= x.recientesDesde) x.sesionesRecientes.set(s.ID, s);
      if (!enPeriodo) continue;
      x.sesiones.set(s.ID, s);
      x.computables.push(s);
      this.agregarIndice_(x.sesionesEquipo, s.ID_Equipo, s);
    }
    for (const fila of datos.asistJugadores || []) {
      const s = x.sesiones.get(fila.ID_Sesion) || x.sesionesRecientes.get(fila.ID_Sesion);
      if (!s) continue;
      const enPeriodo = x.sesiones.has(s.ID);
      if (enPeriodo) x.jugadoresPeriodo.add(fila.ID_Jugador);
      const estado = String(fila.Estado || '').trim().toUpperCase();
      if (this.verdadero_(fila.Excluido) || !['P', 'A', 'R'].includes(estado)) continue;
      const rel = this.relacion_(x.relacionesJugador, fila.ID_Jugador, s.ID_Equipo, s.Fecha);
      const registro = { fila, s, estado, clave: s.Fecha + ' ' + (s.HoraInicio || ''),
        tipo: rel ? rel.Tipo : (this.verdadero_(fila.EsInvitado) ? 'Invitado' : null) };
      if (x.sesionesRecientes.has(s.ID)) {
        this.agregarIndice_(x.recientesJugador, fila.ID_Jugador, registro);
        this.agregarIndice_(x.recientesJugadorEquipo, fila.ID_Jugador + ':' + s.ID_Equipo, registro);
      }
      if (!enPeriodo) continue;
      x.filas.push(registro);
      this.agregarIndice_(x.filasJugador, fila.ID_Jugador, registro);
      this.agregarIndice_(x.filasEquipo, s.ID_Equipo, registro);
      this.agregarIndice_(x.filasSesion, s.ID, registro);
    }
    for (const fila of datos.asistEntrenadores || []) {
      const s = x.sesiones.get(fila.ID_Sesion);
      if (!s) continue;
      x.entrenadoresPeriodo.add(fila.ID_Entrenador);
      if (this.verdadero_(fila.Excluido) || (fila.Asistio !== true && fila.Asistio !== false)) continue;
      const registro = { fila, s };
      this.agregarIndice_(x.filasEntrenador, fila.ID_Entrenador, registro);
      this.agregarIndice_(x.tecnicosSesion, s.ID, registro);
    }
    x.clubConteo = this.conteo_(x.filas);
    x.clubPorcentajes = this.porcentajes_(x.clubConteo);
    return x;
  },

  conteo_(filas) {
    const c = { P: 0, A: 0, R: 0, base: 0, justificadasA: 0, justificadasR: 0, injustificadasA: 0 };
    for (const r of filas) {
      c[r.estado]++; c.base++;
      if (r.estado === 'A') {
        if (this.verdadero_(r.fila.TieneJustificacion)) c.justificadasA++;
        else c.injustificadasA++;
      }
      if (r.estado === 'R' && this.verdadero_(r.fila.TieneJustificacion)) c.justificadasR++;
    }
    return c;
  },
  porcentaje_(n, base) { return base ? Math.round(n * 100 / base) : null; },
  decimal_(n) { return Math.round(n * 10) / 10; },
  porcentajes_(c) { return { asistenciaPct: this.porcentaje_(c.P + c.R, c.base), puntualidadPct: this.porcentaje_(c.P, c.P + c.R) }; },
  mediana_(numeros) {
    if (!numeros.length) return null;
    numeros.sort((a, b) => a - b);
    const mitad = Math.floor(numeros.length / 2);
    return this.decimal_(numeros.length % 2 ? numeros[mitad] : (numeros[mitad - 1] + numeros[mitad]) / 2);
  },
  minutos_(s) {
    if (!s.HoraInicio || !s.HoraFin) return 0;
    const inicio = s.HoraInicio.split(':').map(Number);
    const fin = s.HoraFin.split(':').map(Number);
    return Math.max(0, (fin[0] - inicio[0]) * 60 + fin[1] - inicio[1]);
  },
  ordenarFilas_(filas) { return filas.slice().sort((a, b) => a.clave < b.clave ? 1 : a.clave > b.clave ? -1 : 0); },
  metricas_(x, filas, filasRecientes) {
    const conteo = this.conteo_(filas);
    const porcentajes = this.porcentajes_(conteo);
    let recientes = filasRecientes;
    if (recientes === undefined) {
      recientes = [];
      for (const r of filas) if (r.s.Fecha >= x.recientesDesde) recientes.push(r);
    }
    const c28 = this.conteo_(recientes);
    const tendenciaPp = x.filtro.periodo === 'temporada' && x.filtro.periodos.length > 1 && c28.base >= CONFIG.ESTADISTICAS.MIN_BASE_TENDENCIA
      ? this.porcentajes_(c28).asistenciaPct - porcentajes.asistenciaPct : null;
    const ordenadas = this.ordenarFilas_(filas);
    let rachaActual = 0;
    let mejorRacha = 0;
    let racha = 0;
    let actualTerminada = false;
    for (const r of ordenadas) {
      if (r.estado === 'A') { racha = 0; actualTerminada = true; }
      else { racha++; if (!actualTerminada) rachaActual++; }
      mejorRacha = Math.max(mejorRacha, racha);
    }
    const alertas = [];
    if (ordenadas.length >= CONFIG.ESTADISTICAS.AUSENCIAS_SEGUIDAS) {
      let seguidas = true;
      for (let i = 0; i < CONFIG.ESTADISTICAS.AUSENCIAS_SEGUIDAS; i++) if (ordenadas[i].estado !== 'A') seguidas = false;
      if (seguidas) alertas.push('seguidas');
    }
    if (tendenciaPp !== null && tendenciaPp <= -CONFIG.ESTADISTICAS.CAIDA_PP) alertas.push('caida');
    if (c28.injustificadasA >= CONFIG.ESTADISTICAS.INJUSTIFICADAS_ALERTA) alertas.push('injustificadas');
    return { conteo, ...porcentajes, tendenciaPp, rachaActual, mejorRacha, alertas };
  },
  agrupaciones_(filas) {
    const semanas = new Map();
    const meses = new Map();
    const dias = new Map();
    for (const r of filas) {
      const c = this.diaSemana_(r.s.Fecha);
      this.agregarIndice_(semanas, c.semana, r);
      this.agregarIndice_(meses, r.s.Fecha.slice(0, 7), r);
      this.agregarIndice_(dias, c.dia, r);
    }
    const serie = (grupos, clave) => {
      const puntos = [];
      for (const [valor, registros] of grupos) {
        const c = this.conteo_(registros);
        puntos.push({ [clave]: valor, P: c.P, A: c.A, R: c.R, base: c.base, ...this.porcentajes_(c) });
      }
      return puntos.sort((a, b) => a[clave] < b[clave] ? -1 : a[clave] > b[clave] ? 1 : 0);
    };
    const porDia = [];
    for (const [dia, registros] of dias) {
      const c = this.conteo_(registros);
      porDia.push({ dia, base: c.base, asistenciaPct: this.porcentajes_(c).asistenciaPct });
    }
    porDia.sort((a, b) => a.dia - b.dia);
    return { serieSemanal: serie(semanas, 'semana'), serieMensual: serie(meses, 'mes'), porDia };
  },
  justificaciones_(filas) {
    const motivos = new Map();
    const antelaciones = [];
    const avisos = { total: 0, previos: 0, programadas: 0, antelacionMedianaHoras: null };
    for (const r of filas) {
      if (r.estado === 'P' || !this.verdadero_(r.fila.TieneJustificacion)) continue;
      avisos.total++;
      const motivo = r.fila.MotivoCategoria || 'Sin motivo';
      if (!motivos.has(motivo)) motivos.set(motivo, { motivo, A: 0, R: 0 });
      motivos.get(motivo)[r.estado]++;
      if (r.fila.JustificadoPor === 'programacion') avisos.programadas++;
      else if (r.fila.FechaJustificacion && r.fila.FechaJustificacion < r.s.Fecha + ' ' + r.s.HoraInicio) {
        avisos.previos++;
        antelaciones.push((this.fechaMs_(r.s.Fecha + ' ' + r.s.HoraInicio) - this.fechaMs_(r.fila.FechaJustificacion)) / 3600000);
      }
    }
    avisos.antelacionMedianaHoras = this.mediana_(antelaciones);
    return { avisos, motivos: Array.from(motivos.values()).sort((a, b) => (b.A + b.R) - (a.A + a.R)) };
  },
  detalleJugador_(x, id) {
    if (x.cacheJugador.has(id)) return x.cacheJugador.get(id);
    const filas = x.filasJugador.get(id) || [];
    const m = this.metricas_(x, filas, x.recientesJugador.get(id) || []);
    const porEquipo = new Map();
    let minutos = 0;
    let retrasosConMinutos = 0;
    let horas = 0;
    const extras = { asistidas: 0, base: 0 };
    for (const r of filas) {
      this.agregarIndice_(porEquipo, r.s.ID_Equipo, r);
      if (r.estado === 'R' && Number.isInteger(r.fila.MinutosRetraso) && r.fila.MinutosRetraso > 0) {
        minutos += r.fila.MinutosRetraso; retrasosConMinutos++;
      }
      if (r.estado !== 'A') horas += this.minutos_(r.s);
      if (this.verdadero_(r.s.EsExtra)) { extras.base++; if (r.estado !== 'A') extras.asistidas++; }
    }
    const equipos = [];
    for (const [equipoId, registros] of porEquipo) {
      const equipo = x.equipos.get(equipoId);
      const rel = this.relacion_(x.relacionesJugador, id, equipoId, x.filtro.hasta);
      equipos.push({ equipoId, nombre: equipo ? equipo.Nombre : '', tipo: rel ? rel.Tipo : this.ordenarFilas_(registros)[0].tipo,
        base: registros.length, asistenciaPct: this.porcentajes_(this.conteo_(registros)).asistenciaPct });
    }
    const sesiones = this.ordenarFilas_(filas).slice(0, CONFIG.ESTADISTICAS.MAX_SESIONES_DETALLE).map(r => ({
      sesionId: r.s.ID, fecha: r.s.Fecha, hora: r.s.HoraInicio, equipoId: r.s.ID_Equipo,
      equipoNombre: (x.equipos.get(r.s.ID_Equipo) || {}).Nombre || '', estado: r.estado,
      justificada: this.verdadero_(r.fila.TieneJustificacion), tipo: r.tipo,
      minutosRetraso: r.estado === 'R' ? (r.fila.MinutosRetraso || null) : null,
    }));
    // La carga media incluye semanas sin presencia, no solo aquellas en las que asistió.
    const semanasPeriodo = Math.max(1, Math.floor((this.fechaMs_(this.semana_(x.filtro.hasta)) - this.fechaMs_(this.semana_(x.filtro.desde === '0000-00-00' ? x.filtro.hasta : x.filtro.desde))) / 604800000) + 1);
    const resultado = { id, ...m, retrasoMedioMin: retrasosConMinutos ? this.decimal_(minutos / retrasosConMinutos) : null,
      retrasosConMinutos, ...this.justificaciones_(filas), ...this.agrupaciones_(filas), sesiones, equipos,
      carga: { sesionesSemanaMedia: this.decimal_((m.conteo.P + m.conteo.R) / semanasPeriodo), horasAsistidas: this.decimal_(horas / 60) }, extras };
    x.cacheJugador.set(id, resultado);
    return resultado;
  },

  cancelaciones_(sesiones) {
    const motivos = new Map();
    for (const s of sesiones) {
      const motivo = s.MotivoCancelacion || 'Sin motivo';
      motivos.set(motivo, (motivos.get(motivo) || 0) + 1);
    }
    return Array.from(motivos, ([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n);
  },
  latencia_(sesiones) {
    const horas = [];
    for (const s of sesiones) if (s.FechaPrimerRegistro) {
      horas.push(Math.max(0, (this.fechaMs_(s.FechaPrimerRegistro) - this.fechaMs_(s.Fecha + ' ' + (s.HoraFin || '23:59'))) / 3600000));
    }
    return this.mediana_(horas);
  },
  cobertura_(x, sesiones) {
    let conEntrenador = 0;
    let sustituto = 0;
    for (const s of sesiones) {
      let con = false;
      let invitado = false;
      for (const r of x.tecnicosSesion.get(s.ID) || []) {
        if (!r.fila.Asistio) continue;
        const rel = this.relacion_(x.relacionesEntrenador, r.fila.ID_Entrenador, s.ID_Equipo, s.Fecha);
        if (rel && rel.TipoRol !== 'Visor') con = true;
        if (this.verdadero_(r.fila.EsInvitado)) invitado = true;
      }
      if (con) conEntrenador++;
      if (invitado) sustituto++;
    }
    return { conEntrenadorPct: this.porcentaje_(conEntrenador, sesiones.length), sustitutoPct: this.porcentaje_(sustituto, sesiones.length) };
  },
  plantilla_(x, equipoId, enFecha) {
    const miembros = new Map();
    for (const rel of x.jugadoresEquipo.get(equipoId) || []) {
      const incluida = enFecha ? this.vigente_(rel, x.filtro.hasta) : rel.desde <= x.filtro.hasta && rel.hasta >= x.filtro.desde;
      if (incluida) {
        const anterior = miembros.get(rel.ID_Jugador);
        if (!anterior || rel.desde >= anterior.desde) miembros.set(rel.ID_Jugador, rel);
      }
    }
    return miembros;
  },
  detalleEquipo_(x, id) {
    if (x.cacheEquipo.has(id)) return x.cacheEquipo.get(id);
    const filas = x.filasEquipo.get(id) || [];
    const sesiones = x.sesionesEquipo.get(id) || [];
    const canceladas = x.canceladasEquipo.get(id) || [];
    const pendientes = x.pendientesEquipo.get(id) || [];
    const m = this.metricas_(x, filas);
    const clubPct = x.clubPorcentajes.asistenciaPct;
    const plantilla = this.plantilla_(x, id, false);
    const filasJugador = new Map();
    let refuerzos = 0;
    for (const r of filas) {
      this.agregarIndice_(filasJugador, r.fila.ID_Jugador, r);
      if (r.estado !== 'A' && (r.tipo === 'Secundario' || r.tipo === 'Invitado')) refuerzos++;
    }
    const ids = new Set(plantilla.keys());
    for (const jugadorId of filasJugador.keys()) ids.add(jugadorId);
    const distribucion = { alta: 0, media: 0, baja: 0, pocasSesiones: 0 };
    const jugadores = [];
    for (const jugadorId of ids) {
      const registros = filasJugador.get(jugadorId) || [];
      const jugador = x.jugadores.get(jugadorId) || {};
      const jm = this.metricas_(x, registros, x.recientesJugadorEquipo.get(jugadorId + ':' + id) || []);
      const rel = plantilla.get(jugadorId);
      jugadores.push({ id: jugadorId, nombre: jugador.Nombre || '', apellidos: jugador.Apellidos || '', tipo: rel ? rel.Tipo : (registros.length ? registros[0].tipo : null),
        base: jm.conteo.base, asistenciaPct: jm.asistenciaPct, puntualidadPct: jm.puntualidadPct,
        injustificadasA: jm.conteo.injustificadasA, tendenciaPp: jm.tendenciaPp, rachaActual: jm.rachaActual, alertas: jm.alertas });
      if (rel && jm.conteo.base >= CONFIG.ESTADISTICAS.MIN_BASE_RANKING) {
        distribucion[jm.asistenciaPct >= CONFIG.ESTADISTICAS.UMBRAL_ALTA ? 'alta' : jm.asistenciaPct >= CONFIG.ESTADISTICAS.UMBRAL_MEDIA ? 'media' : 'baja']++;
      } else if (rel && jm.conteo.base) distribucion.pocasSesiones++;
    }
    jugadores.sort((a, b) => this.compararPorcentaje_(a.asistenciaPct, b.asistenciaPct) || a.apellidos.localeCompare(b.apellidos));
    let minutos = 0;
    let extra = 0;
    let bajaAsistencia = 0;
    for (const s of sesiones) {
      minutos += this.minutos_(s);
      if (this.verdadero_(s.EsExtra)) extra++;
      const c = this.conteo_(x.filasSesion.get(s.ID) || []);
      if (c.base && this.porcentajes_(c).asistenciaPct < CONFIG.ESTADISTICAS.UMBRAL_SESION_BAJA) bajaAsistencia++;
    }
    const justificaciones = this.justificaciones_(filas);
    const resultado = { id, conteo: m.conteo, asistenciaPct: m.asistenciaPct, puntualidadPct: m.puntualidadPct, tendenciaPp: m.tendenciaPp,
      comparativaClubPp: m.asistenciaPct === null || clubPct === null ? null : m.asistenciaPct - clubPct,
      plantillaActiva: this.plantilla_(x, id, true).size, asistentesMedia: sesiones.length ? this.decimal_((m.conteo.P + m.conteo.R) / sesiones.length) : null,
      sesiones: { computables: sesiones.length, canceladas: canceladas.length, pendientes: pendientes.length, extra, horasProgramadas: this.decimal_(minutos / 60), bajaAsistencia },
      pendientesLista: pendientes.map(s => ({ sesionId: s.ID, fecha: s.Fecha, hora: s.HoraInicio })),
      distribucion, ...this.agrupaciones_(filas), motivos: justificaciones.motivos,
      justificacionPct: this.porcentaje_(m.conteo.justificadasA + m.conteo.justificadasR, m.conteo.A + m.conteo.R),
      antelacionMedianaHoras: justificaciones.avisos.antelacionMedianaHoras,
      refuerzosPct: this.porcentaje_(refuerzos, m.conteo.P + m.conteo.R), cobertura: this.cobertura_(x, sesiones),
      latenciaMedianaHoras: this.latencia_(sesiones), cancelaciones: this.cancelaciones_(canceladas), jugadores };
    x.cacheEquipo.set(id, resultado);
    return resultado;
  },
  compararPorcentaje_(a, b) { return a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a; },

  detalleEntrenador_(x, id) {
    if (x.cacheEntrenador.has(id)) return x.cacheEntrenador.get(id);
    const filas = x.filasEntrenador.get(id) || [];
    const equipos = new Map();
    const porEquipoFilas = new Map();
    const meses = new Map();
    let presentes = 0;
    let minutos = 0;
    let sustitucionesDadas = 0;
    for (const r of filas) {
      this.agregarIndice_(porEquipoFilas, r.s.ID_Equipo, r);
      equipos.set(r.s.ID_Equipo, null);
      const mes = r.s.Fecha.slice(0, 7);
      if (!meses.has(mes)) meses.set(mes, { mes, sesiones: 0, presentes: 0 });
      meses.get(mes).sesiones++;
      if (r.fila.Asistio) {
        presentes++; minutos += this.minutos_(r.s); meses.get(mes).presentes++;
        if (this.verdadero_(r.fila.EsInvitado)) sustitucionesDadas++;
      }
    }
    // Las relaciones se recorren por equipo, sin buscar entre todas las filas de asistencia.
    for (const equipoId of x.equiposPeriodo.keys()) {
      for (const rel of x.relacionesEntrenador.get(id + ':' + equipoId) || []) {
        if (rel.desde <= x.filtro.hasta && rel.hasta >= x.filtro.desde) equipos.set(equipoId, rel.TipoRol);
      }
    }
    let coberturasRecibidas = 0;
    const porEquipo = [];
    for (const [equipoId, tipoRol] of equipos) {
      const registros = porEquipoFilas.get(equipoId) || [];
      const sesiones = x.sesionesEquipo.get(equipoId) || [];
      let presentesEquipo = 0;
      for (const r of registros) if (r.fila.Asistio) presentesEquipo++;
      for (const s of sesiones) {
        const rel = this.relacion_(x.relacionesEntrenador, id, equipoId, s.Fecha);
        if (!rel || rel.TipoRol === 'Visor') continue;
        let propio = false;
        let otro = false;
        for (const r of x.tecnicosSesion.get(s.ID) || []) {
          if (r.fila.Asistio) { if (r.fila.ID_Entrenador === id) propio = true; else otro = true; }
        }
        if (!propio && otro) coberturasRecibidas++;
      }
      const equipo = x.equipos.get(equipoId) || {};
      porEquipo.push({ equipoId, nombre: equipo.Nombre || '', tipoRol, sesiones: registros.length,
        presenciaPct: this.porcentaje_(presentesEquipo, registros.length),
        asistenciaJugadoresPct: this.porcentajes_(this.conteo_(x.filasEquipo.get(equipoId) || [])).asistenciaPct,
        pendientes: (x.pendientesEquipo.get(equipoId) || []).length, latenciaMedianaHoras: this.latencia_(sesiones) });
    }
    const resultado = { id, sesiones: filas.length, presentes, presenciaPct: this.porcentaje_(presentes, filas.length),
      horasDirigidas: this.decimal_(minutos / 60), sustitucionesDadas, coberturasRecibidas, porEquipo,
      serieMensual: Array.from(meses.values()).sort((a, b) => a.mes.localeCompare(b.mes)) };
    x.cacheEntrenador.set(id, resultado);
    return resultado;
  },
  clubResumen_(x) {
    const m = x.clubPorcentajes;
    let minutos = 0;
    for (const s of x.computables) minutos += this.minutos_(s);
    return { asistenciaPct: m.asistenciaPct, puntualidadPct: m.puntualidadPct, sesiones: x.computables.length,
      canceladas: x.canceladas.length, pendientes: x.pendientes.length, horasProgramadas: this.decimal_(minutos / 60) };
  },
  resumen_(x, contexto) {
    const resultado = { equipos: {}, jugadores: {}, entrenadores: {} };
    for (const id of x.equiposPeriodo.keys()) {
      const e = this.detalleEquipo_(x, id);
      resultado.equipos[id] = { id, jugadoresActivos: e.plantillaActiva, sesiones: e.sesiones.computables,
        canceladas: e.sesiones.canceladas, pendientes: e.sesiones.pendientes, asistenciaPct: e.asistenciaPct,
        puntualidadPct: e.puntualidadPct, tendenciaPp: e.tendenciaPp, asistentesMedia: e.asistentesMedia };
    }
    for (const id of x.jugadoresPeriodo) {
      const j = this.detalleJugador_(x, id);
      resultado.jugadores[id] = { id, base: j.conteo.base, asistenciaPct: j.asistenciaPct, puntualidadPct: j.puntualidadPct,
        tendenciaPp: j.tendenciaPp, rachaActual: j.rachaActual, alertas: j.alertas };
    }
    for (const id of x.entrenadoresPeriodo) {
      const e = this.detalleEntrenador_(x, id);
      resultado.entrenadores[id] = { id, sesiones: e.sesiones, presentes: e.presentes, presenciaPct: e.presenciaPct, sustitucionesDadas: e.sustitucionesDadas };
    }
    if (contexto.rol === 'admin') resultado.club = this.clubResumen_(x);
    return resultado;
  },
  club_(x) {
    const equipos = [];
    const categorias = new Map();
    const activos = new Map();
    const porEquipo = [];
    for (const [id, equipo] of x.equiposPeriodo) {
      const e = this.detalleEquipo_(x, id);
      equipos.push({ id, nombre: equipo.Nombre, categoria: equipo.Categoria, modalidad: equipo.Modalidad,
        asistenciaPct: e.asistenciaPct, puntualidadPct: e.puntualidadPct, sesiones: e.sesiones.computables,
        pendientes: e.sesiones.pendientes, canceladas: e.sesiones.canceladas, conEntrenadorPct: e.cobertura.conEntrenadorPct, tendenciaPp: e.tendenciaPp });
      if (!categorias.has(equipo.Categoria)) categorias.set(equipo.Categoria, []);
      const registros = categorias.get(equipo.Categoria);
      for (const r of x.filasEquipo.get(id) || []) registros.push(r);
      const plantilla = new Set();
      for (const rel of x.jugadoresEquipo.get(id) || []) if (this.verdadero_(rel.Activo)) plantilla.add(rel.ID_Jugador);
      for (const jugadorId of plantilla) if (!activos.has(jugadorId)) activos.set(jugadorId, equipo.Nombre);
      porEquipo.push({ equipoId: id, nombre: equipo.Nombre, plantilla });
    }
    const contacto = new Map();
    for (const id of activos.keys()) {
      const j = x.jugadores.get(id) || {};
      const texto = v => !!String(v || '').trim();
      const email1 = texto(j.EmailPadre1);
      const email2 = texto(j.EmailPadre2);
      const emailFamiliar = email1 || email2;
      const telefono = texto(j.Telefono) || texto(j.TelefonoPadre1) || texto(j.TelefonoPadre2);
      const emailPersonal = texto(j.Email);
      contacto.set(id, { emailFamiliar, telefono,
        avisos: (email1 && j.NotificarAusenciasPadre1 !== false) || (email2 && j.NotificarAusenciasPadre2 !== false),
        soloTelefono: !emailFamiliar && telefono,
        soloEmailPersonal: !emailFamiliar && !telefono && emailPersonal,
        sinContacto: !emailFamiliar && !telefono && !emailPersonal });
    }
    const resumirContacto = ids => {
      const r = { activos: 0, conEmailFamiliar: 0, conAvisosActivos: 0, conTelefono: 0, soloTelefono: 0, soloEmailPersonal: 0, sinContacto: 0 };
      for (const id of ids) {
        const c = contacto.get(id);
        r.activos++;
        if (c.emailFamiliar) r.conEmailFamiliar++;
        if (c.avisos) r.conAvisosActivos++;
        if (c.telefono) r.conTelefono++;
        if (c.soloTelefono) r.soloTelefono++;
        if (c.soloEmailPersonal) r.soloEmailPersonal++;
        if (c.sinContacto) r.sinContacto++;
      }
      return r;
    };
    const total = resumirContacto(activos.keys());
    const sinContactoLista = [];
    for (const [id, equipoNombre] of activos) {
      if (!contacto.get(id).sinContacto) continue;
      const j = x.jugadores.get(id) || {};
      sinContactoLista.push({ jugadorId: id, nombre: j.Nombre || '', apellidos: j.Apellidos || '', equipoNombre });
    }
    sinContactoLista.sort((a, b) => a.apellidos.localeCompare(b.apellidos));
    const porCategoria = [];
    for (const [categoria, filas] of categorias) {
      const c = this.conteo_(filas);
      porCategoria.push({ categoria, base: c.base, asistenciaPct: this.porcentajes_(c).asistenciaPct });
    }
    const agrupaciones = this.agrupaciones_(x.filas);
    return { ...this.clubResumen_(x), equipos, porCategoria, serieSemanal: agrupaciones.serieSemanal, serieMensual: agrupaciones.serieMensual,
      motivos: this.justificaciones_(x.filas).motivos, cancelaciones: this.cancelaciones_(x.canceladas),
      contactabilidad: { jugadoresActivos: total.activos, conEmailFamiliar: total.conEmailFamiliar, conAvisosActivos: total.conAvisosActivos,
        conTelefono: total.conTelefono, soloTelefono: total.soloTelefono, soloEmailPersonal: total.soloEmailPersonal, sinContacto: total.sinContacto,
        porEquipo: porEquipo.map(e => ({ equipoId: e.equipoId, nombre: e.nombre, ...resumirContacto(e.plantilla) })),
        sinContactoLista } };
  },
  logros_(jugador, mejor) {
    if (jugador.base < CONFIG.ESTADISTICAS.MIN_BASE_RANKING) return [];
    const logros = [];
    if (jugador.asistenciaPct === 100) logros.push('perfecta');
    if (jugador.puntualidadPct === 100) logros.push('puntual');
    if (jugador.rachaActual >= 10) logros.push('racha10');
    if (mejor >= 3 && jugador.rachaActual === mejor) logros.push('mejorRacha');
    return logros;
  },
  propio_(x, id) {
    if (!x.jugadores.has(id)) throw new Error('Jugador no encontrado.');
    const detalle = this.detalleJugador_(x, id);
    const jugador = { ...detalle };
    delete jugador.alertas;
    let principal = null;
    for (const equipoId of x.equiposPeriodo.keys()) {
      const rel = this.relacion_(x.relacionesJugador, id, equipoId, x.filtro.hasta);
      if (rel && this.verdadero_(rel.Activo) && rel.Tipo === 'Principal') { principal = equipoId; break; }
    }
    let equipo = null;
    if (principal) {
      const e = this.detalleEquipo_(x, principal);
      const plantilla = this.plantilla_(x, principal, true);
      const candidatos = [];
      const pocasSesiones = [];
      let mejor = 0;
      for (const j of e.jugadores) {
        if (!plantilla.has(j.id)) continue;
        if (j.base >= CONFIG.ESTADISTICAS.MIN_BASE_RANKING) { candidatos.push(j); mejor = Math.max(mejor, j.rachaActual); }
        else pocasSesiones.push({ nombre: j.nombre, apellidos: j.apellidos, esYo: j.id === id });
      }
      candidatos.sort((a, b) => this.compararPorcentaje_(a.asistenciaPct, b.asistenciaPct) || b.base - a.base || a.apellidos.localeCompare(b.apellidos));
      pocasSesiones.sort((a, b) => a.apellidos.localeCompare(b.apellidos));
      let posicion = null;
      const ranking = candidatos.map((j, i) => {
        if (j.id === id) posicion = i + 1;
        return { nombre: j.nombre, apellidos: j.apellidos, asistenciaPct: j.asistenciaPct, rachaActual: j.rachaActual,
          logros: this.logros_(j, mejor), esYo: j.id === id, posicion: i + 1 };
      });
      equipo = { id: principal, nombre: (x.equipos.get(principal) || {}).Nombre || '', asistenciaPct: e.asistenciaPct,
        puntualidadPct: e.puntualidadPct, sesiones: e.sesiones.computables, posicion, total: ranking.length, ranking, pocasSesiones };
    }
    return { jugador, equipo };
  },
};
