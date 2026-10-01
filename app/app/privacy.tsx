import { Text } from 'react-native';
import { LegalPage, useLegalStyles } from '../src/components/LegalPage';

export default function PrivacyScreen() {
  const s = useLegalStyles();
  return (
    <LegalPage title="Integritetspolicy">
      <Text style={s.h1}>Integritetspolicy för Handlis</Text>
      <Text style={s.meta}>Senast uppdaterad: 2026-09-30</Text>

      <Text style={s.h2}>Vilka uppgifter samlar vi in?</Text>
      <Text style={s.p}>
        För att Handlis ska fungera behöver vi lagra följande information:
      </Text>
      <Text style={s.list}>• E-postadress (för inloggning via Clerk)</Text>
      <Text style={s.list}>• Visningsnamn du själv väljer ("nickname")</Text>
      <Text style={s.list}>• Push-notis-token (om du tackat ja till notiser)</Text>
      <Text style={s.list}>• Innehåll du lägger till: recept, inköpslistor, veckomeny</Text>
      <Text style={s.list}>• Hushållstillhörighet och roll (admin/medlem)</Text>
      <Text style={s.list}>• Aktivitetslogg för känsliga handlingar (vem ändrade vad i hushållet)</Text>
      <Text style={s.list}>• Bockar i butiken: kategori, tidpunkt och en pseudonym nyckel (se Butiksordning nedan)</Text>
      <Text style={s.list}>• Felrapporter när appen kraschar: felmeddelande, appversion och enhetstyp</Text>
      <Text style={s.list}>• Ungefärlig position, bara när du själv trycker "Nära mig" (se Position nedan)</Text>

      <Text style={s.h2}>Var lagras dina uppgifter?</Text>
      <Text style={s.p}>
        Backend och databasen körs på Railway (Railway Postgres) inom EU.
        Inloggning hanteras av Clerk, receptbilder lagras hos Cloudinary,
        recept och ingrediensnamn tolkas och översätts med hjälp av AI från
        Anthropic, och serverfel rapporteras till Sentry; dessa tjänsteleverantörer kan behandla vissa uppgifter utanför EU/EES
        under lämpliga skyddsåtgärder (EU:s standardavtalsklausuler). Vi delar
        inga uppgifter med tredje part utöver dessa nödvändiga tjänsteleverantörer.
      </Text>

      <Text style={s.h2}>Position</Text>
      <Text style={s.p}>
        När du letar efter en butik kan du trycka "Nära mig" för att se de
        matbutiker som ligger närmast. Då frågar appen om din ungefärliga
        position (aldrig exakt, och aldrig i bakgrunden). Positionen avrundas
        till ungefär en kilometer i telefonen innan den skickas, används bara
        för att sortera butikerna i just den sökningen och sparas inte. Du kan
        alltid ange ett postnummer i stället. Butiksdata kommer från
        OpenStreetMap.
      </Text>

      <Text style={s.h2}>Butiksordning</Text>
      <Text style={s.p}>
        När du bockar av en vara i en lista som är kopplad till en butik sparas
        varans kategori och underkategori, tidpunkten och en pseudonym nyckel —
        aldrig varans namn och aldrig vem du är. Det används för att föreslå en
        ordning på kategorierna efter hur man faktiskt går genom butiken.
        För butiker ur butiksbanken räknas bockar från alla hushåll i samma
        butik ihop, men bara standardkategorierna och först när minst två andra
        hushåll bidragit, så att inget enskilt hushålls väg genom butiken går
        att utläsa. Ingen kan se ett annat hushålls bockar. Bockarna rensas
        efter 180 dagar.
      </Text>

      <Text style={s.h2}>Push-notiser</Text>
      <Text style={s.p}>
        Om du aktiverar push-notiser registrerar vi en token från Expo Push
        Service så vi kan skicka påminnelser. Tokenet är knutet till din
        enhet, inte till andra hushållsmedlemmar. Du kan stänga av notiser
        helt i Profil-fliken.
      </Text>

      <Text style={s.h2}>Vem ser dina uppgifter?</Text>
      <Text style={s.p}>
        Endast medlemmar i samma hushåll som du ser hushållets data
        (inköpslistor, recept, veckomeny). Admin i hushållet kan se en
        aktivitetslogg över känsliga handlingar (rollbyten, borttagningar).{'\n\n'}
        Två saker är gemensamma för alla, utan koppling till dig eller ditt
        hushåll: namn på varor (till exempel "kaffefilter", utan mängd) blir
        sökförslag för andra först när minst två hushåll använt samma namn, och
        den sammanräknade butiksordningen ovan.
      </Text>

      <Text style={s.h2}>Hur länge sparas data?</Text>
      <Text style={s.p}>
        Data sparas så länge ditt hushåll existerar. När en medlem tas bort
        lämnar hen hushållet, men hushållet finns kvar för övriga. När ett
        hushåll raderas av admin tas all dess data bort permanent (recept,
        inköpslistor, veckomeny, aktivitetslogg).
      </Text>

      <Text style={s.h2}>Dina rättigheter (GDPR)</Text>
      <Text style={s.p}>
        Du har rätt att få tillgång till, rätta eller radera dina uppgifter.
        Kontakta oss på <Text style={s.link}>support@handlis.app</Text> så
        hjälper vi dig. Du kan också radera ditt konto direkt i appen
        (Profil → Ta bort kontot) — se{' '}
        <Text style={s.link}>handlis.app/delete-account</Text>.
      </Text>

      <Text style={s.h2}>Upphovsrätt & innehåll</Text>
      <Text style={s.p}>
        När du importerar ett recept från en webbadress sparar Handlis en länk till
        källan, en egen kort beskrivning (AI-genererad — vi kopierar inte källans
        text) och en kopia av receptbilden på vår egen lagring (Cloudinary) i
        stället för att länka till originalsajten. Recept hamnar i ditt privata
        hushåll och publiceras aldrig vidare. Handlis gör inga anspråk på innehåll
        som tillhör originalkällan.{'\n\n'}
        Är du rättighetshavare och vill att ett recept eller en bild tas bort?
        Mejla <Text style={s.link}>support@handlis.app</Text> med länken, så
        tar vi bort det skyndsamt.
      </Text>

      <Text style={s.h2}>Kontakt</Text>
      <Text style={s.p}>
        Frågor om denna policy? <Text style={s.link}>support@handlis.app</Text>
      </Text>
    </LegalPage>
  );
}
