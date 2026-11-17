# Dnevna piramida – prototip

Dnevni kviz-izazov: svi registrirani igrači jednom dnevno dobivaju **istu piramidu od 15 pitanja**
(5 lakih → 4 → 3 → 2 → 1 najteže). Bodovi rastu s razinom (10, 20, 40, 80, 160).

## Pokretanje
Potreban je samo **Node.js 22.13 ili noviji** (koristi ugrađeni `node:sqlite`, nema vanjskih paketa).

```
npm start          # http://localhost:3000
npm test           # 8 automatskih testova
```
Varijable: `PORT`, `DB_FILE` (put do SQLite baze), `NODE_ENV=production` (kolačić samo preko HTTPS-a).
Node ispisuje upozorenje da je `node:sqlite` eksperimentalan; to je očekivano.

## Pravila (u `server.js`, objekt `RULES`)
- 20 s po pitanju; brzina donosi do +50 % bodova pitanja.
- 2 života: jedna greška dopuštena, druga završava uspon. Istek vremena je greška.
- Niz dana: +5 bodova po uzastopnom danu, najviše +50.
- Novi dan počinje u ponoć po hrvatskom vremenu (Europe/Zagreb).
- Ljestvice: danas, ovaj tjedan (od ponedjeljka), ukupno. Kod jednakih bodova bolji je brži.

## Zaštita od varanja (što prototip radi)
- Točan odgovor nikad ne ide pregledniku prije odgovora; provjera je na serveru.
- Server šalje jedno po jedno pitanje i sam mjeri vrijeme (osvježavanje stranice ne resetira sat).
- Jedna igra po igraču po danu (ograničenje u bazi).
- Lozinke: scrypt sa soli; sesija u HttpOnly kolačiću; ograničen broj pokušaja prijave.

## Što prototip NE rješava (poznata ograničenja)
- Igrači mogu jedni drugima javiti današnja pitanja (isti problem ima Wordle). Ublažava se kratkim
  vremenom po pitanju i miješanjem redoslijeda odgovora po igraču (još nije napravljeno).
- Višestruki računi jedne osobe: nema potvrde e-pošte.
- Nema resetiranja lozinke, administracije pitanja ni prijave netočnog pitanja.
- Ograničenje prijava je u memoriji (nestaje pri restartu).

## Pitanja
`questions.js` sadrži 54 originalna pitanja (16/13/11/9/5 po razinama), dovoljno za ~3 dana bez ponavljanja;
nakon toga se pitanja vrte (prvo najmanje korištena). Za pravu igru treba **barem nekoliko stotina pitanja**,
po razinama u omjeru 5:4:3:2:1 (npr. za 1 godinu: ~1825 / 1460 / 1095 / 730 / 365).
Prije objave svaku činjenicu provjeriti u pouzdanom izvoru (npr. Hrvatska enciklopedija, enciklopedija.hr).
