# Request to IONOS: AI Model Hub for a hosted service

Ticket: [Get IONOS's written word on serving Families through the AI Model Hub](https://github.com/artkoenig/family-agenda-cloud/issues/62). Sent by the maintainer; reply filed below.

## Message (German)

**Betreff:** AI Model Hub – Nutzung aus einem SaaS-Backend, Verarbeitungsort, Metadaten, AVV (Vertrag 39683376)

Guten Tag,

ich plane einen gehosteten Dienst für Familien: Er liest E-Mails und PDF-Anhänge (z. B. Elternbriefe aus Schule und Kita), die die Familien selbst an den Dienst weiterleiten, und extrahiert daraus Termine und Aufgaben. Dafür ruft unser Backend serverseitig `/v1/chat/completions` des AI Model Hub (Endpoint `de-txl`) mit einem Token unseres Vertrags auf. Die Familien erhalten keinen Zugang zur API und kein Token; sie sehen nur die extrahierten Termine in unserer Anwendung. Ich bitte um schriftliche Antworten auf folgende Fragen:

1. **Bestimmungsgemäße Nutzung.** Die Nutzungsbedingungen für KI-Dienste nennen in § 2.5 die interaktive Nutzung durch eine natürliche Person und in § 2.6 skript- oder softwaregesteuerte Nutzung sowie die Überlassung an Dritte als Missbrauch, „soweit in der Leistungsbeschreibung nicht ausdrücklich anders vorgesehen“ (§ 2.8). Ist die oben beschriebene Nutzung – automatisierte API-Aufrufe aus einem mandantenfähigen SaaS-Backend, die Inhalte unserer Endkunden verarbeiten – bestimmungsgemäß und zulässig? Gibt es eine vertragliche Leistungsbeschreibung für den AI Model Hub, die das vorsieht? Wenn ja: welches Dokument in welcher Fassung?
2. **Verarbeitungsort.** Findet die Inferenz für den Endpoint `de-txl` ausschließlich in Rechenzentren in Deutschland statt, auch bei Lastspitzen, Ausfällen oder Failover? Der Service-Katalog nennt die Verfügbarkeit „Global“; die KI-Nutzungsbedingungen nennen keinen Ort.
3. **Metadaten und Speicherdauer.** Welche Daten werden pro Anfrage gespeichert (z. B. Zeitstempel, Modell, Token-Anzahl, IP-Adresse) und wie lange? Werden Ein- oder Ausgaben je gespeichert, etwa zur Fehlersuche (§ 2.3 der KI-Nutzungsbedingungen)?
4. **Auftragsverarbeitung.** Ist die „Vereinbarung zur Auftragsverarbeitung für IONOS Cloud“ Version 7.4, Stand 06/2023, die aktuelle Fassung, und gilt sie für den AI Model Hub? Ist die Unterauftragnehmerliste mit Stand 11/2026 für den AI Model Hub aktuell und vollständig?

Vielen Dank und freundliche Grüße
Artjom König

## Reply

<!-- date, channel, ticket number, the answers per question, file of the PDF/mail if any -->
