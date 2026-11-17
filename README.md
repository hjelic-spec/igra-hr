# Dnevne skale – prototip

Dnevni kviz-izazov: registrirani igrači jednom dnevno penju se **skalama od 100 stepenica**.
Stepenice su podijeljene u 10 razina težine (1–10, 11–20, …, 91–100); svaka je stepenica malo teža
i vrijedi bod više od prethodne (stepenica *n* = *n* bodova, vrh = 5.050 osnovnih bodova).

## Pokretanje
Potreban je samo **Node.js 22.13 ili noviji** (koristi ugrađeni `node:sqlite`, nema vanjskih paketa).

```
npm start          # http://localhost:3000
npm test           # 8 automatskih testova
```
Varijable: `PORT`, `DB_FILE` (put do SQLite baze), `NODE_ENV=production` (kolačić samo preko HTTPS-a).
Node ispisuje upozorenje da je `node:sqlite` eksperimentalan; to je očekivano.

## Pravila (u `server.js`, objekt `RULES`)
- 12 s po pitanju; brzina donosi do +50 % bodova stepenice. Uspon do vrha traje najviše ~20 minuta.
- 3 života: svaka greška ili istek vremena troši jedan.
- Niz dana: +20 bodova po uzastopnom danu, najviše +200.
- Novi dan počinje u ponoć po hrvatskom vremenu (Europe/Zagreb).
- Ljestvice: danas, ovaj tjedan (od ponedjeljka), ukupno. Kod jednakih bodova bolji je brži.

### Način izbora pitanja (`QUESTION_MODE`)
- `personal` (zadano): svi se penju po jednako teškim stepenicama, ali svatko dobiva nasumična pitanja
  zadane razine. Pitanje se ne ponavlja u istoj igri, a izbjegavaju se pitanja koja je igrač vidio u zadnjih
  30 dana. Prepričavanje odgovora ne pomaže. Treba ~100+ pitanja po razini (~1.000 ukupno).
- `shared`: svi dobivaju istih 100 pitanja tog dana. Najpravednije, ali treba 100 novih pitanja dnevno
  (~36.500 godišnje) da se ne ponavljaju.

## Zaštita od varanja (što prototip radi)
- Točan odgovor nikad ne ide pregledniku prije odgovora; provjera je na serveru.
- Server šalje jedno po jedno pitanje i sam mjeri vrijeme (osvježavanje stranice ne resetira sat).
- Jedna igra po igraču po danu (ograničenje u bazi).
- Lozinke: scrypt sa soli; sesija u HttpOnly kolačiću; ograničen broj pokušaja prijave.

## Što prototip NE rješava (poznata ograničenja)
- U načinu `shared` igrači mogu jedni drugima javiti današnja pitanja.
- U načinu `personal` sreća igra ulogu: dva pitanja iste razine nisu jednako teška. Kad se skupi dovoljno
  odgovora, težinu treba mjeriti stvarnim postotkom točnih odgovora i po tome preslagati razine.
- Višestruki računi jedne osobe: nema potvrde e-pošte.
- Nema resetiranja lozinke, administracije pitanja ni prijave netočnog pitanja.
- Ograničenje prijava je u memoriji (nestaje pri restartu).

## Pitanja
`questions.js` sadrži 100 originalnih pitanja, po 10 za svaku razinu: minimum da igra radi.
Za pravu igru treba **barem ~100 pitanja po razini**. Razine su procjena autora; kad igra skupi odgovore,
treba ih kalibrirati po stvarnom postotku točnih odgovora.
Prije objave svaku činjenicu provjeriti u pouzdanom izvoru (npr. Hrvatska enciklopedija, enciklopedija.hr).
