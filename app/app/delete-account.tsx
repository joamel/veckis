import { Text } from 'react-native';
import { LegalPage, useLegalStyles } from '../src/components/LegalPage';

export default function DeleteAccountScreen() {
  const s = useLegalStyles();
  return (
    <LegalPage title="Radera konto">
      <Text style={s.h1}>Radera ditt konto och din data</Text>
      <Text style={s.meta}>Handlis</Text>

      <Text style={s.h2}>Radera direkt i appen</Text>
      <Text style={s.p}>
        Öppna Handlis → tryck på konto-ikonen uppe till höger (Profil) →{' '}
        <Text style={s.link}>Ta bort kontot</Text>. Bekräfta, så raderas ditt
        konto omedelbart.
      </Text>

      <Text style={s.h2}>Om du inte kan logga in</Text>
      <Text style={s.p}>
        Har du tappat åtkomst till appen? Mejla{' '}
        <Text style={s.link}>support@handlis.app</Text> från e-postadressen
        kontot är registrerat på och skriv att du vill radera ditt konto. Vi
        behandlar begäran inom 30 dagar.
      </Text>

      <Text style={s.h2}>Vilken data raderas?</Text>
      <Text style={s.p}>När du raderar ditt konto tas följande bort permanent:</Text>
      <Text style={s.list}>• Ditt konto och din e-postadress (via Clerk)</Text>
      <Text style={s.list}>• Ditt visningsnamn</Text>
      <Text style={s.list}>• Din push-notis-token</Text>
      <Text style={s.list}>• Dina hushållsmedlemskap och roll</Text>

      <Text style={s.h2}>Delat hushållsinnehåll</Text>
      <Text style={s.p}>
        Innehåll som skapats i ett delat hushåll (recept, inköpslistor,
        veckomeny, uppladdade receptbilder) tillhör hushållet, inte enbart dig.
        Är du ensam medlem försvinner det när kontot raderas. Vill du att ett
        helt hushålls data raderas kan hushållets admin ta bort hushållet, eller
        så hjälper vi dig via mejl.
      </Text>

      <Text style={s.h2}>Kontakt</Text>
      <Text style={s.p}>
        Frågor om radering? <Text style={s.link}>support@handlis.app</Text>
      </Text>
    </LegalPage>
  );
}
