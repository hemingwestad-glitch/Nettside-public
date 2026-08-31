# SOL — oppsett

Space weather-monitor for BioSat. Denne fila dekker tre ting: hvor webhooken
skal lagres, hvordan du kjører den automatisk, og hva DevOps trenger for å
deploye den på OpenStack.

---

## 1. Legg webhooken i en fil, ikke i .bashrc

Webhook-URL-en er en hemmelighet. Slack leter aktivt etter lekkede hemmeligheter
og trekker dem tilbake, så den skal ikke i repoet, ikke på kommandolinjen (den
havner i `~/.bash_history` og i `ps`-output), og ikke i crontab.

```bash
mkdir -p ~/.config/sol
cat > ~/.config/sol/env << 'EOF'
SOL_WEBHOOK='https://hooks.slack.com/workflows/DIN/URL/HER'
EOF
chmod 600 ~/.config/sol/env
```

`chmod 600` betyr at bare du kan lese den. Sjekk at det ble riktig:

```bash
ls -l ~/.config/sol/env      # skal vise -rw-------
```

Har du allerede lagt `export SOL_WEBHOOK=...` i `~/.bashrc`, fjern den linja og
kjør `history -d` på kommandoen, eller rediger `~/.bash_history` direkte.

---

## 2. Verifiser at det virker

```bash
cd ~/Dokumenter/02-Verv/02-Orbit-NTNU/Biosat/SOL
set -a; source ~/.config/sol/env; set +a

./SOL.py --check-slack --flavor workflow
./SOL.py --brief --flavor workflow
```

Har du en app-webhook (`/services/` i URL-en) i stedet for en Workflow
Builder-webhook (`/workflows/`), dropp `--flavor workflow`. Skriptet advarer
hvis du blander dem.

---

## 3. Seed før du starter automatikken

Dette er lett å glemme og gir en ubehagelig overraskelse. Uten seeding tror
skriptet at alt som ligger i feeden akkurat nå er nytt, og fyrer av varsler for
hendelser som er ukesgamle.

```bash
./SOL.py --seed
```

---

## 4. Automatikk: systemd user timer (anbefalt på laptop)

Grunnen til at dette slår cron på en bærbar: `Persistent=true` gjør at en
kjøring som ble hoppet over mens maskinen sov, tas igjen når den våkner. Cron
hopper bare over den stille. Du får også logg gratis via `journalctl`, og du
slipper wrapper-skriptet helt, fordi systemd kan lese env-fila selv.

Lag de fire filene:

```bash
mkdir -p ~/.config/systemd/user
```

`~/.config/systemd/user/sol-poll.service`:

```ini
[Unit]
Description=SOL space weather poller for BioSat
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=%h/.config/sol/env
WorkingDirectory=%h/Dokumenter/02-Verv/02-Orbit-NTNU/Biosat/SOL
ExecStart=%h/Dokumenter/02-Verv/02-Orbit-NTNU/Biosat/SOL/SOL.py --poll --flavor workflow
TimeoutStartSec=120
```

`~/.config/systemd/user/sol-poll.timer`:

```ini
[Unit]
Description=Run the SOL space weather poller every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Persistent=true
AccuracySec=30s

[Install]
WantedBy=timers.target
```

`~/.config/systemd/user/sol-brief.service`:

```ini
[Unit]
Description=SOL morning space weather brief for BioSat
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=%h/.config/sol/env
WorkingDirectory=%h/Dokumenter/02-Verv/02-Orbit-NTNU/Biosat/SOL
ExecStart=%h/Dokumenter/02-Verv/02-Orbit-NTNU/Biosat/SOL/SOL.py --brief --flavor workflow
TimeoutStartSec=120
```

`~/.config/systemd/user/sol-brief.timer`:

```ini
[Unit]
Description=Post the SOL morning brief on weekdays

[Timer]
OnCalendar=Mon..Fri 07:30
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
```

`OnCalendar` bruker lokal tid, så 07:30 blir 07:30 i Trondheim og følger
sommertid automatisk.

Slå det på:

```bash
systemctl --user daemon-reload
systemctl --user enable --now sol-poll.timer sol-brief.timer
```

Sjekk at det står riktig i køen:

```bash
systemctl --user list-timers 'sol-*'
```

Kjør en gang manuelt for å se at unit-fila faktisk virker:

```bash
systemctl --user start sol-poll.service
journalctl --user -u sol-poll.service -n 30 --no-pager
```

### Én ting å vite om user timers

De kjører bare mens du er logget inn. Låser du skjermen er det greit, men
logger du helt ut stopper de. Vil du at de skal kjøre uansett:

```bash
loginctl enable-linger $USER
```

---

## 5. Alternativ: cron

Fungerer også, men cron kjører med et nesten tomt miljø og leser **ikke**
`~/.bashrc`. Et `export SOL_WEBHOOK=...` som virker i terminalen din er
usynlig for cron. Derfor trengs `sol-run.sh`, som laster env-fila eksplisitt.

```bash
chmod +x sol-run.sh
crontab -e
```

```cron
*/10 * * * *  $HOME/Dokumenter/02-Verv/02-Orbit-NTNU/Biosat/SOL/sol-run.sh --poll --flavor workflow
30 7   * * 1-5 $HOME/Dokumenter/02-Verv/02-Orbit-NTNU/Biosat/SOL/sol-run.sh --brief --flavor workflow
```

`sol-run.sh` logger til `~/.local/state/sol/sol.log`, roterer på 1 MiB, og
bruker `flock` slik at en hengende kjøring ikke overlapper med neste.

---

## 6. Til DevOps: deploy på OpenStack

Alt de trenger å vite:

- Python 3, kun stdlib. Ingen pip, ingen venv, ingen requirements.
- Én fil, `SOL.py`. `sol-run.sh` er valgfri.
- Utgående HTTPS til `services.swpc.noaa.gov` og `hooks.slack.com`. Ingenting
  inngående.
- Hemmelighet: `SOL_WEBHOOK`, én miljøvariabel.
- Skriver én JSON-statefil. Sett plassering med `--state`, f.eks.
  `--state /var/lib/sol/state.json`. Den er liten og bounded (maks 500
  nøkler), og skriving er atomisk via tempfil og `os.replace`.
- Kjør `--seed` én gang etter deploy, før timeren startes.
- To jobber: `--poll` hvert 10. minutt, `--brief` én gang om morgenen.
- Exitkoder: `SOL.py` gir 0 ved suksess og 1 ved feilet henting eller posting.
  `sol-run.sh` legger til 2 for konfigurasjonsfeil (manglende env-fil,
  manglende webhook, SOL.py ikke kjørbar).

Samme unit-filer som over, men som system-units under
`/etc/systemd/system/`, med `User=sol`, `EnvironmentFile=/etc/sol/env` og
`StateDirectory=sol`. Da havner statefila i `/var/lib/sol/` automatisk med
riktige rettigheter.

---

## Feilsøking

| Symptom | Sannsynlig årsak |
|---|---|
| `nothing new` hver gang | Normalt. Poller sier bare fra om det som er nytt. Bruk `--status` for å se hele bildet. |
| Ingenting kommer i Slack | Kjør `./SOL.py --check-slack --flavor workflow`. Den skiller nettverksfeil fra Slack-feil. |
| Workflow feiler i Slack | En variabel mangler. Alle fem — `level`, `code`, `headline`, `details`, `body` — må være definert som Text i Workflow Builder, med nøyaktig de navnene. |
| Timer kjørte ikke | `systemctl --user list-timers 'sol-*'`, så `journalctl --user -u sol-poll -n 50`. |
| Virker i terminal, ikke i cron | Env-fila lastes ikke. Bruk `sol-run.sh`, ikke `SOL.py` direkte, i crontab. |
| Varsler for gamle hendelser | Du glemte `--seed`. Kjør den, så blir det stille igjen. |
