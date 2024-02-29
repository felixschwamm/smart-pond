# REST API für Temperaturüberwachung

die RestAPI läuft über AWS ApiGateway und der Code wird mit AWS Lambda ausgeführt. Momentan gibt es nur einen POST Endpoint, über den man neue Sensorwerte in die Datenbank schreiben kann. Außerdem wird mit EventBridge periodisch eine Aggregationsfunktion aufgerufen, die die Daten aggregiert und so ermöglicht über größere Zeiträume die Daten effizient abzufragen.

## TODO
- Frontend schreiben
- GET Endpoint schreiben