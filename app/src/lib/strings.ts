// Centraliserade UI-texter för Veckis.
// Dynamiska texter är funktioner som tar parametrar.

// ─── Gemensamma åtgärder ──────────────────────────────────────────────────────

export const common = {
  actions: {
    save:            'Spara',
    saveChanges:     'Spara ändringar',
    cancel:          'Avbryt',
    confirm:         'Bekräfta',
    close:           'Stäng',
    delete:          'Ta bort',
    edit:            'Redigera',
    copy:            'Kopiera',
    add:             'Lägg till',
    create:          'Skapa',
    done:            'Klar',
    undo:            'Ångra',
    ok:              'OK',
    showLatest:      'Visa senaste',
    more:            'Fler val',
    back:            'Tillbaka',
    manage:          'Hantera',
    clearSearch:     'Rensa sökning',
  },
  discardDraft: {
    title:    'Vill du slänga utkastet?',
    discard:  'Släng utkast',
    keep:     'Fortsätt redigera',
  },
  errors: {
    generic:         'Något gick fel. Försök igen.',
    couldNotLoad:    (what: string) => `Kunde inte ladda ${what}`,
    couldNotSave:    (what: string) => `Kunde inte spara ${what}`,
    couldNotCreate:  (what: string) => `Kunde inte skapa ${what}`,
    couldNotDelete:  (what: string) => `Kunde inte ta bort ${what}`,
    couldNotUpdate:  (what: string) => `Kunde inte uppdatera ${what}`,
  },
  weekdays: {
    short: ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'] as const,
    long:  ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'] as const,
  },
  ordinals: ['Första', 'Andra', 'Tredje', 'Fjärde', 'Femte', 'Sista'] as const,
};

// ─── Sysslor ─────────────────────────────────────────────────────────────────

export const chores = {
  title:             'Sysslor',

  header: {
    clearDone:       'Rensa klara',
    filter:          'Filter',
    new:             'Ny syssla',
  },

  emptyState: {
    title:           'Inga sysslor än',
    subtitle:        'Lägg till en syssla så syns den här och i kalendern',
  },

  card: {
    today:           'idag',
    next:            (date: string) => `nästa ${date}`,
    overdue:         (days: number) => `förfallen ${days} ${days === 1 ? 'dag' : 'dagar'}`,
    done:            'Klar',
    donePlusNext:    (date: string) => `Klar · nästa ${date}`,
  },

  status: {
    done:            'Klar',
    overdue:         (days: number) => `Förfallen sedan ${days} ${days === 1 ? 'dag' : 'dagar'}`,
    today:           'Förfaller idag',
    nextDate:        (date: string) => `Nästa: ${date}`,
  },

  modal: {
    createTitle:     'Ny syssla',
    editTitle:       'Redigera syssla',
    namePlaceholder: 'Sysslans namn, t.ex. Damma',
    nameLabel:       'Sysslans namn',
    dateLabel:       'Datum (valfritt)',
    startLabel:      'Startdatum (valfritt)',
    endLabel:        'Slutdatum',
    chooseDate:      'Välj datum',
    chooseStart:     'Välj startdatum',
    clearDate:       'Rensa datum',
    clearStartDate:  'Rensa startdatum',
    moreSettings:    'Fler inställningar',
    fewerSettings:   'Färre inställningar',
    addButton:       'Lägg till syssla',
    saveButton:      'Spara ändringar',
    deleteButton:    'Ta bort syssla',
  },

  clear: {
    title:           'Rensa klara sysslor',
    once:            (n: number) => `${n} engångssyssla${n === 1 ? '' : 'r'} tas bort`,
    recurring:       (n: number) => `${n} återkommande avprickning${n === 1 ? '' : 'ar'} nollställs`,
    confirm:         'Rensa',
  },

  delete: {
    title:           'Ta bort syssla',
    message:         (title: string) => `Ta bort "${title}"?`,
    confirm:         'Ta bort',
  },

  performer: {
    title:           (title: string) => `Vem gjorde "${title}"?`,
    turn:            (name: string) => `${name}s tur`,
    filledIn:        (performer: string, turn: string) => `${performer} (hoppade in för ${turn})`,
    missed:          (name: string) => `${name} missade`,
  },

  toasts: {
    created:         'Syssla skapad',
    saved:           'Syssla sparad',
    errorCreate:     'Kunde inte skapa syssla',
    errorSave:       'Kunde inte spara ändringarna',
    errorComplete:   'Kunde inte markera sysslan',
    errorUncomplete: 'Kunde inte avmarkera sysslan',
  },

  tips: {
    intro: {
      title:   'Sysslor',
      message: 'Här strukturerar du återkommande sysslor - disk, sopor, dammsuga. Prova ett roterande schema så alla i hushållet turas om automatiskt, och bocka av allteftersom.',
    },
    rotation: {
      title:   'Turas om automatiskt',
      message: 'När 2 eller fler är tilldelade kan du slå på "Turas om" - då växlar turen mellan er per tillfälle. Lämna av om alla är gemensamt ansvariga.',
    },
    details: {
      title:   'Detaljer per syssla',
      message: 'Här ser du frekvens, full status och historik (klara/missade tillfällen). Härifrån når du också Redigera och Ta bort.',
    },
    filter: {
      title:   'Filtrera på person',
      message: 'Tryck här för att bara visa sysslor (och aktiviteter) för en eller flera personer. Filtret gäller både sysslor-fliken och kalendern.',
    },
    add: {
      title:   'Skapa syssla',
      message: 'Här lägger du till en återkommande syssla - välj frekvens (dagligen, veckovis, månadsvis), vem som ska göra den och om ni ska turas om automatiskt.',
    },
  },
};

// ─── Kalender / Aktiviteter ───────────────────────────────────────────────────

export const schedule = {
  emptyState: {
    title: 'Inga sysslor än',
  },

  editScope: {
    title:      'Vilka tillfällen vill du redigera?',
    single:     'Bara det här',
    series:     'Hela serien',
  },

  deleteScope: {
    title:      'Ta bort aktivitet',
    message:    (title: string) => `Ta bort "${title}"?`,
    single:     'Bara den här',
    series:     'Hela serien',
  },

  toasts: {
    created:    'Aktivitet skapad',
    saved:      'Aktivitet sparad',
    deleted:    'Aktivitet borttagen',
    errorLoad:  'Kunde inte ladda schemat',
    errorCreate:'Kunde inte skapa schemapost',
    errorDelete:'Kunde inte ta bort',
  },

  actions: {
    viewRecipe: 'Visa recept',
    goToMenu:   'Gå till Meny',
  },

  remind: {
    presets: [
      { label: '5 min',       value: 5 },
      { label: '15 min',      value: 15 },
      { label: '30 min',      value: 30 },
      { label: '1 tim',       value: 60 },
      { label: 'Dagen innan', value: 1440 },
    ] as const,
    atStart:        'Vid start',
    customTime:     'Välj annan tid',
    addReminder:    'Lägg till påminnelse',
    formatMin:      (m: number) => `${m} min`,
    formatHour:     (h: number) => `${h} tim`,
    formatDay:      (d: number) => d === 1 ? '1 dag' : `${d} dagar`,
    formatWeek:     (w: number) => w === 1 ? '1 vecka' : `${w} veckor`,
  },

  tips: {
    swipe: {
      title:   'Två svep i kalendern',
      message: 'Svep på veckodags-raden (som lyser upp) för att byta vecka. Svep på själva dag-innehållet nedanför för att byta dag.',
    },
    origins: {
      title:   'Var kommer innehållet ifrån?',
      message: 'Maträtter på kalendern kommer från veckomenyn (Meny-fliken), och sysslor från Sysslor-fliken. Skapa eller redigera dem där - de syns sedan automatiskt i kalendern.',
    },
    add: {
      title:   'Skapa aktivitet',
      message: 'Här lägger du till en aktivitet på den valda dagen. Du kan välja om den ska upprepas (dagligen, veckovis, månadsvis), vem som ska göra den och få en påminnelse innan starttiden.',
    },
  },
};

// ─── Inköp ────────────────────────────────────────────────────────────────────

export const shopping = {
  title: 'Inköp',

  header: {
    stores: 'Butiker',
  },

  listCard: {
    empty:      'Tom',
    allChecked: 'Allt bockat',
    remaining:  (done: number, total: number) => `${total - done} av ${total} kvar`,
    youShop:    'Du handlar',
    otherShops: (name: string) => `${name} handlar`,
  },

  emptyState: {
    title:    'Inga aktiva listor',
    subtitle: 'Skapa en inköpslista så kan ni bocka av varor tillsammans',
    cta:      'Ny lista',
  },

  createModal: {
    title:           'Ny inköpslista',
    namePlaceholder: 'Listans namn, t.ex. ICA fredag',
    storeLabel:      'Butik (valfritt)',
    storePlaceholder:'Välj butik…',
    createButton:    'Skapa lista',
  },

  toasts: {
    errorLoad:   'Kunde inte ladda inköpslistor',
    errorCreate: 'Kunde inte skapa lista',
  },

  tips: {
    stores: {
      title:   'Butiker',
      message: 'Tryck här för att lägga till butiker, redigera deras kategorier eller flytta ordningen så listan matchar din affärs layout.',
    },
    create: {
      title:   'Skapa inköpslista',
      message: 'En lista kan kopplas till en butik så att varorna sorteras efter butikens kategorier. Du kan lägga till varor manuellt eller överföra hela veckomenyn till listan från Meny-fliken.',
    },
  },
};

// ─── Inköpslista (detaljvy) ───────────────────────────────────────────────────

export const shoppingList = {
  section: {
    done: 'KLART',
  },

  shopper: {
    you:   'Du handlar',
    other: (name: string) => `${name} handlar`,
  },

  actionsMenu: {
    rename:       'Byt namn',
    changeStore:  'Byt butik',
    clear:        'Rensa listan',
    checkAll:     'Klarmarka alla',
    importMenu:   'Importera veckomeny',
  },

  merge: {
    title:   'Slå ihop dubbletter',
    message: 'Här slår du ihop likadana varor till en post med samlad mängd. Justera namn, enhet och kategori om du vill - appen drar ihop allt till en rad i listan.',
    merged:  (n: number, name: string) => `Slog ihop ${n} ${name}`,
  },

  validation: {
    nameMissing: 'Namn saknas',
  },

  conflict: {
    deleted:     (actor: string, name: string) => `${actor} tog bort ${name}`,
    checked:     (actor: string, name: string) => `${actor} bockade av ${name}`,
    unchecked:   (actor: string, name: string) => `${actor} avmarkerade ${name}`,
    changed:     (actor: string, name: string) => `${actor} ändrade ${name}`,
  },

  toasts: {
    added:            (name: string) => `${name} tillagd till inköpslistan`,
    itemDeleted:      (name: string) => `${name} borttagen`,
    merged:           (n: number, name: string) => `Slog ihop ${n} ${name}`,
    cleared:          'Inköpslistan rensad',
    stapleSaved:      (name: string) => `${name} sparad som basvara`,
    stapleUpdated:    (name: string) => `${name} uppdaterad`,
    errorShopper:     'Kunde inte ändra "Jag handlar"-status',
    errorRename:      'Kunde inte byta namn',
    errorAddItem:     'Kunde inte lägga till vara',
    errorMerge:       'Kunde inte slå ihop varor',
    errorCheckAll:    'Kunde inte klarmarkera alla varor',
    errorCheck:       'Kunde inte bocka av varan',
    errorUndo:        'Kunde inte ångra ihopslagningen',
    errorSave:        'Kunde inte spara ändringen',
    errorDeleteItem:  'Kunde inte ta bort vara',
    errorClear:       'Kunde inte rensa listan',
    errorDeleteList:  'Kunde inte ta bort listan',
    errorSaveStaple:  'Kunde inte spara basvaran',
    errorDeleteStaple:'Kunde inte ta bort basvaran',
    errorChangeStore: 'Kunde inte byta butik',
    errorLoad:        'Kunde inte ladda listan',
    errorDelete:      'Kunde inte ta bort',
  },

  clearDialog: {
    title:   'Rensa lista?',
    message: 'Alla varor tas bort men listan finns kvar.',
    confirm: 'Rensa',
  },

  deleteListDialog: {
    title:   'Ta bort lista',
    confirm: 'Ta bort',
  },

  deleteStapleDialog: {
    title:   'Ta bort basvara',
    confirm: 'Ta bort',
  },

  categoryDialog: {
    title:  'Klarmarkera hela kategorin?',
    confirm:'Klarmarka alla',
  },

  shopDialog: {
    title:   'Du handlar nu',
    message: 'Vill du avsluta handla-läget?',
    confirm: 'Avsluta',
  },

  placeholders: {
    addItem:    'Lägg till vara...',
    itemName:   'Varunamn',
    qty:        '1',
    unit:       'enhet',
    listName:   'Listans namn',
  },

  a11y: {
    back:           'Tillbaka',
    store:          (name: string) => `Butik: ${name}`,
    chooseStore:    'Välj butik',
    iAmShopping:    'Du handlar nu',
    otherShopping:  (name: string) => `${name} handlar nu`,
    moreActions:    'Fler åtgärder',
    checkAllDone:   'Markera alla som klara',
  },

  tips: {
    merge: {
      title:   'Slå ihop dubbletter',
      message: 'Tryck på knappen ovanför listan för att se alla dubbletter och slå ihop dem till en post med samlad mängd.',
    },
    categoryUnit: {
      title:   'Enhet och kategori',
      message: 'Här ändrar du standardenhet (st, dl, g …) och kategori så varan automatiskt hamnar rätt i butikens ordning nästa gång du lägger till den.',
    },
    moreActions: {
      title:   'Mer du kan göra med listan',
      message: 'Tryck på prickarna för fler val: byt namn, byt butik, klarmarka alla, rensa listan eller importera veckomeny.',
    },
  },
};

// ─── Meny ─────────────────────────────────────────────────────────────────────

export const menu = {
  sections: {
    recipes:      'MATRÄTTER',
    unscheduled:  'EJ SCHEMALAGDA',
    unscheduledHint: 'Lägg till rätter utan dag för att planera i kalendern',
  },

  dialogs: {
    dayOccupied: {
      title:   'Dag redan planerad',
      message: (day: string) => `${day} har redan en rätt planerad. Lägga till ändå?`,
      confirm: 'Lägg till',
    },
    recipeOccupied: {
      title:   'Rätt redan planerad',
      message: (title: string) => `${title} är redan planerad denna vecka. Lägga till ändå?`,
      confirm: 'Lägg till',
    },
    alreadyTransferred: {
      title:   'Redan överförd',
      message: 'Alla rätter denna vecka är redan överförda till en inköpslista',
    },
    noSelection: {
      title:   'Ingen rätt vald',
      message: 'Välj minst en rätt att överföra',
    },
    allInList: {
      title:   'Redan med',
      message: 'Alla valda rätter är redan överförda till denna lista',
    },
    weekEmpty: {
      title:   'Tomt',
      message: 'Ingen rätt planerad denna vecka',
    },
    replaceOccupied: {
      title:   'Rätt redan planerad',
      message: (title: string) => `${title} är redan inlagd denna vecka. Byt ut ändå?`,
      confirm: 'Byt ut',
    },
  },

  toasts: {
    scalingAffectsNothing: 'Receptet är redan i en inköpslista - skalningen påverkar inte listan automatiskt',
    recipeAdded:           'Recept tillagd till menyn',
    transferred:           (n: number) => `${n} ${n === 1 ? 'rätt' : 'rätter'} ${n === 1 ? 'överförd' : 'överförda'} till inköpslistan`,
  },

  inventory: {
    have:     'Finns',
    buy:      (amount: string, unit: string) => `köp ${amount}${unit}`,
  },

  emptyState: {
    title:    'Inga recept än',
    subtitle: 'Lägg till ett recept manuellt eller via en URL',
  },

  tips: {
    drag: {
      title:   'Tips för veckomenyn',
      message: 'Håll inne på en rätt (som demonstreras 👆) och dra den till en annan dag. Svep åt sidan för att byta vecka - eller använd pilarna högst upp.',
    },
    templates: {
      title:   'Spara en vecka som mall',
      message: 'Den här ikonen sparar nuvarande veckomeny som en mall - eller applicerar en sparad mall på en annan vecka. Praktiskt om du har återkommande "standardveckor".',
    },
    recipes: {
      title:   'Receptboken',
      message: 'Tryck på Recept för att se hela ditt receptbibliotek - lägg till nya, sök, sortera och välj recept att lägga in i veckomenyn.',
    },
    transfer: {
      title:   'Överför veckomeny till inköpslistan',
      message: 'Tryck på kundvagnen för att ladda hela veckans rätter in i en inköpslista. Du väljer rätter, anger vad du redan har hemma, och resten landar på listan.',
    },
    selectItems: {
      title:   'Välj rätter att överföra',
      message: 'Bocka av de rätter du vill ta in i inköpslistan. Avbockade rätter och de som redan är överförda lämnas kvar i veckomenyn - du kan komma tillbaka och köra resten senare.',
    },
    inventory: {
      title:   'Vad har du hemma?',
      message: 'Här filtrerar du bort det du redan har. Bocka av en hel ingrediens om du har tillräckligt - eller ange en mängd om du har lite men inte allt, så landar bara bristen på inköpslistan.',
    },
  },
};

// ─── Recept ───────────────────────────────────────────────────────────────────

export const recipes = {
  title: 'Recept',

  search: {
    placeholder: 'Sök på namn eller ingrediens…',
  },

  sort: {
    modalTitle: 'Sortera recept',
    a11y:       'Sortera recept',
    az:      'A–Ö',
    newest:  'Senast tillagda',
    popular: 'Mest använda',
  },

  card: {
    meta: (servings: number, ingredients: number) =>
      `${servings} port · ${ingredients} ingredienser`,
  },

  selection: {
    pick:    (day: string) => `Välj en rätt · ${day}`,
    replace: (title: string) => `Byt ut · ${title}`,
  },

  emptyState: {
    title:       'Inga recept än',
    subtitle:    'Lägg till ett recept manuellt eller via en URL',
    noResults:   'Inga träffar',
    noResultsFor:(q: string) => `Inget recept matchar "${q}"`,
  },

  createModal: {
    title:            'Nytt recept',
    tabManual:        'Manuellt',
    tabUrl:           'Från URL',
    namePlaceholder:  'Receptets namn (valfritt om du klistrar in)',
    pastePlaceholder: 'Klistra in recept, ingredienslista eller hela receptsidan här - AI:n plockar ut titel, ingredienser och tillvägagångssätt automatiskt.',
    pasteToggleOn:    'Dölj recepttext',
    pasteToggleOff:   'Klistra in recepttext (AI tolkar)',
    parseButton:      'Tolka och skapa recept',
    createButton:     'Skapa recept',
    createHint:       'Du fyller i beskrivning, ingredienser och instruktioner i nästa steg.',
    urlPlaceholder:   'https://tasteline.com/recept/...',
    urlHint:          'Fungerar med de flesta receptsajter (ICA, Arla, Tasteline, m.fl.)',
    fetchButton:      'Hämta recept',
    addButton:        'Nytt recept',
    addToMenu:        'Lägg till i meny',
  },

  validation: {
    nameMissing:     'Namn saknas',
    nameRequired:    'Receptet behöver ett namn.',
    invalidImageUrl: 'Ogiltig bild-URL',
    imageUrlHint:    'Bild-URL:en måste börja med http:// eller https://',
  },

  errors: {
    duplicate: {
      title:   'Recept finns redan',
      message: (title: string) => `"${title}" har redan hämtats från den här URL:en.`,
      open:    'Öppna receptet',
    },
    parseFailed: {
      title:   'Kunde inte läsa receptet',
      message: (err: string) => `${err}\n\nVill du lägga till receptet manuellt istället?`,
      manual:  'Lägg till manuellt',
    },
    noIngredients: {
      title:   'Inga ingredienser hittades',
      message: 'Receptet skapades men vi kunde inte läsa ingredienserna. Lägg till dem manuellt.',
    },
    generic:        'Fel',
    couldNotLoad:   'Kunde inte ladda recept',
    couldNotSave:   'Kunde inte spara receptet',
    couldNotCreate: 'Kunde inte skapa recept',
    couldNotDelete: 'Kunde inte ta bort receptet',
    couldNotUpload: 'Kunde inte ladda upp bilden',
    couldNotTransfer:'Kunde inte överföra ingredienser',
    selectIngredients:'Välj minst en ingrediens',
    parse:          (msg: string) => msg,
    couldNotParse:  'Kunde inte tolka receptet',
  },

  detail: {
    servings:       (n: number) => `${n} port`,
    ingredients:    (n: number) => `${n} ingredienser`,
    ingredientsLabel: 'Ingredienser',
    instructionsLabel:'Instruktioner',
    descriptionLabel: 'Beskrivning',
    imageLabel:     'Bild',
    gallery:        'Galleri',
    camera:         'Kamera',
    nameLabel:      'Receptnamn',
    addRow:         'Lägg till rad',
    cook:           'Laga',
    addToList:      'Lägg i lista',
    descPlaceholder:'Beskrivning (valfritt)',
    instrPlaceholder:'Steg för steg (valfritt)',
    ingNamePlaceholder: 'Ingrediens',
    ingQtyPlaceholder:  'Mängd',
    cookA11y:       'Laga nu',
    transferA11y:   'Lägg i inköpslista',
    cookClose:      'Avsluta',
    removeImage:    'Ta bort bild',
  },

  transfer: {
    button:      'Lägg i lista',
    title:       'Lägg till i inköpslistan',
    scaledPrefix:(n: number) => `Skalat till ${n} portioner · `,
    needToBuy:   'Välj vad du behöver köpa:',
    selectAll:   'Välj alla',
    clearAll:    'Rensa',
    selectList:  'Välj lista:',
    noLists:     'Inga aktiva listor - skapa en från Inköp-fliken',
    tip:         '"Lägg i lista"-knappen bredvid Ingredienser låter dig välja vad du vill ha och skicka det direkt till en inköpslista.',
    done:        'Klart!',
    success:     (n: number) => `${n} ingredienser tillagda i listan`,
    goToList:    'Gå till listan',
    stayHere:    'Stanna kvar',
  },

  plan: {
    title:    'Planera i meny',
    sub:      'Välj vecka och dag',
    weekLabel:'Vecka',
    dayLabel: 'Dag',
    noDay:    'Ingen',
    addButton:'Lägg till i meny',
  },

  actions: {
    planInMenu:  'Planera i meny',
    editRecipe:  'Redigera recept',
    deleteRecipe:'Ta bort recept',
  },

  delete: {
    title:         'Ta bort recept',
    message:       (title: string) => `Ta bort "${title}"? Detta går inte att ångra.`,
    messageSimple: (title: string) => `Ta bort "${title}"?`,
  },

  menu: {
    addToMenu:    'Lägg till i meny',
    thisWeek:     'denna vecka',
    weekNow:      (n: number) => `v.${n} · nu`,
    weekLabel:    (n: number) => `v.${n}`,
    taken:        'Planerad',
    noDay:        'Lägg till utan dag',
    addedWithDay: (title: string, day: string, week: string) => `${title} tillagd på ${day} (${week})`,
    addedNoDay:   (title: string, week: string) => `${title} tillagd i menyn (${week})`,
    errorAdd:     'Kunde inte lägga till i menyn',
    dayOccupied: {
      title:   'Dag redan planerad',
      message: (label: string) => `${label} har redan en rätt denna vecka. Lägg till ändå?`,
      confirm: 'Lägg till',
    },
    replace: {
      title:   'Byt ut rätt',
      message: (oldTitle: string, newTitle: string) => `Ersätt "${oldTitle}" med "${newTitle}"?`,
      confirm: 'Byt ut',
    },
  },

  permissions: {
    camera: 'Veckis behöver tillgång till kameran',
    photos: 'Veckis behöver tillgång till bilder',
  },

  tips: {
    transfer: {
      title:   'Lägg ingredienser i inköpslistan',
      message: '"Lägg i lista"-knappen bredvid Ingredienser låter dig välja vad du vill ha och skicka det direkt till en inköpslista.',
    },
    categoryUnit: {
      title:   'Enhet och kategori',
      message: 'Här ändrar du standardenhet (st, dl, g …) och kategori så varan automatiskt hamnar rätt i butikens ordning nästa gång du lägger till den.',
    },
    add: {
      title:   'Skapa recept',
      message: 'Lägg till ett recept manuellt eller importera direkt från en webbsida - klistra bara in URL:en så hämtar appen titel, ingredienser, bild och instruktioner automatiskt.',
    },
  },
};

// ─── Hushållet / Inställningar ────────────────────────────────────────────────

export const settings = {
  title: 'Hushållet',

  sections: {
    household:  'HUSHÅLLET',
    members:    'Medlemmar',
    invite:     'BJUD IN NÅGON',
    other:      'ANDRA HUSHÅLL',
    adminLogs:  'Adminloggar',
  },

  household: {
    unknown:       'Okänt hushåll',
    switchHint:    (n: number) => `${n} hushåll · tryck för att byta`,
    active:        'Aktivt hushåll',
    leave:         'Lämna hushållet',
  },

  member: {
    localProfile:  'Lokal profil',
    admin:         'Admin',
    you:           '(Du)',
  },

  memberActions: {
    rename:       'Byt namn',
    makeAdmin:    'Gör till admin',
    removeAdmin:  'Ta bort admin',
    remove:       'Ta bort profilen',
  },

  householdActions: {
    rename:       'Byt namn',
    delete:       'Ta bort hushållet',
    leave:        'Lämna hushållet',
  },

  invite: {
    description:   'Generera en engångskod som en annan person kan använda för att gå med i hushållet.',
    expires:       (date: string) => `Går ut: ${date}`,
    generate:      'Skapa inbjudningskod',
    regenerate:    'Ny kod',
    shareLink:     'Dela länk',
  },

  otherHousehold: {
    create:        'Skapa nytt hushåll',
    join:          'Gå med i hushåll',
  },

  modals: {
    renameHousehold: 'Byt namn på hushållet',
    deleteHousehold: 'Ta bort hushållet',
    addProfile:      'Lägg till lokal profil',
    createHousehold: 'Skapa nytt hushåll',
    joinHousehold:   'Gå med i hushåll',
  },

  placeholders: {
    householdName:   'Hushållets namn',
    memberName:      'Namn',
    deleteConfirm:   'DELETE',
    inviteCode:      'Inbjudningskod',
  },

  messages: {
    addProfile:      'Skapa en lokal profil för ett familjemedlem utan konto.',
    deleteConfirm:   (name: string) =>
      `All data i "${name}" (sysslor, meny, inköpslistor) raderas permanent och kan inte återställas.\n\nSkriv DELETE för att bekräfta.`,
    joinHint:        'Ange inbjudningskoden du fick från husägaren.',
    alreadyMember:   'Du är redan medlem i det hushållet.',
  },

  buttons: {
    createProfile:   'Skapa profil',
    joinHousehold:   'Gå med',
    deleteHousehold: 'Ta bort hushållet',
  },

  toasts: {
    editingDone:     'Redigeringsläget avslutat',
    errorLoadChores: 'Kunde inte ladda sysslor',
    errorInvite:     'Kunde inte skapa inbjudningskod',
    errorJoin:       'Kunde inte ansluta till hushållet. Kontrollera koden.',
    errorCreate:     'Kunde inte skapa hushållet',
    alreadyMember: {
      title:   'Redan med',
      message: 'Du är redan medlem i det hushållet.',
    },
  },

  tips: {
    notifications: {
      title:   'Notisinställningar',
      message: 'Klockan högst upp till höger öppnar dina notisinställningar - slå på/av påminnelser för aktiviteter, sysslor och inköpslistor per typ.',
    },
    admin: {
      title:   'Admin-läge',
      message: 'Som admin kan du trycka "Redigera" för att byta hushållsnamn, hantera medlemmar, dela ut admin-rättigheter och ta bort hushållet.',
    },
  },
};

// ─── Butiker ──────────────────────────────────────────────────────────────────

export const stores = {
  title: 'Butiker',

  emptyState: {
    title:      'Inga butiker än',
    subtitle:   'Lägg till en butik så kan dina inköpslistor sorteras efter butikens layout',
    cta:        'Lägg till butik',
    noResults:  (q: string) => `Inga butiker matchar "${q}"`,
  },

  search: {
    placeholder: 'Sök butik…',
  },

  sort: {
    modalTitle: 'Sortera',
    a11y:      'Sortera butiker',
    az:        'A–Ö',
    addedOrder:'I tilläggsordning',
  },

  card: {
    categories: (n: number) => `${n} kategorier`,
    selected:   'vald',
    clearA11y:  'Rensa butik',
  },

  createModal: {
    title:       'Ny butik',
    placeholder: 't.ex. Ica, Coop, Willys…',
    create:      'Skapa',
    add:         'Lägg till butik',
  },

  detail: {
    sections: {
      visible: 'SYNLIGA KATEGORIER',
      hidden:  'DOLDA',
    },
    hint:        'Ordningen matchar butikens layout. Dölj kategorier du inte använder och lägg till egna under "Egna kategorier".',
    allHidden:   'Alla standardkategorier är dolda - du måste välja minst en.',
    hiddenHint:  'Standardkategorier du har dolt. Tryck visa-knappen för att lägga tillbaka dem sist i listan.',
    subHint:     (parent: string) => `Slå på sub-kategorier som du vill se som egna sektioner i listan. Övriga samlas under ${parent}.`,
    saveButton:  'Spara ändringar',
  },

  renameModal: {
    title: 'Byt namn',
  },

  delete: {
    title:   'Ta bort butik',
    message: (name: string) => `Ta bort "${name}"?`,
  },

  actions: {
    rename: 'Byt namn',
    delete: 'Ta bort butik',
  },

  toasts: {
    created:     (name: string) => `${name} skapad`,
    saved:       'Sparat',
    renamed:     'Namn ändrat',
    deleted:     (name: string) => `${name} borttagen`,
    errorLoad:   (name: string) => `Kunde inte ladda ${name}`,
    errorCreate: 'Kunde inte skapa butik',
    errorSave:   'Kunde inte spara',
    errorRename: 'Kunde inte byta namn',
    errorDelete: 'Kunde inte ta bort butiken',
    notFound:    'Butiken kunde inte hittas.',
  },
};

// ─── Komponenter ──────────────────────────────────────────────────────────────

export const components = {
  multiMemberPicker: {
    label:          (n: number) => `Tilldela person${n !== 1 ? 'er' : ''}`,
    none:           'Ingen',
    rotation: {
      label:        'Turas om automatiskt',
      onSub:        'Tur byts efter varje avbockning - alla turas om i listan.',
      offSub:       'Alla i listan är gemensamt ansvariga (ingen rotation).',
    },
    order: {
      label:        'Turordning',
      sub:          'Den som är överst börjar.',
      moveUp:       'Flytta upp',
      moveDown:     'Flytta ned',
    },
  },

  recurrencePicker: {
    label:          'Upprepning',
    types: {
      none:    'Ingen',
      daily:   'Dag',
      weekly:  'Vecka',
      monthly: 'Månad',
      yearly:  'År',
    },
    every:          'Var',
    weekdays:       'Veckodagar',
    repeatsEvery:   'Upprepas',
    dayOfMonth:     'Dag i månaden',
    weekOfMonth:    'Vecka i månaden',
    ends:           'Slutar',
    neverEnds:      'Upphör aldrig',
    chooseDate:     'Välj datum',
    monthly: {
      dayOfMonth:  (d: number) => `Varje månad den ${d}:e`,
      weekday:     (ordinal: string, day: string) => `${ordinal} ${day} i månaden`,
    },
  },

  confirmDialog: {
    defaultCancel:  'Avbryt',
    defaultConfirm: 'OK',
  },

  conflictBanner: {
    showLatest: 'Visa senaste',
  },
};

// ─── Historik-formattering (gemensam) ─────────────────────────────────────────

export const history = {
  today:     'Idag',
  yesterday: 'Igår',
  daysAgo:   (n: number) => `${n} dagar sedan`,
  everyDay:  'Varje dag',
  everyNWeeks: (n: number) => `${n}:e vecka`,
  dayOfMonth:  (d: number) => `Den ${d}:e varje månad`,
  weekdayOfMonth: (ordinal: string, day: string) => `${ordinal} ${day} varje månad`,
  onceAYear: 'En gång per år',
};
