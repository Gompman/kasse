# Kasse (Container)

Stand-Kasse mit Produktpaketen. Preise liegen als JSON auf einem Docker-Volume, Auth bleibt außen (z. B. Pangolin).

## Dev in WSL (`kasse-dev`)

Nicht in `Ubuntu-BTP-CI` arbeiten. Die App läuft in einer eigenen Distro:

```bash
wsl -d kasse-dev
cd "/mnt/c/Selling App/kasse"
bash dev/start.sh
```

Öffnen: [http://localhost:3000](http://localhost:3000)

Erstes Einrichten (falls die Distro neu ist):

```bash
wsl -d kasse-dev -u root -- bash "/mnt/c/Selling App/kasse/dev/wsl-setup.sh"
```

## Lokal ohne Docker

```bash
node server.js
```

Öffnen: [http://localhost:3000](http://localhost:3000)

## Docker

```bash
docker compose up --build
```

Daten liegen im Volume `kasse-data` unter `/data/packs/<paket>.json`.

Unraid: [`docker-compose.unraid.yaml`](docker-compose.unraid.yaml) — Image von GHCR, Daten unter `/mnt/user/appdata/kasse`.

## Bedienung

- Oben das **Paket** wählen (`/p/vereinsfest`, `/p/getraenke`, …).
- **Pflegen**: Namen und Preise ändern, Artikel hinzufügen, Paket anlegen oder duplizieren, **Speichern**.
- **Kasse**: wie bisher antippen, Rückgeld, nächster Kunde.

## Image (GitHub Actions)

Jeder Push auf `main` baut das Image und legt es in der GitHub Container Registry ab:

`ghcr.io/<account>/<repo>:latest`

Pull auf dem Server:

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker pull ghcr.io/<account>/<repo>:latest
```

PRs bauen das Image nur, ohne es zu veröffentlichen. Es gibt kein automatisches Deploy — auf dem Server weiterhin `docker compose pull && docker compose up -d`.
