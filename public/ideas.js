// Catalogo di idee regalo (generiche, non prodotti specifici).
// Formato: [emoji, titolo, prezzo minimo €, prezzo massimo €]
// Il prezzo è indicativo: serve a filtrare per budget, non a stabilire il costo reale.

export const CATEGORIES = [
  { id: 'pensieri', name: 'Piccoli pensieri', e: '🍬' },
  { id: 'casa', name: 'Casa', e: '🏠' },
  { id: 'cucina', name: 'Cucina', e: '🍳' },
  { id: 'tech', name: 'Tecnologia', e: '🎧' },
  { id: 'benessere', name: 'Benessere', e: '🧖' },
  { id: 'libri', name: 'Libri e giochi', e: '📚' },
  { id: 'moda', name: 'Moda e accessori', e: '🧣' },
  { id: 'sport', name: 'Sport e outdoor', e: '🏃' },
  { id: 'gola', name: 'Cibo e bevande', e: '🍷' },
  { id: 'hobby', name: 'Hobby e creatività', e: '🎨' },
  { id: 'esperienze', name: 'Esperienze', e: '🎟️' },
  { id: 'animali', name: 'Animali', e: '🐶' },
];

const RAW = {
  pensieri: [
    ['🕯️', 'Candela profumata', 8, 25], ['🧦', 'Calzini divertenti', 5, 12], ['☕', 'Tazza simpatica', 8, 15],
    ['🍫', 'Cioccolatini artigianali', 8, 20], ['🍵', 'Set di bustine di tè', 6, 15], ['🔑', 'Portachiavi originale', 5, 12],
    ['📓', 'Taccuino con penna', 6, 15], ['🛁', 'Sali da bagno', 8, 18], ['🌵', 'Mini pianta grassa con vaso', 6, 15],
    ['📅', 'Calendario da tavolo 2027', 8, 15], ['🔖', 'Set di segnalibri', 5, 10], ['🧴', 'Crema mani', 6, 15],
    ['👝', 'Pochette portatutto', 8, 15], ['🥃', 'Bicchierini da shot divertenti', 8, 15], ['✨', 'Lucine LED decorative', 6, 15],
    ['📝', 'Blocchetti adesivi di design', 5, 10],
  ],
  casa: [
    ['🛋️', 'Plaid in pile', 20, 50], ['🌸', 'Diffusore di aromi', 15, 40], ['💡', 'Lampada da comodino', 20, 60],
    ['🛏️', 'Cuscino decorativo', 12, 30], ['🖼️', 'Cornice digitale', 40, 90], ['🏺', 'Vaso di design', 15, 40],
    ['🕯️', 'Set di candele', 15, 40], ['🕰️', 'Orologio da parete', 20, 50], ['🪞', 'Specchio decorativo', 25, 70],
    ['🧶', 'Tappeto morbido', 30, 90], ['🧥', 'Appendiabiti da parete', 15, 40], ['🧂', 'Lampada di sale', 15, 35],
    ['🪴', 'Pianta artificiale', 15, 40], ['🛌', 'Set copripiumino', 30, 80], ['🌌', 'Proiettore di stelle', 20, 45],
  ],
  cucina: [
    ['🔪', 'Set di coltelli', 30, 90], ['🧂', 'Macina pepe elettrico', 20, 45], ['🪵', 'Tagliere in legno', 15, 40],
    ['🫖', 'Bollitore elettrico', 25, 60], ['☕', 'Moka di design', 15, 40], ['🧀', 'Set per aperitivo', 20, 50],
    ['🥤', 'Frullatore a immersione', 25, 60], ['🍳', 'Padella antiaderente', 25, 60], ['🍸', 'Set bicchieri da cocktail', 20, 50],
    ['⚖️', 'Bilancia da cucina', 12, 30], ['👨‍🍳', 'Grembiule', 10, 25], ['🍱', 'Lunch box termica', 15, 35],
    ['🌶️', 'Set di spezie dal mondo', 15, 35], ['🫕', 'Set per fonduta o raclette', 40, 90], ['🥛', 'Termos per caffè', 20, 45],
  ],
  tech: [
    ['🎧', 'Cuffie bluetooth', 25, 150], ['🔋', 'Powerbank', 15, 40], ['🔊', 'Altoparlante bluetooth', 25, 100],
    ['📱', 'Caricatore wireless', 15, 35], ['🔌', 'Presa smart', 10, 30], ['📍', 'Tracker per chiavi', 20, 35],
    ['📖', 'Lettore e-book', 90, 200], ['📷', 'Webcam', 30, 80], ['⌨️', 'Tastiera meccanica', 40, 120],
    ['🖱️', 'Mouse ergonomico', 25, 70], ['📲', 'Supporto per telefono o tablet', 10, 30], ['📦', 'Cover personalizzata', 10, 25],
    ['🎬', 'Mini proiettore', 60, 150], ['🎥', 'Action cam', 60, 200], ['🖨️', 'Stampante fotografica istantanea', 70, 150],
    ['⌚', 'Fitness band', 30, 100],
  ],
  benessere: [
    ['🧴', 'Kit skincare', 20, 60], ['🧖', 'Maschere viso', 10, 25], ['🥋', 'Accappatoio', 30, 70],
    ['💆', 'Massaggiatore cervicale', 25, 70], ['🔫', 'Pistola massaggiante', 40, 120], ['🛁', 'Set bagno spa', 20, 50],
    ['🌹', 'Profumo', 30, 100], ['🧔', 'Kit cura della barba', 20, 60], ['💨', 'Asciugacapelli', 40, 120],
    ['🪮', 'Spazzola districante', 10, 25], ['💅', 'Set manicure', 15, 40], ['🕯️', 'Candela da massaggio', 12, 30],
    ['🧘', 'Tappetino yoga', 20, 45], ['🌿', 'Diffusore di oli essenziali', 20, 45], ['✈️', 'Cuscino da viaggio', 15, 35],
  ],
  libri: [
    ['📕', 'Romanzo del momento', 10, 22], ['👩‍🍳', 'Libro di cucina', 15, 35], ['🎲', 'Gioco da tavolo per tutti', 20, 45],
    ['🧩', 'Puzzle da 1000 pezzi', 12, 30], ['🃏', 'Carte da gioco di design', 8, 20], ['🧱', 'Set LEGO', 20, 100],
    ['🎉', 'Gioco di carte per feste', 15, 30], ['📺', 'Carta regalo per lo streaming', 10, 50], ['🖼️', 'Libro illustrato o fotografico', 20, 45],
    ['📔', 'Agenda o bullet journal', 12, 30], ['🔎', 'Libro di enigmistica', 8, 15], ['🤝', 'Gioco da tavolo cooperativo', 25, 50],
    ['🎁', 'Carta regalo per la libreria', 15, 50], ['🏰', 'Puzzle 3D', 15, 45], ['🖍️', 'Libro da colorare per adulti', 8, 18],
  ],
  moda: [
    ['🧣', 'Sciarpa', 15, 40], ['🧤', 'Guanti touch', 12, 30], ['🧢', 'Cappello di lana', 12, 30],
    ['👛', 'Portafoglio', 20, 60], ['🎒', 'Zaino', 30, 80], ['🕶️', 'Occhiali da sole', 20, 80],
    ['⌚', 'Orologio', 40, 150], ['👜', 'Borsa tote', 15, 40], ['🧦', 'Set calzini di qualità', 12, 30],
    ['🪢', 'Cintura', 20, 50], ['☂️', 'Ombrello antivento', 15, 35], ['🩳', 'Pigiama', 25, 60],
    ['🥿', 'Pantofole', 15, 40], ['👔', 'Cravatta o papillon', 15, 40], ['💍', 'Gioiello semplice', 20, 70],
  ],
  sport: [
    ['🍶', 'Borraccia termica', 15, 35], ['🥾', 'Zaino da trekking', 30, 90], ['❤️', 'Fascia cardio', 25, 60],
    ['🏋️', 'Set di elastici fitness', 12, 30], ['🔦', 'Torcia frontale', 15, 35], ['🎧', 'Cuffie da corsa', 25, 80],
    ['🏖️', 'Asciugamano in microfibra', 10, 25], ['🧺', 'Coperta da picnic', 20, 45], ['🌴', 'Amaca', 20, 50],
    ['🏕️', 'Lanterna da campeggio', 15, 35], ['🔥', 'Scaldamani riutilizzabili', 10, 20], ['🥪', 'Set da picnic', 25, 60],
  ],
  gola: [
    ['🧺', 'Cesto gourmet', 25, 80], ['🍾', 'Bollicine o vino', 12, 40], ['🫒', 'Olio extravergine pregiato', 12, 30],
    ['☕', 'Caffè in grani speciale', 10, 25], ['🍺', 'Selezione di birre artigianali', 15, 35], ['🍸', 'Gin o liquore artigianale', 20, 45],
    ['🍵', 'Tè e tisane premium', 12, 30], ['🍯', 'Miele e confetture', 8, 20], ['🍫', 'Cioccolato di Modica', 8, 20],
    ['🎄', 'Panettone artigianale', 15, 35], ['🍹', 'Kit per cocktail', 25, 55], ['🧀', 'Box di salumi e formaggi', 20, 60],
    ['🍝', 'Pasta artigianale con sugo', 10, 25],
  ],
  hobby: [
    ['🎨', 'Set di acquerelli', 15, 40], ['🧵', 'Kit di ricamo o uncinetto', 12, 30], ['🏗️', 'Kit di modellismo', 20, 60],
    ['📸', 'Fotocamera istantanea', 60, 100], ['🖊️', 'Set di pennarelli artistici', 15, 40], ['🎸', 'Ukulele', 40, 90],
    ['✏️', 'Tavoletta grafica', 40, 100], ['🍄', 'Kit per coltivare funghi o erbe', 15, 35], ['🌱', 'Set di giardinaggio', 15, 40],
    ['💎', 'Diamond painting', 10, 25], ['🧼', 'Kit per fare sapone o candele', 15, 35], ['🔭', 'Telescopio', 30, 80],
  ],
  esperienze: [
    ['🍽️', 'Cena al ristorante (cofanetto)', 40, 100], ['💆', 'Buono per un massaggio o la spa', 40, 100], ['🎬', 'Cinema con popcorn', 15, 30],
    ['👩‍🍳', 'Corso di cucina', 40, 100], ['🏛️', 'Biglietti per un museo o una mostra', 10, 30], ['🍷', 'Degustazione di vini', 30, 70],
    ['🔐', 'Escape room', 40, 80], ['🎭', 'Concerto o teatro', 30, 100], ['🏨', 'Mini weekend (cofanetto)', 60, 200],
    ['📰', 'Abbonamento a una rivista', 20, 50], ['🧘', 'Lezione di yoga o pilates', 20, 50],
  ],
  animali: [
    ['🦴', 'Giochino per cane', 8, 20], ['🥣', 'Ciotola di design', 10, 25], ['🦮', 'Pettorina', 15, 35],
    ['🛏️', 'Cuccia o cuscino', 20, 60], ['🐱', 'Tiragraffi', 25, 60], ['🍖', 'Snack premium', 8, 20],
    ['⛲', 'Fontanella per gatti', 25, 50],
  ],
};

export const IDEAS = Object.entries(RAW).flatMap(([cat, list]) =>
  list.map(([e, title, min, max]) => ({ cat, e, title, min, max })));
