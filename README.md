# Dnevna piramida – prototip

Dnevni kviz-izazov: svi registrirani igrači svaki dan dobivaju **iste tri piramide od 15 pitanja**
(5 lakih → 4 → 3 → 2 → 1 najteže). Bodovi rastu s razinom (10, 20, 40, 80, 160).

## Pokretanje
Potreban je samo **Node.js 22.13 ili noviji** (koristi ugrađeni `node:sqlite`, nema vanjskih paketa).

```
npm start          # http://localhost:3000
npm test           # 14 automatskih testova
```
Varijable: `PORT`, `DB_FILE` (put do SQLite baze), `NODE_ENV=production` (kolačić samo preko HTTPS-a).
Node ispisuje upozorenje da je `node:sqlite` eksperimentalan; to je očekivano.

## Pravila (u `public/game.js`, objekt `RULES`)
Pravila su u jednom modulu koji koriste i server i probna verzija u pregledniku, pa se ne mogu razići.
- 15 pitanja u 5 razina (5-4-3-2-1), vrijede 10, 20, 40, 80 i 160 bodova.
- 10 s po pitanju. Rezerva vremena i bonus bodova za brzinu (do +50 %) ukinuti su; brzinu nagrađuje samo brz pogodak ×2.
- Kriv odgovor ili istek vremena oduzima bodove tog pitanja.
- 2 života: druga greška završava uspon, a konačni rezultat su bodovi u tom trenutku. Rezultat ne ide ispod 0.
- **Brz pogodak ×2** (zamijenio je "Dupli ili ništa"): točan odgovor unutar 3 s od prikaza pitanja udvostručuje bodove
  sljedećeg pitanja. Ne nagomilava se: niz brzih odgovora daje ×2 na svakom sljedećem pitanju. Sporiji ili kriv odgovor
  vraća na ×1. Kazna za kriv odgovor se ne množi. Vrijeme mjeri server
  (od slanja pitanja do primitka odgovora), pa je uključen i put kroz mrežu; zato server prihvaća do 3,3 s (`latencyMs`).
  Na traci vremena zvjezdica ★ označava granicu od 3 s. Brojevi su u `RULES.fastBonus`.
- **3 piramide dnevno**: svaka s drugim pitanjima (1., 2. i 3. piramida dana iste su za sve igrače). Na ljestvicu ide najbolja od tri (`RULES.dailyScore`).
- **Niz dana**: +5 bodova po uzastopnom danu, najviše +50; u zaglavlju se prikazuje 🔥.
- **Dijeljenje**: na kraju se kopira piramida od emojija (🟩 točno, 🟨 točno uz ×2, 🟥 netočno) bez ijednog pitanja ili odgovora.
- Novi dan počinje u ponoć po hrvatskom vremenu (Europe/Zagreb); kraj igre prikazuje odbrojavanje.
- Zvuk i vibracija (gdje uređaj podržava) mogu se isključiti gumbom 🔊.

## Zaštita od varanja (što prototip radi)
- Točan odgovor nikad ne ide pregledniku prije odgovora; provjera je na serveru.
- Server šalje jedno po jedno pitanje i sam mjeri vrijeme (osvježavanje stranice ne resetira sat).
- Najviše 3 piramide po igraču po danu (ograničenje u bazi: `UNIQUE(user_id, date, attempt)`); svaka ima druga pitanja, ista za sve igrače.
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
