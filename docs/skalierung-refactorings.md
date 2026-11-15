# Family Agenda – Refactorings für günstiges Hosting als SaaS

Stand: 06.11.2026 · Grundlage: Analyse des Repos `artkoenig/family-agenda`

> **Teilweise abgelöst.** Phase 2 sowie die Punkte 1.1, 1.4 und 1.7 für das öffentliche Repo sind durch
> [#90](https://github.com/artkoenig/family-agenda-cloud/issues/90) und
> [ADR-0001](adr/0001-routing-module-is-a-separate-program-in-front-of-unmodified-cores.md) abgelöst: Der geschlossene
> Teil ist ein eigenes Programm (das Routing-Modul), das keine öffentlichen Pakete importiert und per HTTP mit einem Pool
> unveränderter öffentlicher Cores spricht, statt viele Instanzen in einem Prozess zu betreiben. Grund ist die Lizenz
> (AGPLv3 mit DCO, ohne CLA). Die Leitlinie, dass das private Repo „die öffentlichen Pakete als Bibliothek nutzt“, gilt damit nicht mehr. Nicht
> nach diesen Abschnitten bauen.

## Ziel und Leitlinien

- **Selbsthosting bleibt vollständig und unabhängig.** Das öffentliche Repo (AGPLv3) bekommt kein Konzept von Mandanten. Jede Änderung muss auch für Selbsthoster sinnvoll sein.
- **SaaS-Anteile liegen in einem privaten Repo** (`family-agenda-cloud`), das die öffentlichen Pakete als Bibliothek nutzt.
- **Eine Datenbank pro Familie.** ADR-0013 (keine `family_id`) bleibt gültig; die Familie ergibt sich weiter aus der Datenbank.
- **Gemeinsame Prozesse.** Ein Pool aus api- und Worker-Prozessen bedient viele Familien, statt eines Compose-Stacks pro Familie.

## Phase 0 – Vor dem Umbau

| # | Maßnahme | Begründung |
|---|---|---|
| 0.1 | **Lizenz- und Beitragsmodell klären** (ADR) | AGPLv3 mit DCO und ohne CLA (ADR-0008): Ein privates Repo, das AGPL-Code im selben Prozess nutzt, ist ein abgeleitetes Werk. Heute sind Sie alleiniger Urheber, aber nach dem ersten externen Beitrag nicht mehr. Optionen: CLA einführen, den SaaS-Code den Nutzern unter AGPL bereitstellen oder nur eigenen Code verwenden. Juristisch prüfen lassen. |
| 0.2 | **ADR-0004 teilweise ablösen** | ADR-0004 schließt ein gehostetes Angebot aus. Neues ADR: gehostete Instanzen mit gemeinsamen Prozessen und einer Datenbank pro Familie; Messenger und WebUntis bleiben beim Selbsthosting. |
| 0.3 | **ADR „The Instance is embeddable“** | Legt fest: Das öffentliche Repo liefert eine einbettbare Instanz für genau eine Familie und kennt keine Mandanten. |

## Phase 1 – Refactorings im öffentlichen Repo

Jedes Refactoring ist ein eigenes Issue; `pnpm check` bleibt grün, und für Selbsthoster ändert sich das Verhalten nicht.

### 1.1 Composition Root als Bibliothek

(abgelöst, siehe oben)

- **Heute:** `bootApplication` und `bootWorker` (`apps/api/src/composition-root.ts`) erzeugen ihre Adapter selbst aus `readConfig()`, also aus Dateipfaden und `DATABASE_URL`.
- **Ziel:** Beide Funktionen bekommen die Adapter übergeben (DB-Verbindung, `SecretStore`, `BlobStore`, `Extractor`, `JobQueue`, `Clock`).
- **Selbsthosting:** Eine Fabrik `selfHostedAdapters(config)` liefert die heutigen Standard-Adapter; `main.ts` bleibt die Verdrahtung.
- **Nutzen:** Ein Prozess kann viele Instanzen erzeugen, je eine pro Familie.

### 1.2 Keine Zustände auf Modulebene

- Prüfen, dass außer dem Plugin-Register nichts pro Prozess global ist. `source-registry.ts` nutzt `registerHooks`; das Register wird einmal geladen und zwischen Instanzen geteilt.
- Die Matrix-Services (Synapse und Bridges, ADR-0011) lassen sich pro Instanz abschalten.
- Testen: Zwei Instanzen mit zwei Datenbanken in einem Prozess sehen gegenseitig keine Daten.

### 1.3 Worker-Ablauf als Funktion mit Fälligkeitszeit

- **Heute:** `apps/worker/src/main.ts` fragt alle 5 s `pollDue()` ab, gleicht die Services alle 5 s ab und führt die Retention stündlich aus; alles per `setInterval` im Prozess.
- **Ziel:**
  - `runDueWork(worker)` führt einen Durchlauf aus (Polling, Extraktion).
  - `nextDueAt(): Date | null` sagt, wann wieder etwas fällig ist.
  - Retention und Secret-Sweep sind ebenfalls einzeln aufrufbar.
- **Selbsthosting:** `main.ts` schläft bis `nextDueAt()` statt blind alle 5 s abzufragen; das spart auch auf einem Raspberry Pi Strom.
- **SaaS:** Ein zentraler Scheduler öffnet nur Datenbanken von Familien, bei denen etwas fällig ist. Ohne das wären es bei 1.000 Familien 200 Abfragen pro Sekunde im Leerlauf.

### 1.4 HTTP-App ohne eigenen Server

(abgelöst, siehe oben)

- `createApp(application)` gibt die Hono-App zurück; erst `main.ts` bindet sie an einen Port.
- Das private Gateway kann dann je nach Hostname an die App der Familie weiterreichen.

### 1.5 Migrationen per Programmaufruf

- `runMigrations(url)` existiert schon; es wird als stabiles, exportiertes API gekennzeichnet.
- Damit kann das private Repo beim Rollout alle Familien-Datenbanken nacheinander migrieren.

### 1.6 Contract-Tests für die Ports

- Exportierte Testsuites für `BlobStore`, `SecretStore`, `Extractor` und `JobQueue`.
- Private Adapter (S3, KMS, LLM mit Kontingenten) durchlaufen dieselben Prüfungen wie die Standard-Adapter.

### 1.7 Pakete veröffentlichen

(abgelöst, siehe oben)

- **Heute:** Alle Pakete sind `"private": true`, und der Code läuft über `tsx` zur Laufzeit.
- **Ziel:**
  - Vorab nach JavaScript bauen (weniger RAM, schnellerer Start; hilft auch dem Selbsthosting-Image).
  - Versioniert in GitHub Packages veröffentlichen; das öffentliche API (Composition-Root-Exporte, Ports, Contracts) folgt SemVer.
- **Alternative:** Das private Repo nutzt einen Release-Tag als Git-Submodul. Einfacher, aber gröber.

### 1.8 Automatisierbare Einrichtung (auch für Selbsthoster nützlich)

- **Erster Admin:** `/setup` ist offen, bis der erste Admin existiert (`apps/api/src/http/app.tsx:240`). Wer die Adresse zuerst aufruft, wird Admin.
  - Neu: CLI-Befehl `family-agenda create-admin <email>` oder ein Einmal-Token für `/setup`.
- **LLM-Endpunkt:** Heute nur im Admin-Bereich einstellbar.
  - Neu: CLI-Befehl oder Umgebungsvariable zum Setzen des Endpunkts.
- Die CLI kennt bisher nur `reset-admin-password`.

### 1.9 Leitplanken

- depcruise-Regel für die öffentliche Bibliotheks-API.
- CI-Lauf der API-Tests mit **zwei Familien** (zwei Datenbanken in einem Prozess), damit Fehler bei der Trennung auffallen, die im Selbsthosting nie sichtbar würden.

## Phase 2 – Inhalt des privaten Repos (zur Einordnung)

(abgelöst, siehe oben)

| Baustein | Aufgabe |
|---|---|
| Steuerungsdatenbank | Familien-Register (Hostname, Datenbank-URL, Status, verschlüsselter Familienschlüssel, Tarif) und zentraler Zeitplan der Fälligkeiten |
| Pool der Instanzen | Instanzen bei Bedarf erzeugen, LRU-Cache, DB-Pools mit 1–2 Verbindungen, im Leerlauf schließen |
| Gateway | Hono-Router nach Hostname, Wildcard-Domain, TLS |
| Scheduler | Liest `nextDueAt()`, ruft `runDueWork()` pro fälliger Familie auf, verteilt Arbeit per Lease auf mehrere Knoten |
| Adapter | KMS-basierter `SecretStore`, S3-`BlobStore` mit Präfix pro Familie, LLM-Extractor mit Kontingenten |
| Provisionierung | Datenbank anlegen, migrieren, ersten Admin einladen; Löschen (Datenbank, Blobs, Schlüssel); Backups pro Familie |
| Rollout | Migrationen über alle Familien-Datenbanken; Familien mit veralteter Datenbank werden bis dahin übersprungen |
| Sonstiges | Registrierung, Abrechnung, Monitoring; Matrix (und eventuell WebUntis) im SaaS-Betrieb abgeschaltet |

## Reihenfolge

1. Phase 0: Lizenz-ADR, Ablösung von ADR-0004, ADR „Instance is embeddable“
2. 1.8 (erster Admin, LLM per CLI): hilft sofort auch dem Pilotbetrieb mit unveränderten Compose-Stacks
3. 1.1 → 1.2 → 1.4 → 1.3 → 1.5
4. 1.6 und 1.7 (Contract-Tests, Veröffentlichung), dazu 1.9
5. Privates Repo: Gateway und Pool mit Datei-Adaptern → Scheduler → S3/KMS → Provisionierung und Abrechnung

## Erwartete Wirkung

| | Heute (ein Stack pro Familie) | Nach dem Umbau |
|---|---|---|
| RAM pro Familie im Leerlauf | ca. 350 MB ohne Messenger, ca. 800 MB mit WhatsApp (geschätzt) | wenige MB plus Datenbank |
| Familien pro 8-GB-Server | ca. 12–15 ohne Messenger | mehrere hundert bis tausend (Postgres ist die Grenze) |
| Serverkosten pro Familie | ca. 0,80 € | Cent-Bereich |
| Hauptkostentreiber | Server-RAM | LLM, OCR, Polling |

Alle Werte sind Schätzungen und sollten mit Test-Familien gemessen werden.
