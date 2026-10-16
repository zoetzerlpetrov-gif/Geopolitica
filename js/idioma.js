/**
 * Idioma de la interfaz: español (original), inglés, francés, alemán e italiano.
 *
 * Cómo funciona:
 * 1. Diccionario propio (abajo) para la interfaz fija: barra superior, secciones del menú, filtros, grupos, familias
 *    de capas y herramientas. Se reemplaza el texto exacto de cada nodo y los atributos placeholder, title y aria-label.
 * 2. El resto (fichas, descripciones largas, titulares) se traduce con el traductor integrado del navegador
 *    (Translator API, en el propio equipo: el texto no sale a ningún servidor). Hoy existe en Chrome 138+ de
 *    escritorio; en otros navegadores ese texto queda en español.
 * 3. Las etiquetas del mapa base usan el nombre del lugar en el idioma elegido cuando OpenStreetMap lo tiene.
 * La elección se guarda en este navegador. Volver a «Español» recarga la página con los textos originales.
 */
import { storage } from "./util.js";

export const IDIOMAS = [["es", "Español"], ["en", "English"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"]];
const ORDEN = ["en", "fr", "de", "it"];

// es | en | fr | de | it
const FILAS = `
Monitor Geopolítico|Geopolitical Monitor|Moniteur géopolitique|Geopolitischer Monitor|Monitor geopolitico
Saltar a la lista de eventos|Skip to the event list|Aller à la liste des événements|Zur Ereignisliste springen|Vai all'elenco degli eventi
Mostrar u ocultar panel|Show or hide panel|Afficher ou masquer le panneau|Seitenleiste ein- oder ausblenden|Mostra o nascondi il pannello
Cargando…|Loading…|Chargement…|Wird geladen…|Caricamento…
Región|Region|Région|Region|Regione
Filtrar por región|Filter by region|Filtrer par région|Nach Region filtern|Filtra per regione
Todas las regiones|All regions|Toutes les régions|Alle Regionen|Tutte le regioni
Análisis|Analysis|Analyse|Analyse|Analisi
Taxonomía|Taxonomy|Taxonomie|Taxonomie|Tassonomia
Proyección del mapa|Map projection|Projection de la carte|Kartenprojektion|Proiezione della mappa
🗺️ Plano 2D|🗺️ Flat 2D|🗺️ Plan 2D|🗺️ Flach 2D|🗺️ Piano 2D
🌐 Globo 3D|🌐 3D globe|🌐 Globe 3D|🌐 3D-Globus|🌐 Globo 3D
Mapa base|Base map|Fond de carte|Grundkarte|Mappa di base
Temático|Thematic|Thématique|Thematisch|Tematica
Calles|Streets|Rues|Straßen|Strade
Satélite|Satellite|Satellite|Satellit|Satellite
Tema|Theme|Thème|Design|Tema
Cambiar tema claro/oscuro|Switch light/dark theme|Changer de thème clair/sombre|Helles/dunkles Design wechseln|Cambia tema chiaro/scuro
Cambiar tema claro u oscuro|Switch light or dark theme|Changer de thème clair ou sombre|Helles oder dunkles Design wechseln|Cambia tema chiaro o scuro
Idioma|Language|Langue|Sprache|Lingua
Buscar en el menú (p. ej. sismos, aire)…|Search the menu (e.g. earthquakes, air)…|Rechercher dans le menu (ex. séismes, air)…|Im Menü suchen (z. B. Erdbeben, Luft)…|Cerca nel menu (es. terremoti, aria)…
Buscar en el menú|Search the menu|Rechercher dans le menu|Im Menü suchen|Cerca nel menu
Contraer todas las secciones|Collapse all sections|Replier toutes les sections|Alle Abschnitte einklappen|Comprimi tutte le sezioni
Contraer todo|Collapse all|Tout replier|Alles einklappen|Comprimi tutto
🔔 Sonido al llegar eventos nuevos|🔔 Sound when new events arrive|🔔 Son à l'arrivée de nouveaux événements|🔔 Ton bei neuen Ereignissen|🔔 Suono all'arrivo di nuovi eventi
Eventos y noticias|Events and news|Événements et actualités|Ereignisse und Nachrichten|Eventi e notizie
Filtros|Filters|Filtres|Filter|Filtri
Orden de la lista|List order|Ordre de la liste|Reihenfolge der Liste|Ordine dell'elenco
Severidad: mayor a menor|Severity: highest first|Gravité : décroissante|Schweregrad: absteigend|Gravità: dalla più alta
Más recientes primero|Newest first|Plus récents d'abord|Neueste zuerst|Più recenti prima
Severidad mínima|Minimum severity|Gravité minimale|Mindestschweregrad|Gravità minima
1 · todas|1 · all|1 · toutes|1 · alle|1 · tutte
2 o más|2 or more|2 ou plus|2 oder mehr|2 o più
3 o más|3 or more|3 ou plus|3 oder mehr|3 o più
4 o más|4 or more|4 ou plus|4 oder mehr|4 o più
Solo una severidad|Single severity|Une seule gravité|Nur ein Schweregrad|Una sola gravità
Todas|All|Toutes|Alle|Tutte
Todos|All|Tous|Alle|Tutti
Solo 5 · Extrema|Only 5 · Extreme|Seulement 5 · Extrême|Nur 5 · Extrem|Solo 5 · Estrema
Solo 4 · Alta|Only 4 · High|Seulement 4 · Élevée|Nur 4 · Hoch|Solo 4 · Alta
Solo 3 · Media|Only 3 · Medium|Seulement 3 · Moyenne|Nur 3 · Mittel|Solo 3 · Media
Solo 2 · Baja|Only 2 · Low|Seulement 2 · Faible|Nur 2 · Niedrig|Solo 2 · Bassa
Solo 1 · Informativa|Only 1 · Informational|Seulement 1 · Informative|Nur 1 · Information|Solo 1 · Informativa
País|Country|Pays|Land|Paese
Todos los países|All countries|Tous les pays|Alle Länder|Tutti i paesi
Religión mencionada|Religion mentioned|Religion mentionnée|Erwähnte Religion|Religione menzionata
Solo con impacto en México|Only with impact on Mexico|Seulement avec impact sur le Mexique|Nur mit Auswirkung auf Mexiko|Solo con impatto sul Messico
Solo leyes, reformas y decretos|Only laws, reforms and decrees|Seulement lois, réformes et décrets|Nur Gesetze, Reformen und Dekrete|Solo leggi, riforme e decreti
Quitar filtros|Clear filters|Effacer les filtres|Filter entfernen|Rimuovi filtri
Áreas temáticas|Thematic areas|Domaines thématiques|Themenbereiche|Aree tematiche
Ninguna|None|Aucune|Keine|Nessuna
Línea de tiempo|Timeline|Chronologie|Zeitleiste|Linea temporale
Lista de eventos|Event list|Liste des événements|Ereignisliste|Elenco eventi
Buscar en la lista: palabra, país, tema…|Search the list: word, country, topic…|Rechercher : mot, pays, sujet…|Liste durchsuchen: Wort, Land, Thema…|Cerca nell'elenco: parola, paese, tema…
Buscar en la lista de eventos|Search the event list|Rechercher dans la liste des événements|Ereignisliste durchsuchen|Cerca nell'elenco degli eventi
Titulares de seguridad (sin verificar)|Security headlines (unverified)|Titres de sécurité (non vérifiés)|Sicherheitsschlagzeilen (unbestätigt)|Titoli sulla sicurezza (non verificati)
Capas del mapa|Map layers|Couches de la carte|Kartenebenen|Livelli della mappa
Capas fijas|Fixed layers|Couches fixes|Feste Ebenen|Livelli fissi
Chokepoints marítimos|Maritime chokepoints|Détroits maritimes stratégiques|Maritime Engpässe|Strozzature marittime
Índice de inestabilidad por país|Instability index by country|Indice d'instabilité par pays|Instabilitätsindex nach Land|Indice di instabilità per paese
Infraestructura, conflictos y sociedad|Infrastructure, conflicts and society|Infrastructures, conflits et société|Infrastruktur, Konflikte und Gesellschaft|Infrastrutture, conflitti e società
Se descargan solo al activarlas.|Downloaded only when turned on.|Téléchargées seulement à l'activation.|Werden erst beim Einschalten geladen.|Si scaricano solo quando si attivano.
Dato:|Data:|Donnée :|Daten:|Dato:
estático|static|statique|statisch|statico
retrasado|delayed|différé|verzögert|ritardato
estimado|estimated|estimé|geschätzt|stimato
tiempo real|real time|temps réel|Echtzeit|tempo reale
Cargando catálogo…|Loading catalog…|Chargement du catalogue…|Katalog wird geladen…|Caricamento catalogo…
Imágenes satelitales y cámaras|Satellite imagery and cameras|Images satellite et caméras|Satellitenbilder und Kameras|Immagini satellitari e telecamere
En movimiento|On the move|En mouvement|In Bewegung|In movimento
Aviones, barcos y satélites|Aircraft, ships and satellites|Avions, navires et satellites|Flugzeuge, Schiffe und Satelliten|Aerei, navi e satelliti
🚆 Trenes|🚆 Trains|🚆 Trains|🚆 Züge|🚆 Treni
Riesgos y clima|Risks and weather|Risques et météo|Risiken und Wetter|Rischi e meteo
Clima: viento, temperatura y lluvia|Weather: wind, temperature and rain|Météo : vent, température et pluie|Wetter: Wind, Temperatur und Regen|Meteo: vento, temperatura e pioggia
Amenazas: capas en el mapa|Threats: map layers|Menaces : couches sur la carte|Bedrohungen: Kartenebenen|Minacce: livelli sulla mappa
Clima espacial: Sol, tormentas y auroras|Space weather: Sun, storms and auroras|Météo spatiale : Soleil, tempêtes et aurores|Weltraumwetter: Sonne, Stürme und Polarlichter|Meteo spaziale: Sole, tempeste e aurore
Amenazas activas: filtros y lista|Active threats: filters and list|Menaces actives : filtres et liste|Aktive Bedrohungen: Filter und Liste|Minacce attive: filtri ed elenco
Calidad del aire por ciudad|Air quality by city|Qualité de l'air par ville|Luftqualität nach Stadt|Qualità dell'aria per città
Valle de México: Hoy No Circula y aire|Valley of Mexico: driving restrictions and air|Vallée de Mexico : restrictions de circulation et air|Tal von Mexiko: Fahrverbote und Luft|Valle del Messico: limitazioni al traffico e aria
Fenómenos anómalos|Anomalous phenomena|Phénomènes anomaux|Anomale Phänomene|Fenomeni anomali
Avistamientos, objetos extraños y lugares|Sightings, strange objects and places|Observations, objets étranges et lieux|Sichtungen, seltsame Objekte und Orte|Avvistamenti, oggetti strani e luoghi
Historia por país|History by country|Histoire par pays|Geschichte nach Land|Storia per paese
Consultar la historia de un país|Look up a country's history|Consulter l'histoire d'un pays|Geschichte eines Landes nachschlagen|Consulta la storia di un paese
País (p. ej. México, mexico, Japón)|Country (e.g. Mexico, Japan)|Pays (ex. Mexique, Japon)|Land (z. B. Mexiko, Japan)|Paese (es. Messico, Giappone)
Ver historia|View history|Voir l'histoire|Geschichte anzeigen|Vedi storia
Reportes diarios|Daily reports|Rapports quotidiens|Tägliche Berichte|Rapporti giornalieri
Panorama del día (web y PDF)|Daily overview (web and PDF)|Panorama du jour (web et PDF)|Tagesüberblick (Web und PDF)|Panorama del giorno (web e PDF)
🇲🇽 Panorama de México|🇲🇽 Mexico overview|🇲🇽 Panorama du Mexique|🇲🇽 Überblick Mexiko|🇲🇽 Panorama del Messico
🌍 Panorama global|🌍 Global overview|🌍 Panorama mondial|🌍 Weltüberblick|🌍 Panorama globale
Herramientas|Tools|Outils|Werkzeuge|Strumenti
📷 Metadatos y ubicación de una foto|📷 Photo metadata and location|📷 Métadonnées et lieu d'une photo|📷 Metadaten und Ort eines Fotos|📷 Metadati e posizione di una foto
🛡️ Verificador de mensajes sospechosos|🛡️ Suspicious message checker|🛡️ Vérificateur de messages suspects|🛡️ Prüfung verdächtiger Nachrichten|🛡️ Verifica di messaggi sospetti
🔑 ¿Mi contraseña aparece en filtraciones?|🔑 Has my password appeared in leaks?|🔑 Mon mot de passe figure-t-il dans des fuites ?|🔑 Taucht mein Passwort in Datenlecks auf?|🔑 La mia password compare in fughe di dati?
Texto del mensaje|Message text|Texte du message|Nachrichtentext|Testo del messaggio
Analizar|Analyze|Analyser|Analysieren|Analizza
Comprobar|Check|Vérifier|Prüfen|Verifica
Seguimiento|Watchlist|Suivi|Beobachtung|Monitoraggio
Lugares que sigues|Places you follow|Lieux suivis|Orte, denen du folgst|Luoghi che segui
Todavía no sigues ningún lugar.|You don't follow any place yet.|Vous ne suivez encore aucun lieu.|Du folgst noch keinem Ort.|Non segui ancora nessun luogo.
Vistas de análisis|Analysis views|Vues d'analyse|Analyseansichten|Viste di analisi
Vista México|Mexico view|Vue Mexique|Ansicht Mexiko|Vista Messico
Matriz de riesgo|Risk matrix|Matrice des risques|Risikomatrix|Matrice dei rischi
Aprender|Learn|Apprendre|Lernen|Impara
Calidad de datos|Data quality|Qualité des données|Datenqualität|Qualità dei dati
Cerrar análisis|Close analysis|Fermer l'analyse|Analyse schließen|Chiudi analisi
Cerrar ficha|Close details|Fermer la fiche|Details schließen|Chiudi scheda
fuentes y licencias|sources and licenses|sources et licences|Quellen und Lizenzen|fonti e licenze
Desastres naturales|Natural disasters|Catastrophes naturelles|Naturkatastrophen|Disastri naturali
Clima y ambiente|Weather and environment|Climat et environnement|Wetter und Umwelt|Clima e ambiente
Seguridad y ataques|Security and attacks|Sécurité et attaques|Sicherheit und Angriffe|Sicurezza e attacchi
Emergencias, zonas afectadas y transporte|Emergencies, affected areas and transport|Urgences, zones touchées et transport|Notfälle, betroffene Gebiete und Verkehr|Emergenze, zone colpite e trasporti
Red y ciberseguridad|Internet and cybersecurity|Réseau et cybersécurité|Netz und Cybersicherheit|Rete e cybersicurezza
Espacio|Space|Espace|Weltraum|Spazio
Criminología: modalidades delictivas en noticias|Criminology: crime types in the news|Criminologie : types de délits dans l'actualité|Kriminologie: Deliktarten in den Nachrichten|Criminologia: tipi di reato nelle notizie
Polos: Antártida, Groenlandia y Ártico|Poles: Antarctica, Greenland and the Arctic|Pôles : Antarctique, Groenland et Arctique|Pole: Antarktis, Grönland und Arktis|Poli: Antartide, Groenlandia e Artico
Zonas geográficas|Geographic zones|Zones géographiques|Geografische Zonen|Zone geografiche
Aeropuertos|Airports|Aéroports|Flughäfen|Aeroporti
Puertos|Ports|Ports|Häfen|Porti
Centrales eléctricas|Power plants|Centrales électriques|Kraftwerke|Centrali elettriche
Centros de datos|Data centers|Centres de données|Rechenzentren|Data center
Organismos internacionales y bolsas|International organizations and stock exchanges|Organisations internationales et bourses|Internationale Organisationen und Börsen|Organizzazioni internazionali e borse
Embajadas y consulados|Embassies and consulates|Ambassades et consulats|Botschaften und Konsulate|Ambasciate e consolati
Recursos estratégicos|Strategic resources|Ressources stratégiques|Strategische Rohstoffe|Risorse strategiche
Instalaciones militares (públicas)|Military facilities (public)|Installations militaires (publiques)|Militäreinrichtungen (öffentlich)|Installazioni militari (pubbliche)
Cables submarinos|Submarine cables|Câbles sous-marins|Unterseekabel|Cavi sottomarini
Rutas marítimas del mundo|World shipping lanes|Routes maritimes du monde|Schifffahrtsrouten der Welt|Rotte marittime del mondo
Presas|Dams|Barrages|Staudämme|Dighe
Ductos de petróleo y gas|Oil and gas pipelines|Oléoducs et gazoducs|Öl- und Gaspipelines|Oleodotti e gasdotti
Vías férreas|Railways|Voies ferrées|Eisenbahnstrecken|Ferrovie
Autopistas y carreteras troncales|Highways and trunk roads|Autoroutes et routes principales|Autobahnen und Fernstraßen|Autostrade e strade principali
Plantas nucleares y reactores de investigación|Nuclear plants and research reactors|Centrales nucléaires et réacteurs de recherche|Kernkraftwerke und Forschungsreaktoren|Centrali nucleari e reattori di ricerca
Centros de investigación relevantes|Major research centers|Centres de recherche importants|Wichtige Forschungszentren|Centri di ricerca rilevanti
Farmacéuticas: sedes y plantas|Pharmaceutical companies: HQs and plants|Laboratoires pharmaceutiques : sièges et usines|Pharmaunternehmen: Sitze und Werke|Aziende farmaceutiche: sedi e stabilimenti
Campos de petróleo y gas, plataformas marinas|Oil and gas fields, offshore platforms|Champs pétroliers et gaziers, plateformes en mer|Öl- und Gasfelder, Offshore-Plattformen|Giacimenti di petrolio e gas, piattaforme in mare
Puertos espaciales y sitios de lanzamiento|Spaceports and launch sites|Ports spatiaux et sites de lancement|Weltraumbahnhöfe und Startplätze|Spazioporti e siti di lancio
Cruces fronterizos|Border crossings|Postes frontières|Grenzübergänge|Valichi di frontiera
Plantas desaladoras|Desalination plants|Usines de dessalement|Entsalzungsanlagen|Impianti di dissalazione
Cámaras públicas|Public cameras|Caméras publiques|Öffentliche Kameras|Telecamere pubbliche
Densidad de población por país|Population density by country|Densité de population par pays|Bevölkerungsdichte nach Land|Densità di popolazione per paese
Nodos de Bitcoin por país|Bitcoin nodes by country|Nœuds Bitcoin par pays|Bitcoin-Knoten nach Land|Nodi Bitcoin per paese
Tasa de interés de los bancos centrales|Central bank interest rates|Taux directeurs des banques centrales|Leitzinsen der Zentralbanken|Tassi di interesse delle banche centrali
Recaudación de impuestos (% del PIB)|Tax revenue (% of GDP)|Recettes fiscales (% du PIB)|Steuereinnahmen (% des BIP)|Gettito fiscale (% del PIL)
Frentes fríos y cálidos, altas y bajas presiones (América del Norte y océanos vecinos)|Cold and warm fronts, high and low pressure (North America and nearby oceans)|Fronts froids et chauds, hautes et basses pressions (Amérique du Nord et océans voisins)|Kalt- und Warmfronten, Hoch- und Tiefdruck (Nordamerika und angrenzende Ozeane)|Fronti freddi e caldi, alta e bassa pressione (Nord America e oceani vicini)
Eventos de «Norte» en el Golfo de México e Istmo de Tehuantepec (estimación a 7 días)|«Norte» wind events in the Gulf of Mexico and Isthmus of Tehuantepec (7-day estimate)|Épisodes de « Norte » dans le golfe du Mexique et l'isthme de Tehuantepec (estimation à 7 jours)|«Norte»-Windereignisse im Golf von Mexiko und am Isthmus von Tehuantepec (7-Tage-Schätzung)|Eventi di «Norte» nel Golfo del Messico e nell'istmo di Tehuantepec (stima a 7 giorni)
Mar de fondo: oleaje largo en costas de México y del mundo (7 días)|Ground swell: long-period waves on the coasts of Mexico and the world (7 days)|Houle de fond : vagues longues sur les côtes du Mexique et du monde (7 jours)|Dünung: langperiodische Wellen an den Küsten Mexikos und der Welt (7 Tage)|Mare lungo: onde lunghe sulle coste del Messico e del mondo (7 giorni)
El Niño / La Niña: estado oficial y temperatura del mar en las regiones Niño|El Niño / La Niña: official status and sea temperature in the Niño regions|El Niño / La Niña : état officiel et température de la mer dans les régions Niño|El Niño / La Niña: offizieller Status und Meerestemperatur in den Niño-Regionen|El Niño / La Niña: stato ufficiale e temperatura del mare nelle regioni Niño
Asteroides que pasan cerca de la Tierra (próximos 30 días, menos de 19.5 distancias lunares)|Asteroids passing close to Earth (next 30 days, under 19.5 lunar distances)|Astéroïdes passant près de la Terre (30 prochains jours, moins de 19,5 distances lunaires)|Asteroiden in Erdnähe (nächste 30 Tage, unter 19,5 Mondentfernungen)|Asteroidi che passano vicino alla Terra (prossimi 30 giorni, meno di 19,5 distanze lunari)
Lluvias de estrellas y cometas visibles: desde dónde se ven|Meteor showers and visible comets: where they can be seen|Pluies d'étoiles filantes et comètes visibles : d'où les voir|Meteorströme und sichtbare Kometen: von wo aus sichtbar|Sciami meteorici e comete visibili: da dove si vedono
Bólidos: meteoros muy brillantes detectados (último año)|Fireballs: very bright meteors detected (past year)|Bolides : météores très brillants détectés (dernière année)|Feuerkugeln: sehr helle Meteore (letztes Jahr)|Bolidi: meteore molto luminose rilevate (ultimo anno)
Fuente|Source|Source|Quelle|Fonte
Organizaciones|Organizations|Organisations|Organisationen|Organizzazioni
Infraestructura|Infrastructure|Infrastructures|Infrastruktur|Infrastrutture
Instalaciones militares (solo información pública)|Military facilities (public information only)|Installations militaires (informations publiques uniquement)|Militäreinrichtungen (nur öffentliche Informationen)|Installazioni militari (solo informazioni pubbliche)
Grupos armados, criminales y terroristas: dominio, disputa y presencia|Armed, criminal and terrorist groups: control, dispute and presence|Groupes armés, criminels et terroristes : contrôle, disputes et présence|Bewaffnete, kriminelle und terroristische Gruppen: Kontrolle, Konflikte und Präsenz|Gruppi armati, criminali e terroristici: controllo, contesa e presenza
Religiones|Religions|Religions|Religionen|Religioni
Religión|Religion|Religion|Religion|Religione
Población y turismo|Population and tourism|Population et tourisme|Bevölkerung und Tourismus|Popolazione e turismo
Economía y finanzas|Economy and finance|Économie et finances|Wirtschaft und Finanzen|Economia e finanza
Forma de gobierno|Form of government|Forme de gouvernement|Regierungsform|Forma di governo
Orientación política del gobierno|Political orientation of the government|Orientation politique du gouvernement|Politische Ausrichtung der Regierung|Orientamento politico del governo
Lugares religiosos relevantes|Major religious sites|Lieux religieux importants|Bedeutende religiöse Stätten|Luoghi religiosi rilevanti
Aeronaves|Aircraft|Aéronefs|Luftfahrzeuge|Aeromobili
Buques|Ships|Navires|Schiffe|Navi
Satélites|Satellites|Satellites|Satelliten|Satelliti
Encendidas|Turned on|Activées|Eingeschaltet|Attivi
Apagar todas|Turn all off|Tout désactiver|Alle ausschalten|Spegni tutti
Ninguna capa encendida|No layer turned on|Aucune couche activée|Keine Ebene eingeschaltet|Nessun livello attivo
Severidad|Severity|Gravité|Schweregrad|Gravità
Seguir|Follow|Suivre|Folgen|Segui
`;

export const DICC = Object.fromEntries(FILAS.trim().split("\n").map((l) => l.split("|")).filter((c) => c.length === 5)
  .map(([es, ...otros]) => [es, Object.fromEntries(ORDEN.map((k, i) => [k, otros[i]]))]));

// Contadores del menú («8 capas», «12,592 objetos»).
const UNIDADES = { capa: ["layer", "couche", "Ebene", "livello"], capas: ["layers", "couches", "Ebenen", "livelli"],
  objeto: ["object", "objet", "Objekt", "oggetto"], objetos: ["objects", "objets", "Objekte", "oggetti"] };

/** Traducción del diccionario (o null). Respeta espacios y emojis al inicio y al final; traduce contadores «N capas». */
export function traducir(texto, lang) {
  if (!texto || lang === "es") return null;
  const m = texto.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const directo = DICC[m[2]]?.[lang];
  if (directo) return `${m[1]}${directo}${m[3]}`;
  const e = m[2].match(/^([\p{Extended_Pictographic}\uFE0F\u200D\s]+)([\s\S]+)$/u);
  if (e && DICC[e[2]]?.[lang]) return `${m[1]}${e[1]}${DICC[e[2]][lang]}${m[3]}`;
  const c = m[2].match(/^([\d.,]+) (capas?|objetos?)$/);
  if (c) return `${m[1]}${c[1]} ${UNIDADES[c[2]][ORDEN.indexOf(lang)]}${m[3]}`;
  return null;
}

export function idiomaGuardado() {
  const v = storage.get("gp_idioma");
  return IDIOMAS.some(([k]) => k === v) ? v : "es";
}

const ATRIBUTOS = ["placeholder", "title", "aria-label"];
const SALTAR = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);
const LETRAS = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3}/;

/** Traduce el documento y lo que se agregue después. `map` (opcional) cambia el idioma de las etiquetas del mapa base. */
export function iniciarIdioma({ map = null, raiz = document.body } = {}) {
  const lang = idiomaGuardado();
  document.documentElement.lang = lang;
  const sel = document.getElementById("sel-idioma");
  if (sel) {
    sel.value = lang;
    sel.onchange = async () => {
      storage.set("gp_idioma", sel.value);
      // El traductor del navegador puede pedir descargar su modelo: se pide aquí, durante el clic del usuario.
      // Si el modelo tarda en bajar, no se bloquea el cambio: a los 3 s se recarga y la descarga sigue en segundo plano.
      if (sel.value !== "es") await Promise.race([traductorNavegador(sel.value, true), new Promise((r) => setTimeout(r, 3000))]);
      location.reload();
    };
  }
  if (lang === "es") return;
  if (map) etiquetasMapa(map, lang);
  const hechos = new WeakMap();  // nodo → texto que pusimos (para no volver a traducir lo ya traducido)
  const pendientes = new Set();
  let navegador = null;
  Promise.race([traductorNavegador(lang), new Promise((r) => setTimeout(() => r(null), 5000))]).then((t) => {
    navegador = t;
    if (t) programar(raiz); else avisoParcial(lang);
  });

  const textoNodo = (n) => {
    if (hechos.get(n) === n.nodeValue || !LETRAS.test(n.nodeValue)) return;
    const t = traducir(n.nodeValue, lang);
    if (t) { n.nodeValue = t; hechos.set(n, t); } else if (navegador) pendientes.add(n);
  };
  const atributos = (el) => {
    for (const a of ATRIBUTOS) {
      const v = el.getAttribute?.(a);
      if (!v) continue;
      const t = traducir(v, lang);
      if (t && t !== v) el.setAttribute(a, t);
    }
  };
  const recorrer = (nodo) => {
    if (nodo.nodeType === 3) { if (!SALTAR.has(nodo.parentNode?.nodeName) && !nodo.parentElement?.closest("[data-noi18n],#map .maplibregl-canvas-container")) textoNodo(nodo); return; }
    if (nodo.nodeType !== 1 || SALTAR.has(nodo.nodeName) || nodo.matches?.("[data-noi18n]")) return;
    atributos(nodo);
    for (const h of nodo.childNodes) recorrer(h);
  };
  let cola = new Set(), programado = false;
  function programar(n) { cola.add(n); if (!programado) { programado = true; requestAnimationFrame(vaciar); } }
  function vaciar() {
    programado = false;
    const lote = cola; cola = new Set();
    for (const n of lote) if (n.isConnected) recorrer(n);
    if (navegador && pendientes.size) traducirPendientes();
  }
  let ocupado = false;
  async function traducirPendientes() {
    if (ocupado) return;
    ocupado = true;
    try {
      while (pendientes.size) {
        const n = pendientes.values().next().value;
        pendientes.delete(n);
        if (!n.isConnected || hechos.get(n) === n.nodeValue) continue;
        const original = n.nodeValue;
        const t = await traducirConNavegador(navegador, original);
        if (t && n.nodeValue === original) { n.nodeValue = t; hechos.set(n, t); }
      }
    } finally { ocupado = false; }
  }
  recorrer(raiz);
  new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === "childList") c.addedNodes.forEach((n) => programar(n));
      else if (c.type === "characterData") programar(c.target);
      else if (c.type === "attributes") atributos(c.target);
    }
  }).observe(raiz, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}

const AVISO_PARCIAL = {
  en: "Menus and headings are translated. Longer texts stay in Spanish in this browser; desktop Chrome can translate them on your device.",
  fr: "Les menus et titres sont traduits. Les textes longs restent en espagnol dans ce navigateur ; Chrome pour ordinateur peut les traduire sur votre appareil.",
  de: "Menüs und Überschriften sind übersetzt. Längere Texte bleiben in diesem Browser auf Spanisch; Chrome am Computer kann sie auf dem Gerät übersetzen.",
  it: "Menu e titoli sono tradotti. I testi lunghi restano in spagnolo in questo browser; Chrome per computer può tradurli sul dispositivo." };

function avisoParcial(lang) {
  try { if (sessionStorage.getItem("gp_aviso_idioma")) return; sessionStorage.setItem("gp_aviso_idioma", "1"); } catch { /* sin almacenamiento: se muestra igual */ }
  const div = document.createElement("div");
  div.className = "aviso-base aviso-idioma"; div.setAttribute("role", "status"); div.dataset.noi18n = "";
  div.textContent = AVISO_PARCIAL[lang] || "";
  (document.querySelector(".mapa-wrap") || document.body).appendChild(div);
  setTimeout(() => div.remove(), 12000);
}

// ---------------------------------------------------------------- traductor integrado del navegador

const cacheNav = new Map();
async function traductorNavegador(lang, conGesto = false) {
  try {
    if (!("Translator" in self)) return null;
    const disp = await self.Translator.availability({ sourceLanguage: "es", targetLanguage: lang });
    // «downloadable»/«downloading»: el modelo aún no está en el equipo y solo se puede bajar durante un clic del usuario.
    if (disp === "unavailable" || (disp !== "available" && !conGesto)) return null;
    return await self.Translator.create({ sourceLanguage: "es", targetLanguage: lang });
  } catch {
    return null;
  }
}

async function traducirConNavegador(t, texto) {
  const m = texto.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m[2] || m[2].length > 2000) return null;
  if (!cacheNav.has(m[2])) cacheNav.set(m[2], t.translate(m[2]).catch(() => null));
  const r = await cacheNav.get(m[2]);
  return r ? `${m[1]}${r}${m[3]}` : null;
}

// ---------------------------------------------------------------- etiquetas del mapa base

/** Nombres del mapa base en el idioma elegido (OpenStreetMap «name:xx»), con respaldo al nombre latino y al local. */
export function campoNombre(lang) { return ["coalesce", ["get", `name:${lang}`], ["get", "name:latin"], ["get", "name"]]; }

export function etiquetasMapa(map, lang) {
  const aplicar = () => {
    for (const l of map.getStyle()?.layers || []) {
      if (l.type !== "symbol") continue;
      const tf = JSON.stringify(l.layout?.["text-field"] || "");
      if (tf.includes("name:es") && !tf.includes(`name:${lang}`)) map.setLayoutProperty(l.id, "text-field", campoNombre(lang));
    }
  };
  map.on("styledata", aplicar);
  if (map.isStyleLoaded()) aplicar();
}
