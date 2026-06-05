import { Text } from 'react-native';
import { LegalPage, legalStyles as s } from '../src/components/LegalPage';

export default function PrivacyScreen() {
  return (
    <LegalPage title="Integritetspolicy">
      <Text style={s.h1}>Integritetspolicy för Veckis</Text>
      <Text style={s.meta}>Senast uppdaterad: 2026-06-04</Text>

      <Text style={s.h2}>Vilka uppgifter samlar vi in?</Text>
      <Text style={s.p}>
        För att Veckis ska fungera behöver vi lagra följande information:
      </Text>
      <Text style={s.list}>• E-postadress (för inloggning via Clerk)</Text>
      <Text style={s.list}>• Visningsnamn du själv väljer ("nickname")</Text>
      <Text style={s.list}>• Push-notis-token (om du tackat ja till notiser)</Text>
      <Text style={s.list}>• Innehåll du lägger till: recept, inköpslistor, sysslor, aktiviteter</Text>
      <Text style={s.list}>• Hushållstillhörighet och roll (admin/medlem)</Text>
      <Text style={s.list}>• Aktivitetslogg för känsliga handlingar (vem ändrade vad i hushållet)</Text>

      <Text style={s.h2}>Var lagras dina uppgifter?</Text>
      <Text style={s.p}>
        Uppgifterna lagras på Render (servrar i EU/Frankfurt) i en
        PostgreSQL-databas via Neon. Inloggning hanteras av Clerk. Bilder
        (receptfoton) lagras på Cloudinary. Vi delar inga uppgifter med
        tredje part utöver dessa nödvändiga tjänsteleverantörer.
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
        (inköpslistor, recept, sysslor, kalender). Det finns ingen offentlig
        eller delad pool. Admin i hushållet kan se en aktivitetslogg över
        känsliga handlingar (rollbyten, borttagningar).
      </Text>

      <Text style={s.h2}>Hur länge sparas data?</Text>
      <Text style={s.p}>
        Data sparas så länge ditt hushåll existerar. När en medlem tas bort
        nollas hens tilldelningar på sysslor/aktiviteter, men hushållet
        finns kvar. När ett hushåll raderas av admin tas all dess data bort
        permanent (recept, inköpslistor, kalender, aktivitetslogg).
      </Text>

      <Text style={s.h2}>Dina rättigheter (GDPR)</Text>
      <Text style={s.p}>
        Du har rätt att få tillgång till, rätta eller radera dina uppgifter.
        Kontakta oss på <Text style={s.link}>support@veckis.app</Text> så
        hjälper vi dig. Du kan också radera ditt konto direkt i Profil →
        Lämna hushåll, eller be admin ta bort hela hushållet.
      </Text>

      <Text style={s.h2}>Kontakt</Text>
      <Text style={s.p}>
        Frågor om denna policy? <Text style={s.link}>support@veckis.app</Text>
      </Text>
    </LegalPage>
  );
}
