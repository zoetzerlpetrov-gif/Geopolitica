# Continuidad familiar (solo administración)

Página: `continuidad-familiar.html` (menú Secciones → 🔐 Admin → 🧭 Continuidad familiar).

Sirve para preparar y seguir un plan de contingencia familiar: salir de México al menos 180 días con adultos mayores, adultos, niños y gatos. La primera llegada es Mérida, Yucatán, y el regreso a México queda siempre abierto.

## Regla de privacidad

El repositorio y el sitio son **públicos**. El menú Admin solo se oculta en el navegador (`data-solo-admin`): cualquiera puede leer los archivos del repositorio.

- En el repositorio solo hay una **plantilla genérica**: `data/continuidad/plantilla.json`, con niveles, fases, escenarios, destinos genéricos y listas. No contiene nombres, edades exactas, direcciones, documentos, puntos de reunión, palabras clave, bancos ni rutas reales. Una prueba (`tests/js/continuidad.test.mjs`) falla si aparece un correo, un teléfono de 10 dígitos, una CURP, un RFC o un número de pasaporte.
- Lo que captura la familia (bitácora de niveles, avance, escenarios activos y notas, integrantes por perfil, fechas de llegada y contactos PACE) se guarda **solo en el navegador** (`localStorage`, clave `dominus_continuidad_v1`).
- El respaldo se exporta e importa **cifrado** con `cifrar` y `descifrar` de `js/web-cripto.js`: AES-GCM y PBKDF2-SHA256 con 600,000 iteraciones. No hay exportación en claro de los datos de la familia.
- El informe Markdown en claro solo incluye la plantilla y el avance de las listas. Antes de descargarlo, la página pide confirmación.
- No hay analítica, envíos a servidores ni llamadas externas con datos de la familia. La página solo lee la plantilla y los indicadores públicos del sitio (`data/vivos`).

## Archivos

| Archivo | Qué hace |
|---|---|
| `continuidad-familiar.html` | Página con 8 pestañas accesibles (`role="tab"`, flechas, Inicio y Fin) |
| `js/continuidad-logica.js` | Lógica pura: reglas de nivel, días de estancia, avance, fases, detector de datos personales, informe, respaldo cifrado |
| `js/continuidad.js` | Interfaz, guardado local, exportación e importación cifradas |
| `data/continuidad/plantilla.json` | Plantilla genérica |
| `tests/js/continuidad.test.mjs` | Pruebas con `node --test` |

## Reglas de nivel

| Nivel | Cuándo | Plazo |
|---|---|---|
| Verde | Vida normal | Revisión mensual |
| Amarillo | 2 indicadores en deterioro por 2 semanas | 7 días |
| Naranja | Evento grave confirmado por 2 fuentes o amenaza directa | 72 h |
| Rojo | Riesgo inmediato para la vida o cierre inminente de fronteras o del sistema financiero | 24 a 72 h |

- Cualquier adulto sube a Amarillo o Naranja (con motivo).
- Rojo exige registrar dos personas distintas que lo aprueban.
- Solo se baja un nivel a la vez, sin escenarios activos y tras 14 días sin disparadores (la última subida de nivel o la última activación de un escenario). Si no se cumple, la página explica por qué y cuántos días faltan.

## Escenarios e indicadores

La pestaña «Escenarios» muestra junto a algunas filas una referencia de solo lectura de los datos públicos del sitio, con su fecha:

| Escenario | Referencia |
|---|---|
| Control de capitales o devaluación | Tipo de cambio FIX (Banxico) |
| Violencia en la ciudad o en la ruta | Puntos de crimen y seguridad del mapa |
| Huracán sobre Mérida | Conos de pronóstico del NHC |
| Ola de calor | Zonas de calor o frío extremo |
| Pandemia o cierre de fronteras | Alertas sanitarias oficiales |
| Negación de entrada | Protocolos y avisos de viaje |
| Deterioro institucional | Diario Oficial de la Federación |

Ningún nivel se activa en automático: la decisión es humana.

## Pendiente opcional

Servir esta página detrás de la ruta protegida del Worker `cloudflare/huella` (inicio de sesión con GitHub) en lugar del sitio público, o protegerla con Cloudflare Access cuando el sitio esté en `dominusosint.com`.
