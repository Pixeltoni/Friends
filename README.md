# 🎁 Wichteln – Auslosung für Freunde

Eine kleine Website zum Wichteln:

1. **Eintragen:** Alle öffnen die Startseite und tragen sich mit Name, einer selbst gewählten PIN und optional einem Wunschzettel ein.
2. **Auslosen:** Sobald alle dabei sind, startet die Admin-Person unter `/admin` die Auslosung (ab 3 Personen).
3. **Wichtel sehen:** Danach sieht jede Person auf der Startseite, wen sie beschenkt (inkl. Wunschzettel). Auf einem anderen Gerät meldet man sich mit Name + PIN an.

Die Auslosung ist garantiert gültig: Niemand zieht sich selbst, und alle werden genau einmal beschenkt. Auch die Admin-Person sieht die Paare nicht.

## Starten

Benötigt nur [Node.js](https://nodejs.org) ab Version 18, keine weiteren Pakete.

```bash
ADMIN_PASSWORD=deinGeheimnis node server.js
```

Dann im Browser öffnen:

- Startseite: http://localhost:3000
- Admin-Bereich: http://localhost:3000/admin

### Einstellungen (Umgebungsvariablen)

| Variable         | Bedeutung                                   | Standard  |
| ---------------- | ------------------------------------------- | --------- |
| `ADMIN_PASSWORD` | Passwort für den Admin-Bereich (Pflicht)    | –         |
| `PORT`           | Port des Servers                            | `3000`    |
| `DATA_DIR`       | Ordner, in dem die Daten gespeichert werden | `./data`  |

Alle Daten liegen in `data/state.json`. PINs werden nur gehasht gespeichert.

## Online stellen

Damit deine Freunde mitmachen können, muss der Server im Internet erreichbar sein. Wichtig: Der Hoster braucht **dauerhaften Speicher** für den `data`-Ordner, sonst gehen die Einträge bei einem Neustart verloren.

**Mit Docker** (z. B. auf einem eigenen Server oder Raspberry Pi):

```bash
docker build -t wichteln .
docker run -d -p 3000:3000 -e ADMIN_PASSWORD=deinGeheimnis -v wichtel-daten:/data wichteln
```

**Bei einem Hoster** wie Render, Railway oder Fly.io: Repository verbinden, Startbefehl `node server.js`, `ADMIN_PASSWORD` setzen und ein Volume/Disk unter `/data` einhängen (`DATA_DIR=/data`).

## Tests

```bash
npm test
```
