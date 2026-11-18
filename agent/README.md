# Agent za dnevna pitanja

Zakazani posao koji svako jutro priprema **provjerena** pitanja za idućih nekoliko dana i stavlja ih
u pull request na pregled. Igra dnevno treba **45 pitanja** (3 piramide × 15: po piramidi 5 / 4 / 3 / 2 / 1
po razinama težine 1 do 5; broj piramida je `piramideDnevno`, razine se čitaju iz `public/game.js`).

## Kako radi

```
GitHub Actions (svaki dan 04:15 UTC)
  └─ node agent/pripremi.js
       za svaki od idućih N dana bez rasporeda:
         1. koliko pitanja po razini nedostaje (uzima u obzir rezervu u banci)
         2. Claude sastavlja pitanja i pretražuje SAMO dopuštene domene (web_search / web_fetch)
         3. formalna provjera (4 različita odgovora, upitnik, duljina, domena izvora)
         4. duplikati: usporedba sa SVIM pitanjima u banci i u questions.js (trigrami; isti odgovor = stroži prag)
         5. NAŠ kod otvara URL izvora i traži doslovan citat; točan odgovor mora biti u citatu
         6. slijepa provjera: drugi poziv modela, bez interneta, dobije izmiješane odgovore i isječak
            stranice koji je dohvatio naš kod, pa mora SAM pogoditi točan odgovor i potvrditi
            jednoznačnost, netočnost ostalih, vremensku stabilnost, pravopis i težinu
         7. prihvaćena pitanja -> pitanja/banka.json, raspored -> pitanja/raspored/GGGG-MM-DD.json
  └─ commit na granu "dnevna-pitanja" i pull request (ili komentar na već otvoren PR)
```

Pitanje koje padne na bilo kojem koraku se odbacuje (razlog je u izvješću u PR-u). Ništa ne ulazi u igru
dok ti ne spojiš PR. Igra (`server.js`) čita raspored za današnji datum; ako ga nema ili je neispravan,
radi kao prije (najmanje korištena pitanja iz baze).

**Bez ponavljanja:** pitanje se ne pojavi ponovno unutar `bezPonavljanjaDana` dana (zadano 90).
Povijest se izvodi iz datoteka rasporeda, pa se ne može razići s njima.

## Što trebaš napraviti (jednom)

1. **API ključ:** na https://platform.claude.com napravi ključ i postavi ograničenje potrošnje.
   U repozitoriju: *Settings → Secrets and variables → Actions → New repository secret*,
   ime `ANTHROPIC_API_KEY`.
2. **Dopusti Actions da otvara PR-ove:** *Settings → Actions → General → Workflow permissions*:
   uključi *Read and write permissions* i *Allow GitHub Actions to create and approve pull requests*.
3. **Spoji ovaj PR na glavnu granu** (zakazani poslovi rade samo s glavne grane).
4. Prvo pokretanje ručno: *Actions → Dnevna pitanja → Run workflow* (polje *dana* npr. `1`) i pogledaj izvješće.

## Svakodnevno

- Otvori PR *Dnevna pitanja od …*, pročitaj pitanja (tablica s izvorom; prijeđi mišem preko "izvor" za citat).
- Loše pitanje: *Actions → Dnevna pitanja → Run workflow*, u polje *odbaci* upiši ID (npr. `p20261118-004`).
  Pitanje se označi kao odbačeno i zahvaćeni dani se preslože.
- Spoji PR. Nakon spajanja treba **ponovno objaviti igru** (deploy), jer server čita datoteke iz repozitorija.
  Agent priprema `danaUnaprijed` (3) dana unaprijed, pa imaš nekoliko dana vremena.

## Trošak (procjena, nije izmjereno)

Nisam mogao pokrenuti pravi API iz razvojnog okruženja, pa su ovo procjene; stvarni trošak svakog
pokretanja piše u izvješću u PR-u (računa se iz `usage` podataka API-ja i cijena u `config.json`).

- Cijene (claude-opus-5-5): 4 USD / milijun ulaznih tokena, 20 USD / milijun izlaznih, web pretraga 10 USD / 1000.
- Najveći trošak su stranice koje model čita tijekom pretraživanja (ograničeno s `maxTokenaPoStranici`).
- Gruba procjena za 45 novih pitanja: oko 10 poziva za sastavljanje i 50 do 70 slijepih provjera,
  **otprilike 10 do 20 USD dnevno** dok se banka puni.
- `uvijekNovaPitanja: false` (zadano): kad banka ima dovoljno pitanja za cijelo razdoblje bez ponavljanja
  (oko 45 × 90 = 4050), agent prestaje plaćati nova i vraća pitanja starija od 90 dana. Uz `true` plaća svaki dan.
- `maxTrosakPoPokretanjuUSD` (15) je tvrda granica po pokretanju; što ne stigne, nastavlja sljedeći dan.
- Jeftinije: `generator.model` i/ili `provjera.model` na `claude-sonnet-5-5` (oko 2× jeftinije) ili
  `claude-haiku-5-5` (puno jeftinije, ali za hrvatski i provjeru činjenica slabije; preporučujem barem
  provjeru ostaviti na jačem modelu). Kod promjene modela promijeni i `cijene`.

## Ograničenja (budimo realni)

- Automatske provjere jako smanjuju pogreške, ali ih ne svode na nulu: citat može biti točan, a pitanje
  ipak loše postavljeno. Zato je pregled u PR-u dio procesa.
- Provjera citata traži doslovan tekst; stranice koje sadržaj učitavaju JavaScriptom ili blokiraju robote
  neće proći (takva pitanja se odbacuju, ne prihvaćaju).
- Popis pouzdanih izvora je u `dopusteneDomene` (Hrvatska enciklopedija, Hrvatski biografski leksikon,
  Proleksis, Britannica, DZS, NASA, EU, UNESCO). Wikipedija namjerno nije na popisu.
- 54 stara pitanja iz `questions.js` nemaju izvor; agent ih ne stavlja u raspored, ali pazi da nova ne budu ista.
- Igra trenutno uzima prvu piramidu iz rasporeda; kad server dobije 3 piramide dnevno, treba uzeti sve tri
  (`plannedIds` u `server.js`, označeno s TODO).

## Postavke (`agent/config.json`)

| Postavka | Značenje |
|---|---|
| `bezPonavljanjaDana` | razdoblje u danima u kojem se pitanje ne smije ponoviti |
| `piramideDnevno` | broj piramida dnevno (svaka 15 pitanja) |
| `danaUnaprijed` | za koliko dana unaprijed se priprema raspored |
| `uvijekNovaPitanja` | `true` = svaki dan nova pitanja; `false` = nova samo dok banka ne pokrije razdoblje |
| `dodatnaRezervaPoRazini` | koliko pitanja više od potrebnog držati u rezervi po razini |
| `maxPokusajaPoRazini` | koliko puta pokušati dopuniti razinu u jednom pokretanju |
| `maxTrosakPoPokretanjuUSD` | granica troška jednog pokretanja |
| `generator.*`, `provjera.*` | model, effort, broj pretraga i dohvata, pitanja po pozivu |
| `slicnost` | pragovi za duplikate (0 do 1) |
| `kategorije`, `dopusteneDomene` | područja pitanja i pouzdani izvori |

## Ručno pokretanje (lokalno)

```
cd agent && npm ci && cd ..
ANTHROPIC_API_KEY=... node agent/pripremi.js --dana 1
node agent/pripremi.js --bez-api              # samo raspored iz postojećih pitanja, bez troška
node agent/pripremi.js --odbaci p20261118-004  # odbaci pitanje i presloži buduće dane
```
