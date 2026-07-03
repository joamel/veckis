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
  tabs: {
    shopping:        'Inköp',
    menu:            'Meny',
    schedule:        'Kalender',
    chores:          'Sysslor',
    settings:        'Hushållet',
  },
};

// ─── Sysslor ─────────────────────────────────────────────────────────────────

export const chores = {
  title:             'Sysslor',

  freqLabels: {
    once:            'En gång',
    daily:           'Dagligen',
    weekly:          'Varje vecka',
    biweekly:        'Varannan vecka',
    monthly:         'Månadsvis',
  },

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
    today:   'idag',
    overdue: (days: number) => `förfallen ${days} ${days === 1 ? 'dag' : 'dagar'}`,
    done:    'Klar',
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
    recurring:       (n: number) => `${n} återkommande syssla${n === 1 ? '' : 'r'} döljs tills nästa tillfälle`,
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
    deleted:         'Syssla borttagen',
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
  title: 'Kalender',

  emptyState: {
    title:    'Inget planerat',
    subtitle: 'Lägg till en aktivitet på den här dagen.',
    cta:      'Ny aktivitet',
  },

  editScope: {
    dialogTitle: 'Redigera aktivitet',
    title:       'Vilka tillfällen vill du redigera?',
    single:      'Bara det här',
    series:      'Hela serien',
  },

  deleteScope: {
    title:      'Ta bort aktivitet',
    message:    (title: string) => `Ta bort "${title}"?`,
    single:     'Bara den här',
    series:     'Hela serien',
  },

  deleteOnce: {
    title:      'Ta bort',
    confirm:    'Ta bort',
  },

  toasts: {
    created:    'Aktivitet skapad',
    saved:      'Aktivitet sparad',
    deleted:    'Aktivitet borttagen',
    errorLoad:  'Kunde inte ladda schemat',
    errorCreate:'Kunde inte skapa schemapost',
    errorSave:  'Kunde inte spara aktiviteten',
    errorDelete:'Kunde inte ta bort',
  },

  actions: {
    viewRecipe: 'Visa recept',
    goToMenu:   'Gå till Meny',
    goToChores: 'Gå till Sysslor',
  },

  sections: {
    meals:      'MATRÄTTER',
    chores:     'SYSSLOR',
    entries:    'AKTIVITETER',
  },

  allDay: 'Heldag',

  shared: {
    isShared:     'Gemensam kalender',
    isPrivate:    'Bara för mig',
    sharedSub:    'Syns för alla i hushållet',
    privateSub:   'Syns bara för dig',
  },

  form: {
    titleLabel:       'Titel',
    titlePlaceholder: 'Titel, t.ex. Träning',
    timeLabel:        'Tid (valfritt)',
    assignLabel:      'Tilldela personer (valfritt)',
    responsibleLabel: 'Ansvarig',
    noOne:            'Ingen',
    reminderLabel:    'Påminnelse',
    reminderOnSub:    'Notis innan aktiviteten startar',
    reminderOffSub:   'Ingen påminnelse',
    newTitle:         'Ny aktivitet',
    editEntryTitle:   'Redigera aktivitet',
    editChoreTitle:   'Redigera syssla',
  },

  filter: {
    title:      'Filtrera på person',
    popupTitle: 'Filter',
    clear:      'Rensa',
    all:        'Alla',
  },

  weekPicker: {
    title:      'Gå till dag',
    startDate:  'Startdatum',
    endDate:    'Slutdatum',
  },

  weekLabel: (n: number) => `Vecka ${n}`,

  view: {
    monthToggle: 'Månad',
    weekToggle:  'Vecka',
  },

  newRecurrence: {
    intervalUnit: { daily: 'dag', weekly: 'vecka', monthly: 'månad', yearly: 'år' } as Record<string, string>,
  },

  recurrenceSummary: {
    once:        'Engångstillfälle',
    every:       (weeks: number) => weeks > 1 ? `var ${weeks}:e ` : 'varje ',
    daily:       (weeks: number) => weeks > 1 ? `Var ${weeks}:e dag` : 'Varje dag',
    weekly:      (every: string, days: string) => `${every}vecka${days ? ` (${days})` : ''}`,
    monthly:     (every: string) => `${every}månad`,
    yearly:      (every: string) => `${every}år`,
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
    before:         (times: string) => `${times} innan`,
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
    filter: {
      title:   'Filtrera på person',
      message: 'Tryck här för att bara visa aktiviteter (och sysslor) för en eller flera personer. Filtret gäller både kalendern och sysslor-fliken.',
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
  title: 'Meny',

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
    loadError: {
      title:   'Fel',
      message: 'Kunde inte ladda menyn',
    },
    removeFromMenu: {
      title:  'Ta bort från menyn?',
      remove: 'Ta bort',
    },
    dayOccupiedMove: {
      title:   'Dag redan planerad',
      message: (day: string) => `${day} har redan en rätt planerad. Flytta ändå?`,
      confirm: 'Flytta',
    },
    replaceRecipe: {
      title:   'Byt ut rätt',
      message: (oldTitle: string, newTitle: string) => `Ersätt "${oldTitle}" med "${newTitle}"?`,
      confirm: 'Byt ut',
    },
    removeFromShoppingList: {
      title:    'Ta bort från inköpslista?',
      subtitle: 'Välj vilka listor du vill ta bort ingredienserna från',
      keep:     'Behåll',
      removeFromSelected: 'Ta bort från valda',
    },
  },

  toasts: {
    scalingAffectsNothing:    'Receptet är redan i en inköpslista - skalningen påverkar inte listan automatiskt',
    recipeAdded:              'Recept tillagd till menyn',
    transferred:              (n: number) => `${n} ${n === 1 ? 'rätt' : 'rätter'} ${n === 1 ? 'överförd' : 'överförda'} till inköpslistan`,
    removedSingle:            'Recept borttagen från menyn',
    removedMultiple:          (n: number) => `${n} recept tas bort`,
    undo:                     'Ångra',
    ingredientsTransferred:   (title: string) => `${title} överförd till inköpslistan`,
    errorFetchWeeks:          'Kunde inte hämta veckomenyer',
    errorReplace:             'Kunde inte byta ut rätten',
    errorAddRecipe:           'Kunde inte lägga till rätt',
    errorRemove:              'Kunde inte ta bort',
    errorRemoveIngredients:   'Kunde inte ta bort ingredienserna',
    errorCreateList:          'Kunde inte skapa lista',
    errorTransfer:            'Kunde inte överföra ingredienserna',
    errorTransferIngredients: 'Kunde inte lägga till ingredienserna',
    errorMove:                'Kunde inte flytta rätten',
    errorSaveServings:        'Kunde inte spara portioner',
  },

  inventory: {
    have:              'Finns',
    buy:               (amount: string, unit: string) => `köp ${amount}${unit}`,
    amountPlaceholder: 'Har',
  },

  emptyState: {
    title:    'Inga recept än',
    subtitle: 'Lägg till ett recept manuellt eller via en URL',
    noDishesPlanned: {
      title:        'Inga rätter planerade',
      subtitlePast: 'Inga rätter var planerade denna vecka.',
      subtitle:     'Planera veckans måltider så kan ni föra över ingredienserna till inköpslistan.',
      action:       'Planera en rätt',
    },
  },

  picker: {
    chooseDay:       'Välj dag',
    noDay:           'Ingen dag',
    noRecipesYet:    'Inga recept än - lägg till via Recept-fliken',
    goToRecipes:     'Gå till recept',
    createNewRecipe: 'Skapa nytt recept',
    replaceTitle:    (title: string) => `Byt ut ${title}`,
  },

  card: {
    show:             'Visa',
    replace:          'Byt ut',
    remove:           'Ta bort',
    moveToDay:        'Flytta till dag',
    servings:         (n: number, orig: number) => `${n} port (orig. ${orig})`,
    servingsOnly:     (n: number) => `${n} port`,
    ingredientsCount: (n: number) => `${n} ingredienser`,
    inShoppingList:   'I inköpslistan',
  },

  cleanup: {
    listIngredientsCount: (n: number) => `${n} ingredienser`,
  },

  bulk: {
    chooseWeekMenu:          'Välj veckomeny',
    chooseWeekMenuSub:       'Vilken veckomeny vill du importera?',
    noActiveWeek:            'Ingen veckomeny med planerade rätter',
    weekLabel:               (n: number, y: number) => `Vecka ${n}, ${y}`,
    dishesCount:             (n: number) => `${n} ${n === 1 ? 'rätt' : 'rätter'}`,
    allAlreadyAdded:         'alla redan med',
    newCount:                (n: number) => `${n} nya`,
    chooseDishes:            'Välj rätter',
    chooseDishesSub:         'Välj de rätter du vill överföra till inköpslistan.',
    next:                    'Nästa',
    whatDoYouHave:           'Vad har du hemma?',
    haveHint:                'Ange hur mycket som finns hemma. Resten läggs till inköpslistan.',
    transfer:                'Överför',
    back:                    'Tillbaka',
    chooseShoppingList:      'Välj inköpslista',
    dishesToTransfer:        (n: number) => `${n} rätt(er) att överföra`,
    noActiveList:            'Ingen aktiv inköpslista - skapa en direkt här',
    newListNamePlaceholder:  'Namnge ny lista',
    create:                  'Skapa',
    itemsCount:              (n: number) => `${n} varor`,
  },

  weekPicker: {
    title: 'Gå till vecka',
  },

  a11y: {
    templates:          'Veckomeny-mallar',
    recipesTab:         'Recept',
    transferFab:        'Överför veckomeny till inköpslista',
    saveWeekAsTemplate: 'Spara veckomeny som mall',
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
    imageLoadError: 'Kunde inte ladda bilden',
    noIngredients:  'Inga ingredienser än - tryck för att lägga till',
    originalRecipe: '↗ Originalrecept',
    cookStep:       (current: number, total: number) => `Steg ${current} av ${total}`,
    cookPrev:       'Föregående',
    cookNext:       'Nästa',
    cookDone:       'Klart!',
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
    fallbackName:  'hushållet',
  },

  fallbackUser: 'Användare',

  member: {
    localProfile:  'Lokal profil',
    admin:         'Admin',
    accountMember: 'Konto-medlem',
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
    export:       'Exportera hushållets data',
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

  confirmTitles: {
    promoteAdmin:    'Gör till admin',
    demoteAdmin:     'Ta bort admin-rättigheter',
    removeMember:    'Ta bort medlem',
    switchHousehold: 'Byt hushåll',
  },

  a11y: {
    account:               'Konto',
    adminLogs:             'Adminloggar',
    close:                 'Stäng',
    notifications:         'Inställningar',
    householdOptions:      'Hushållsalternativ',
    switchActiveHousehold: 'Byt aktivt hushåll',
    editMember:            (name: string) => `Redigera ${name}`,
  },

  modals: {
    renameHousehold: 'Byt namn på hushållet',
    deleteHousehold: 'Ta bort hushållet',
    editMember:      'Byt namn',
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
    addProfile:          'Skapa en lokal profil för ett familjemedlem utan konto.',
    deleteConfirm:       (name: string) =>
      `All data i "${name}" (sysslor, meny, inköpslistor) raderas permanent och kan inte återställas.\n\nSkriv DELETE för att bekräfta.`,
    deleteConfirmIntro:  (name: string) => `All data i "${name}" (sysslor, meny, inköpslistor) raderas permanent och kan inte återställas.`,
    deleteConfirmOutro:  'för att bekräfta.',
    joinHint:            'Ange inbjudningskoden du fick från husägaren.',
    alreadyMember:       'Du är redan medlem i det hushållet.',
    promoteAdmin:        (name: string) => `Vill du ge ${name} admin-rättigheter? Admins kan redigera hushållet och hantera medlemmar.`,
    demoteAdmin:         (name: string) => `Vill du ta bort admin-rättigheterna från ${name}?`,
    removeMemberConfirm: (name: string) => `Är du säker på att du vill ta bort ${name}?`,
    removeMemberWarning: (name: string, parts: string) => `\n\n${name} har ${parts} tilldelade. De blir utan ansvarig om du tar bort ${name}.`,
    choreCount:          (n: number) => `${n} ${n === 1 ? 'syssla' : 'sysslor'}`,
    activityCount:       (n: number) => `${n} ${n === 1 ? 'aktivitet' : 'aktiviteter'}`,
    switchHousehold:     (name: string) => `Vill du byta till "${name}"?`,
    leaveHousehold:      'Du tas bort från hushållet. Sysslor och aktiviteter som var tilldelade dig blir otilldelade. Detta kan inte ångras - be admin bjuda in dig på nytt om du ångrar dig.',
    leaveHouseholdTitle: (name: string) => `Lämna ${name}?`,
  },

  buttons: {
    createProfile:    'Skapa profil',
    joinHousehold:    'Gå med',
    switchHousehold:  'Byt',
    leaveHousehold:   'Lämna',
    removeAnyway:     'Ta bort ändå',
    deleteHousehold:  'Ta bort hushållet',
    remove:           'Ta bort',
  },

  toasts: {
    editingDone:              'Redigeringsläget avslutat',
    errorLoadChores:          'Kunde inte ladda sysslor',
    errorInvite:              'Kunde inte skapa inbjudningskod',
    errorJoin:                'Kunde inte ansluta till hushållet. Kontrollera koden.',
    errorCreate:              'Kunde inte skapa hushållet',
    errorExport:              'Kunde inte exportera data',
    errorUpdateHouseholdName: 'Kunde inte uppdatera hushållets namn',
    errorUpdateMemberName:    'Kunde inte uppdatera namnet',
    errorChangeRole:          'Kunde inte ändra roll',
    errorRemoveMember:        'Kunde inte ta bort medlem',
    errorCreateLocalProfile:  'Kunde inte skapa lokal profil',
    errorDeleteHousehold:     'Kunde inte ta bort hushållet',
    errorLeaveHousehold:      'Kunde inte lämna hushållet',
    errorShareLink:           'Kunde inte dela länk',
    householdNameUpdated:     'Hushållets namn uppdaterat',
    memberNameUpdated:        'Namnet har uppdaterats',
    memberPromoted:           (name: string) => `${name} är nu admin`,
    memberDemoted:            (name: string) => `${name} är inte längre admin`,
    memberRemoved:            (name: string) => `${name} borttagen`,
    localProfileAdded:        (name: string) => `${name} tillagd som lokal profil`,
    householdDeleted:         'Hushållet borttaget',
    householdCreated:         (name: string) => `"${name}" skapat`,
    householdJoined:          'Ansluten till hushållet',
    inviteCodeCopied:         (code: string) => `Koden ${code} kopierad`,
    inviteLinkCopied:         'Inbjudningslänk kopierad',
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
      disabledSub:  'Välj en upprepning först för att aktivera rotation.',
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

  menuTemplatesModal: {
    title:           'Mallar',
    close:           'Stäng',
    saveSection:     'SPARA DENNA VECKA SOM MALL',
    namePlaceholder: 'Snabba rätter',
    save:            'Spara',
    noItemsHint:     'Den här veckan har inga rätter att spara än.',
    useSection:      'ANVÄND EN MALL',
    pastWeekHint:    'Mallar kan inte användas på en tidigare vecka.',
    noTemplates:     'Inga mallar än. Spara en vecka ovan för att skapa din första.',
    dishCount:       (n: number) => `${n} ${n === 1 ? 'rätt' : 'rätter'}`,
    shareA11y:       (name: string) => `Dela mall ${name}`,
    deleteA11y:      (name: string) => `Ta bort mall ${name}`,
    toasts: {
      saved:          'Vecka sparad som mall',
      errorSave:      'Kunde inte spara mallen',
      applied:        (n: number, name: string) => `${n} ${n === 1 ? 'rätt' : 'rätter'} tillagda från "${name}"`,
      errorApply:     'Kunde inte använda mallen',
      errorDelete:    'Kunde inte ta bort mallen',
    },
    overwrite: {
      title:   'Veckan har redan rätter',
      message: (name: string) => `Vill du ersätta veckans meny med "${name}", eller lägga till utöver de befintliga?`,
      add:     'Lägg till',
      replace: 'Ersätt',
    },
    deleteDialog: {
      title:   'Ta bort mall',
      message: (name: string) => `Ta bort mallen "${name}"?`,
    },
  },

  notificationsModal: {
    title:    'Notiser',
    close:    'Stäng',
    types: {
      activityReminder: { title: 'Påminnelse innan aktivitet', desc: 'Innan en aktivitet startar' },
      choreOverdue:      { title: 'Förfallen syssla', desc: 'När en syssla inte hunnit bli klar' },
      listCleared:       { title: 'Inköpslista rensad', desc: 'När någon rensar en aktiv lista' },
      shopperClaimed:    { title: '"Jag handlar"', desc: 'När någon i hushållet börjar handla' },
      choreCompleted:    { title: 'Syssla avbockad', desc: 'När någon bockar av en syssla' },
      newMember:         { title: 'Ny medlem', desc: 'När någon går med i hushållet' },
    },
    deviceSection:  'DEN HÄR ENHETEN',
    activate:       'Aktivera på den här enheten',
    sendTest:       'Skicka testnotis',
    errorSave:      'Kunde inte spara notisinställningen',
    deviceStatus: {
      ok:          'Den här enheten är registrerad för notiser.',
      denied:      'Notiser är avstängda i telefonens inställningar - slå på dem för Veckis där.',
      unsupported: 'Push kräver en fysisk enhet (funkar inte i emulator).',
      error:       (err: string) => `Kunde inte registrera: ${err}`,
    },
    test: {
      noDevice:    'Ingen enhet registrerad - tryck "Aktivera på den här enheten" först',
      withErrors:  (tokens: number, err: string) => `Skickat till ${tokens} enhet(er), men fel: ${err}`,
      sent:        (tokens: number) => `Testnotis skickad till ${tokens} enhet(er)`,
      errorSend:   'Kunde inte skicka testnotis',
    },
  },

  weekNav: {
    prevWeek:    'Föregående vecka',
    nextWeek:    'Nästa vecka',
    today:       'Idag',
    dateTip: {
      title:   'Hoppa till annan vecka',
      message: 'Tryck på veckonumret för att öppna en kalender och hoppa till valfri vecka eller dag.',
    },
  },

  notFound: {
    title:       'Sidan hittades inte',
    body:        'Vi kunde inte hitta sidan du sökte. Den kan ha tagits bort, flyttats eller också är länken fel.',
    toCalendar:  'Till kalendern',
    back:        'Tillbaka',
  },

  errorBoundary: {
    title:       'Hoppsan, något gick fel',
    body:        'Ett oväntat fel inträffade. Det har rapporterats automatiskt så att vi kan titta på det.',
    retry:       'Försök igen',
    reloadPage:  'Ladda om sidan',
    hint:        'Hjälpte det inte? Prova att stänga och starta om appen.',
  },

  welcomeModal: {
    title:       'Välkommen till Veckis!',
    message:     'Här följer några korta tips och trix om hur appen fungerar. De dyker upp allteftersom du utforskar flikarna - meny, sysslor, kalender och inköpslista.',
    subtle:      'Tipsen visas bara en gång per styck och du kan slå av eller återställa dem under',
    subtleBold:  'Inställningar ⋮',
    continueAction:    'Fortsätt',
    continueA11y:      'Fortsätt med onboarding-tips',
    skipAll:           'Jag är fullärd - hoppa över tipsen',
    skipAllA11y:       'Hoppa över alla tips',
  },

  clientErrorsSection: {
    title:           'Klientfel',
    showA11y:        'Visa klientfel',
    hideA11y:        'Dölj klientfel',
    noErrors:        'Inga fel sedan senaste omstart.',
    refresh:         'Uppdatera',
  },

  datePickerModal: {
    clear: 'Rensa',
  },

  versionBanner: {
    webText:      'Ny version av Veckis tillgänglig',
    webAction:    'Ladda om',
    nativeText:   'Ny version av Veckis laddad',
    nativeAction: 'Starta om',
  },

  offlineBanner: {
    text: 'Ingen anslutning - ändringar synkas när du är online igen.',
  },

  wakeupIndicator: {
    text: 'Servern vaknar… det här tar ofta 10–20 sek första gången.',
  },

  spotlightTip: {
    defaultActionLabel: 'Förstått',
    next:                'Nästa',
    toggleOnboarding:    'Visa onboarding-tips',
    positionOf:          (position: number, total: number) => `${position} av ${total}`,
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

// ─── Inloggning / Registrering ─────────────────────────────────────────────────

export const auth = {
  appName: 'Veckis',

  placeholders: {
    email:           'E-post',
    password:        'Lösenord',
    newPassword:     'Nytt lösenord (minst 8 tecken)',
    signUpPassword:  'Lösenord (minst 8 tecken)',
    confirmPassword: 'Bekräfta lösenord',
    codeFromEmail:   'Kod från mailet',
    verificationCode:'Verifieringskod',
  },

  errors: {
    title:           'Fel',
    signInFailed:    'Inloggning misslyckades',
    sendCodeFailed:  'Kunde inte skicka kod',
    verifyFailed:    'Verifiering misslyckades',
    googleFailed:    'Google-inloggning misslyckades',
    signUpFailed:    'Registrering misslyckades',
    emailMissing: {
      title:   'E-post saknas',
      message: 'Fyll i din e-postadress först.',
    },
    passwordTooShort: {
      title:   'Lösenord för kort',
      message: 'Lösenordet måste vara minst 8 tecken.',
    },
    codeSignInUnavailable: 'Inloggning med kod är inte tillgänglig för detta konto',
    passwordsDontMatch: {
      title:   'Lösenorden stämmer inte',
      message: 'De två lösenordsfälten måste innehålla samma lösenord.',
    },
    passwordsMismatchInline: 'Lösenorden matchar inte',
  },

  signIn: {
    subtitle: {
      reset:     'Återställ lösenord',
      emailCode: 'Logga in med kod',
      password:  'Logga in på ditt hushåll',
    },
    helpText: {
      emailCode: 'Skriv din e-post så skickar vi en engångskod - säkrare än lösenord.',
      reset:     'Skriv din e-post så skickar vi en återställningskod.',
      codeSentTo:(email: string) => `Vi har skickat en kod till ${email}.`,
    },
    buttons: {
      signIn:            'Logga in',
      sendCode:          'Skicka kod',
      resetAndSignIn:    'Återställ + logga in',
      continueWithGoogle:'Fortsätt med Google',
    },
    links: {
      forgotPassword:     'Glömt lösenord?',
      backToCodeSignIn:   '← Logga in med kod istället',
      signInWithPassword: 'Logga in med lösen istället',
      noAccount:          'Inget konto? Skapa ett',
      backToSignIn:       '← Tillbaka till inloggning',
    },
  },

  signUp: {
    title:       'Skapa konto',
    verifyTitle: 'Verifiera e-post',
    codeSentTo:  (email: string) => `Koden har skickats till ${email}`,
    buttons: {
      verify:        'Verifiera',
      createAccount: 'Skapa konto',
    },
    links: {
      alreadyHaveAccount: 'Redan konto? Logga in',
    },
  },
};

// ─── Konto ────────────────────────────────────────────────────────────────────

export const account = {
  title:       'Konto',
  backA11y:    'Tillbaka',
  defaultName: 'Användare',

  sections: {
    profile: 'PROFIL',
    session: 'SESSION',
  },

  rows: {
    rename:  'Byt namn',
    signOut: 'Logga ut',
    delete:  'Ta bort kontot',
  },

  renameModal: {
    title:       'Byt namn',
    placeholder: 'Namn',
    save:        'Spara',
  },

  deleteConfirm: {
    title:   'Ta bort kontot?',
    message: 'Ditt konto och alla dina hushållsmedlemskap tas bort permanent. Detta kan inte ångras.',
    confirm: 'Ta bort kontot',
    cancel:  'Avbryt',
  },

  signOutConfirm: {
    title:   'Logga ut',
    message: 'Är du säker på att du vill logga ut?',
    confirm: 'Logga ut',
    cancel:  'Avbryt',
  },

  toasts: {
    nameUpdated:     'Namnet har uppdaterats',
    errorUpdateName: 'Kunde inte uppdatera namnet',
    errorDelete:     'Kunde inte ta bort kontot',
  },
};

// ─── Inställningar (app) ───────────────────────────────────────────────────────

export const preferences = {
  title:    'Inställningar',
  backA11y: 'Tillbaka',

  sections: {
    notifications: 'NOTISER',
    app:           'APP',
    security:      'SÄKERHET',
    about:         'OM VECKIS',
  },

  rows: {
    notifications:  'Aviseringar',
    sound:          'Ljud vid avcheckning',
    haptics:        'Vibration vid avcheckning',
    onboardingTips: 'Visa onboarding-tips',
    twoFactor:      'Tvåfaktorsautentisering',
    contactSupport: 'Kontakta support',
    privacyPolicy:  'Integritetspolicy',
    terms:          'Användarvillkor',
  },

  toasts: {
    tipsReset:           'Tips återställda - visas igen i nästa session',
    errorSecurityPortal: 'Kunde inte öppna säkerhetsinställningar',
    errorMailApp:        'Kunde inte öppna mailprogrammet',
  },

  support: {
    unknownVersion: 'okänd',
    subject:        'Veckis-support',
    body:           (version: string, platform: string) => `\n\n---\nVersion: ${version}\nPlattform: ${platform}\n`,
  },
};

// ─── Hushåll: skapa/gå med ────────────────────────────────────────────────────

export const householdSetup = {
  defaultName: 'Användare',

  title:           'Välkommen till Veckis',
  subtitle:        'Välj ett namn - det syns för andra i hushållet',
  namePlaceholder: 'Ditt namn',

  intro: 'Skapa ett nytt hushåll eller gå med i ett befintligt',

  tabs: {
    create: 'Skapa',
    join:   'Gå med',
  },

  create: {
    namePlaceholder: 'Hushållets namn, t.ex. Familjen Andersson',
    button:          'Skapa hushåll',
  },

  join: {
    codePlaceholder: 'XXXXXXXX',
    hint:            'Ange den 8-siffriga inbjudningskoden',
    button:          'Gå med',
  },

  errors: {
    title:          'Fel',
    couldNotCreate: 'Kunde inte skapa hushåll',
    invalidCode:    'Ogiltig eller utgången kod',
    ok:             'OK',
  },
};

// ─── Installation (PWA / APK) ──────────────────────────────────────────────────

export const install = {
  installed: {
    title:       'Veckis är installerat',
    body:        'Du kör redan appen som installerad PWA. Öppna den från hemskärmen.',
    openApp:     'Öppna appen',
  },

  hero: {
    title:       'Veckis',
    tagline:     'Veckomeny, sysslor och inköp för hushållet',
  },

  android: {
    cardTitle:   'Android',
    cardBody:    'Två sätt att få Veckis på din telefon:',
    apk: {
      title:     'Ladda hem appen (APK)',
      body:      'Hela appen med pushnotiser. Du behöver godkänna installation\n              från okänd källa när Android frågar.',
      download:  'Ladda hem APK',
    },
    pwa: {
      title:       'Installera som webbapp (PWA)',
      body:        'Snabbare att komma igång. Funkar offline men inga pushnotiser.',
      install:     'Installera som app',
      hintPrefix:  'Tryck på menyn (⋮) i Chrome → ',
      hintInstall: 'Installera appen',
      hintOr:      ' eller ',
      hintAddHome: 'Lägg till på startskärmen',
      hintSuffix:  '.',
    },
  },

  ios: {
    cardTitle:     'iPhone / iPad',
    cardBody:      'Apple tillåter inte direkt-installation från web. Du installerar Veckis\n            som en webbapp via Safari:',
    warningPrefix: 'Öppna denna sida i ',
    warningSafari: 'Safari',
    warningSuffix: ' - andra browsers (Chrome/Edge på iOS)\n                kan inte installera webbappar.',
    step1Prefix:   'Tryck på ',
    step1Bold:     'Dela',
    step1Suffix:   '-ikonen längst ner i Safari.',
    step2Prefix:   'Bläddra ner och välj ',
    step2Bold:     'Lägg till på hemskärmen',
    step2Suffix:   '.',
    step3:         'Bekräfta - Veckis-ikonen dyker upp på hemskärmen och fungerar som\n              en vanlig app.',
  },

  desktop: {
    cardTitle:   'Desktop (Chrome / Edge / Brave)',
    cardBody:    'Installera Veckis som ett separat fönster på datorn:',
    install:     'Installera som app',
    hintPrefix:  'Klicka på install-ikonen ',
    hintMiddle:  ' i adressfältet,\n              eller via menyn → ',
    hintBold:    'Installera Veckis',
    hintSuffix:  '.',
  },

  unsupportedDesktop: {
    firefoxName:    'Firefox',
    safariName:     'Safari',
    cardTitle:      (browser: string) => `${browser} stödjer inte PWA-install`,
    cardBodyPrefix: 'Du kan ändå använda Veckis direkt i browsern utan installation -\n            klicka bara ',
    cardBodyBold:   'Öppna webbappen',
    cardBodySuffix: ' nedan.',
    hintPrefix:     'För installation: öppna sidan i ',
    hintChrome:     'Chrome',
    hintComma:      ', ',
    hintEdge:       'Edge',
    hintOr:         ' eller ',
    hintBrave:      'Brave',
    hintSuffix:     '.',
  },

  fallback: {
    cardTitle:   'Använd webbappen direkt',
    cardBody:    'På din enhet är det enklast att bara öppna webbappen. Du kan\n            också ladda ner Android-APK om du har en Android-telefon.',
    downloadApk: 'Ladda hem Android-APK',
  },

  openWebAppLink: 'Eller öppna webbappen direkt →',
};
