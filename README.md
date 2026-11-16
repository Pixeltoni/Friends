# 🎁 Wichteln – Auslosung für Freunde

**➡️ Zur Seite: https://pixeltoni.github.io/Friends/** · [Admin-Bereich](https://pixeltoni.github.io/Friends/admin.html)

Eine kleine Website zum Wichteln, gehostet mit **GitHub Pages**. Die Daten liegen in einer **Supabase**-Datenbank (Projekt „Wichteln“, EU/Frankfurt).

1. **Eintragen:** Alle öffnen die Startseite und tragen sich mit Name, einer selbst gewählten PIN und optional einem Wunschzettel ein.
2. **Auslosen:** Sobald alle dabei sind, startet die Admin-Person unter `admin.html` die Auslosung (ab 3 Personen).
3. **Wichtel sehen:** Danach sieht jede Person auf der Startseite, wen sie beschenkt (inkl. Wunschzettel). Auf einem anderen Gerät meldet man sich mit Name + PIN an.

Die Auslosung ist garantiert gültig: Niemand zieht sich selbst, und alle werden genau einmal beschenkt. Auch die Admin-Person sieht die Paare nicht.

## Aufbau

- `index.html` – Startseite für alle
- `admin.html` – Admin-Bereich
- `api.js` – Verbindung zu Supabase
- `style.css` – Aussehen
- Supabase-Datenbank:
  - Alle Daten liegen im Schema `private`, das von außen **nicht** lesbar ist.
  - Die Website ruft nur die Funktionen `wichtel_*` auf. Diese prüfen PIN bzw. Admin-Passwort selbst.
  - PINs und Admin-Passwort werden nur gehasht (bcrypt) gespeichert. Nach zu vielen Fehlversuchen wird das Anmelden 15 Minuten gesperrt.

Der Key in `api.js` ist ein öffentlicher „Publishable Key“ und darf im Code stehen.

## GitHub Pages einschalten

Im Repository auf GitHub: **Settings → Pages → Build and deployment**

- Source: **Deploy from a branch**
- Branch: **`main`**, Ordner **`/ (root)`**
- **Save**

Nach ca. einer Minute ist die Seite unter `https://<benutzername>.github.io/<repo>/` erreichbar, der Admin-Bereich unter `…/admin.html`.

## Lokal ausprobieren

```bash
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen (nutzt dieselbe Supabase-Datenbank).
