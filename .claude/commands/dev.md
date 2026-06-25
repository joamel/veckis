Du är en dev-miljö-assistent för Veckis. Användaren har skrivit `/dev`. Starta hela lokala dev-stacken i rätt ordning. Stoppa och rapportera om något steg misslyckas.

## Stack

- **Docker** – PostgreSQL på port 5432 (`docker-compose.yml` i repo-roten)
- **Backend** – `npm run dev` i `backend/` (tsx watch, kör `prisma migrate deploy` i predev)
- **Frontend** – `npm run dev` i `app/` (Expo Metro på port 8081)

## Steg

**1. Kontrollera Docker-daemon**

Kör `docker info` (PowerShell, timeout 10s). Om det misslyckas eller returnerar fel:
- Starta Docker Desktop: `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` 
- Vänta tills daemon svarar: polla `docker info` var 5:e sekund i max 60s.
- Om daemon fortfarande inte svarar efter 60s → rapportera fel och avbryt.

**2. Starta PostgreSQL-containern**

```powershell
docker compose -f C:\Users\joaki\repos\veckis\docker-compose.yml up -d
```

Vänta tills containern är healthy:
```powershell
docker inspect veckis-db-1 --format "{{.State.Health.Status}}"
```
Polla var 3:e sekund, max 30s. Om "healthy" → fortsätt. Om timeout → rapportera och avbryt.

Containernamnet kan skilja sig — prova `veckis_db_1` om `veckis-db-1` inte finns.

**3. Starta backend i bakgrunden**

Kör med Bash-verktyget (`run_in_background: true`):
```bash
cd /c/Users/joaki/repos/veckis/backend && npm run dev 2>&1
```

Vänta på att se `Server running on port` eller `listening` i outputen (polla output-filen i ~15s). Om backend inte startar inom 30s → rapportera vad output-filen innehåller.

**4. Starta Expo Metro i bakgrunden**

Kör med Bash-verktyget (`run_in_background: true`):
```bash
cd /c/Users/joaki/repos/veckis/app && npm run dev 2>&1
```

Vänta på `Waiting on http://localhost:8081` i outputen (polla ~20s).

**5. Rapportera**

När allt är igång, skriv ett kort statusmeddelande:
- ✓ Docker / PostgreSQL
- ✓ Backend (port)
- ✓ Metro (http://localhost:8081)
- Påminn om att öppna Expo Go och skanna QR, eller trycka `w` för webb.

## Felsökning

- **tsx watch kraschar direkt** (Windows-issue): döda processen, starta om backend utan `predev` via `npx tsx watch src/index.ts` direkt.
- **Port 8081 upptagen**: kör `Get-NetTCPConnection -LocalPort 8081 -State Listen | Select-Object OwningProcess` och döda processen, starta sedan om Metro.
- **prisma migrate deploy misslyckas**: DB är förmodligen inte healthy än — vänta och försök igen.
