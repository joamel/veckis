import { Text } from 'react-native';
import { LegalPage, legalStyles as s } from '../src/components/LegalPage';

export default function TermsScreen() {
  return (
    <LegalPage title="Användarvillkor">
      <Text style={s.h1}>Användarvillkor för Veckis</Text>
      <Text style={s.meta}>Senast uppdaterad: 2026-06-04</Text>

      <Text style={s.h2}>1. Tjänsten</Text>
      <Text style={s.p}>
        Veckis är ett verktyg för hushåll att planera veckomeny, sysslor och
        inköp tillsammans. Tjänsten tillhandahålls i befintligt skick utan
        garantier. Vi gör vårt bästa för att appen ska fungera men kan inte
        utlova obruten drift.
      </Text>

      <Text style={s.h2}>2. Konto och inloggning</Text>
      <Text style={s.p}>
        Inloggning sker via Clerk. Du ansvarar för att skydda ditt
        lösenord och för all aktivitet på ditt konto. Du måste vara minst
        13 år för att registrera ett konto.
      </Text>

      <Text style={s.h2}>3. Hushåll och delning</Text>
      <Text style={s.p}>
        När du skapar eller går med i ett hushåll delar du data med övriga
        medlemmar (recept, inköpslistor, sysslor, kalender). Bjud inte in
        personer du inte litar på — alla medlemmar kan se och ändra
        hushållets gemensamma data.
      </Text>

      <Text style={s.h2}>4. Vad du inte får göra</Text>
      <Text style={s.list}>• Använda tjänsten för olagligt innehåll</Text>
      <Text style={s.list}>• Försöka komma åt andra hushålls data</Text>
      <Text style={s.list}>• Reverse-engineer:a, ladda ner eller kopiera tjänsten i kommersiellt syfte</Text>
      <Text style={s.list}>• Spam:a invite-koder eller missbruka push-notiser</Text>

      <Text style={s.h2}>5. Innehåll du lägger till</Text>
      <Text style={s.p}>
        Du behåller äganderätten till recept, listor och övrigt innehåll du
        lägger till. Genom att använda tjänsten ger du oss rätt att lagra
        och visa innehållet för andra medlemmar i samma hushåll.
      </Text>

      <Text style={s.h2}>6. Ansvarsbegränsning</Text>
      <Text style={s.p}>
        Veckis är ett verktyg, inte en garanti. Vi ansvarar inte för
        glömda inköp, missade sysslor eller felaktig data. Säkerhetskopiera
        viktigt innehåll regelbundet.
      </Text>

      <Text style={s.h2}>7. Avsluta kontot</Text>
      <Text style={s.p}>
        Du kan när som helst lämna ett hushåll (Profil → Lämna hushåll)
        eller be admin ta bort hela hushållet. För att radera ditt
        Clerk-konto helt, kontakta <Text style={s.link}>support@veckis.app</Text>.
      </Text>

      <Text style={s.h2}>8. Ändringar</Text>
      <Text style={s.p}>
        Vi kan uppdatera dessa villkor. Större ändringar meddelas i appen.
        Fortsatt användning efter uppdatering räknas som godkännande.
      </Text>

      <Text style={s.h2}>9. Tillämplig lag</Text>
      <Text style={s.p}>
        Svensk lag tillämpas på dessa villkor. Tvister avgörs i svensk
        allmän domstol.
      </Text>

      <Text style={s.h2}>Kontakt</Text>
      <Text style={s.p}>
        <Text style={s.link}>support@veckis.app</Text>
      </Text>
    </LegalPage>
  );
}
