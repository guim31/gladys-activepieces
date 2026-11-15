# Activepieces

[Activepieces](https://www.activepieces.com/) ist ein Open-Source-Werkzeug für
Automatisierungen, das du selbst hosten kannst: Flows aus einem Auslöser und
Schritten holen Daten, rufen Dienste auf, senden Nachrichten. Diese
Integration bringt deine Activepieces-Flows in Gladys: Jeder Flow wird ein
Gerät mit seinem Zustand (aktiviert oder nicht, letzte Ausführung erfolgreich
oder fehlgeschlagen, Fehlschläge der letzten 24 Stunden), Szenen können **einen
Flow starten** über seinen Webhook und seine Antwort nutzen, reagieren, wenn
**irgendeine** Ausführung fehlschlägt oder ein Flow deaktiviert wird, und ein
Dashboard-Widget zeigt die fehlschlagenden Flows zuerst.

Getestet mit einem echten, selbst gehosteten Activepieces 0.82 (Docker,
Community Edition); nicht mit Activepieces Cloud: Rückmeldungen sind
willkommen in [den Issues](https://github.com/guim31/gladys-activepieces/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Activepieces, selbst gehostet und vom Gladys-Rechner aus erreichbar.
- E-Mail-Adresse und Passwort eines Activepieces-Benutzers. Die Community
  Edition hat **keine API-Schlüssel** (sie gehören zu den kostenpflichtigen
  Editionen), daher meldet sich die Integration wie die Weboberfläche an.
  Lege wenn möglich einen eigenen Benutzer an: Gladys sieht die Flows seines
  Projekts.

Bei jeder Aktualisierung (standardmäßig jede Minute) sendet die Integration
vier Anfragen an Activepieces, beim ersten Mal ein paar mehr, und meldet sich
einmal pro Woche neu an (die Sitzung hält 7 Tage). Die Community Edition
begrenzt ihre API nicht.

## Erste Schritte

### 1. Activepieces vorbereiten

Notiere die Adresse, mit der du Activepieces öffnest (Port 8080 mit der
offiziellen docker-compose-Datei), sowie E-Mail-Adresse und Passwort des
Benutzers, dessen Flows Gladys verfolgen soll. Nur Anmeldung über Google oder
einen anderen Anbieter: Gib diesem Benutzer zuerst ein Passwort.

### 2. Die Integration konfigurieren

Öffne in Gladys die Konfiguration der Activepieces-Integration:

- **Activepieces-Adresse**: zum Beispiel `http://192.168.1.2:8080`. Eine reine
  IP-Adresse bekommt Port 8080. Eine aus dem Browser kopierte URL geht auch.
- **E-Mail-Adresse** und **Passwort**: die des Benutzers aus Schritt 1.
- **Projekt (optional)**: leer, das eigene Projekt des Benutzers. Sonst die ID
  des Projekts oder die aus dem Browser kopierte Adresse einer seiner Seiten.
- **Aktualisierungsintervall**: 30 Sekunden bis 5 Minuten.
- **Flows aus Gladys schalten erlauben**: standardmäßig aus, siehe unten.
- **Sprache der Namen**: Sprache der Funktionsnamen, der Zustände und der
  Szenenergebnisse.

Klicke auf **Verbindung testen**: Der Test zeigt die Version, die Flows, die
aktivierten und die Fehlschläge der letzten 24 Stunden.

### 3. Die Flows hinzufügen

Öffne den Tab **Entdecken** der Integration und füge die zu verfolgenden Flows
hinzu, dazu das Gerät **Activepieces**, wenn du die Zahlen der ganzen Instanz
willst. Nichts wird ohne dich hinzugefügt. Die Szenenauslöser funktionieren
für alle Flows, hinzugefügt oder nicht.

## Die Geräte

Jeder Flow ergibt ein Gerät:

| Funktion                     | Wert                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| Aktiviert                    | der Flow ist aktiviert oder nicht                              |
| Letzte Ausführung            | Erfolgreich, Fehlgeschlagen, Zeitüberschreitung, Läuft…        |
| Funktioniert                 | Nein, wenn die letzte beendete Ausführung fehlschlug, sonst Ja |
| Fehlschläge in 24 h          | fehlgeschlagene Ausführungen der letzten 24 Stunden            |
| Letzter Start                | Beginn der letzten Ausführung, Tag/Monat Stunden:Minuten       |
| Dauer der letzten Ausführung | der letzten beendeten Ausführung, in Sekunden                  |

Eine laufende Ausführung behält in **Funktioniert** das Urteil der vorherigen:
Ein fehlschlagender Flow, der neu läuft, wirkt nicht für ein paar Sekunden
repariert.

Der Schalter **Aktiviert** zeigt standardmäßig nur den Zustand. Mit **Flows aus
Gladys schalten erlauben** aktiviert und deaktiviert er den Flow: Klicke nach
dem Ändern der Option im Tab Entdecken bei den Geräten auf **Aktualisieren**.
Ein nie veröffentlichter Flow kann nicht aktiviert werden.

Das Gerät **Activepieces** liefert **Erreichbar** (Nein, solange Activepieces
nicht antwortet), die **Version**, die **Aktivierte Flows**, die
**Fehlschläge in 24 h** und die **Flows insgesamt**.

## Dashboard

Das Widget **Activepieces-Flows** zeigt drei Kacheln (aktivierte Flows,
Fehlschläge in 24 Stunden, laufende Ausführungen), dann eine Zeile pro Flow:
zuerst die fehlschlagenden, dann die laufenden, dann die übrigen, mit dem
Zustand der letzten Ausführung, ihrer Startzeit und den Fehlschlägen des
Tages. Standardmäßig zeigt es die aktivierten Flows; wähle andere in seinen
Einstellungen (zu Gladys hinzugefügte Geräte, mit dem Namen, den du ihnen
gegeben hast). Die Schaltfläche **Aktualisieren** liest Activepieces neu; eine
Einstellung blendet sie aus.

## Szenen

### Auslöser

- **Eine Flow-Ausführung schlägt fehl**: Eine Ausführung endet fehlgeschlagen,
  mit Zeitüberschreitung, ohne Speicher, über einem Kontingent oder
  einer Protokollgrenze oder mit einem internen Fehler.
  Filter: die Flows (leer: alle). Weitergegebene Informationen: Name des
  Flows, Fehlermeldung, fehlerhafter Schritt, Status der Ausführung, Link zur
  Ausführung in Activepieces.
- **Ein Flow wird deaktiviert**: Ein aktivierter Flow wird deaktiviert, von
  Hand, von Activepieces oder durch eine Szene: Sein Auslöser läuft nicht
  mehr. Filter: die Flows. Weitergegebene Information: Name des Flows.

Die erste Abfrage merkt sich nur, was schon passiert ist: Für die
Vergangenheit wird nichts gemeldet. Ein Fehlschlag während eines Neustarts von
Gladys oder der Integration wird einmal gemeldet, bei der nächsten Abfrage.
Für „Activepieces antwortet nicht“ nutze die Funktion **Erreichbar** des
Geräts Activepieces in einer Szene.

### Aktionen

- **Activepieces-Flow starten**: Der Flow muss mit dem Auslöser **Catch
  Webhook** (Authentifizierung: None) beginnen und veröffentlicht sein. Wähle
  in der Szene den Flow (ein zu Gladys hinzugefügtes Gerät) oder füge für
  einen nicht hinzugefügten Flow die vom Auslöser angezeigte URL ein
  (`…/api/v1/webhooks/…`). Inhalt: JSON wie `{"raum": "Wohnzimmer"}` oder ein
  Text, der als `{"text": "…"}` gesendet wird; Werte der Szene können eingefügt
  werden, der Flow liest sie in `trigger.body`. Ohne **Auf die Antwort
  warten** antwortet Activepieces sofort und die Ausführung läuft allein
  weiter. Mit dieser Option muss der Flow mit einem Schritt **Return
  Response** (Webhook-Piece) enden, in höchstens 30 Sekunden. Ergebnisse:
  erfolgreich beantwortet, HTTP-Status (404: Der Flow ist deaktiviert oder
  nicht veröffentlicht; 0: keine Antwort rechtzeitig), Antwortnachricht (das
  Feld `message` oder `text` der Antwort), vollständige Antwort.
- **Zustand eines Flows**: aktiviert oder nicht, letzte Ausführung
  fehlgeschlagen oder nicht, Zustand, Fehlschläge in 24 h, letzter Start,
  Dauer, letzter Fehler und ein fertiger Satz, für die nächsten Aktionen (eine
  Nachricht, eine Bedingung).
- **Flow aktivieren** / **Flow deaktivieren**: zum Beispiel ein Flow, der nur
  im Urlaub laufen soll. Diese Aktionen funktionieren unabhängig von der Option
  des Schalters.

### Szenenideen

- **Eine Flow-Ausführung schlägt fehl** → eine Nachricht senden:
  „Activepieces: {flow} ist im Schritt {schritt} fehlgeschlagen: {fehler}“ mit
  dem Link zur Ausführung.
- Eine Schaltfläche im Dashboard oder „Ich gehe“ → **Activepieces-Flow
  starten** mit `{"benutzer": "…"}` und **Auf die Antwort warten**, dann die
  **Antwortnachricht** des Flows senden.
- **Ein Flow wird deaktiviert** → eine Nachricht senden: Ein Flow, auf den du
  dich verlässt, ist gestoppt.
- Jeden Morgen → **Zustand eines Flows** „Nächtliche Sicherung“ → nur
  weitermachen, wenn „Letzte Ausführung fehlgeschlagen“ wahr ist → den
  **Satz** senden.

## Fehlerbehebung

- **E-Mail-Adresse oder Passwort abgelehnt**: Prüfe sie auf der Anmeldeseite
  von Activepieces. Ein über Google angelegter Benutzer hat kein Passwort.
- **Von Activepieces abgelehnt: Dieser Benutzer darf das nicht**: Der Benutzer
  ist kein Mitglied des Projekts, oder seine Rolle darf Flows nicht ändern.
- **Projekt nicht gefunden**: Prüfe die ID oder lass das Feld leer.
- **Keine Activepieces-API unter dieser Adresse**: Prüfe die Adresse (Port 8080
  mit der offiziellen docker-compose-Datei). Hinter einem Reverse-Proxy mit
  Unterpfad gehört der Unterpfad in die Adresse.
- **Die Adresse leitet um**: Gib die `https://`-Adresse ein.
- **Zertifikat abgelehnt**: Ein selbst signiertes Zertifikat wird nicht
  akzeptiert; nutze im lokalen Netz die `http://`-Adresse.
- **Der Webhook antwortet 404**: Der Flow ist deaktiviert, wurde nie
  veröffentlicht, oder sein Auslöser ist nicht Catch Webhook. Die Test-URL
  (`/draft`) wird nicht akzeptiert.
- **Auf die Antwort warten liefert Status 0 oder eine leere Antwort**: Füge am
  Ende des Flows einen Schritt Return Response hinzu.
- Protokolle: In Gladys zeigt die Seite der Integration die Protokolle ihres
  Containers; `LOG_LEVEL=debug` zeigt jede Abfrage.

## Grenzen

- Entwickelt und getestet mit Activepieces 0.82 in Docker, ohne Activepieces
  Cloud und ohne die kostenpflichtigen Editionen: Rückmeldungen sind
  willkommen.
- Ein Projekt pro Konfiguration; das Passwort des Benutzers speichert Gladys
  wie die anderen Geheimnisse der Integrationen.
- API-Schlüssel der kostenpflichtigen Editionen werden noch nicht unterstützt.
- Flows werden in Gladys weder erstellt noch bearbeitet.
- Pro Abfrage werden höchstens 500 fehlgeschlagene Ausführungen der letzten 24
  Stunden gelesen und höchstens 10 Fehlschläge gemeldet.
- Mit Basic- oder Header-Authentifizierung geschützte Webhooks werden nicht
  unterstützt.
- Activepieces behält die Ausführungen standardmäßig 30 Tage
  (`AP_EXECUTION_DATA_RETENTION_DAYS`).
