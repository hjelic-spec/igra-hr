# Postavljanje na hosting

Igra je jedan Node.js proces i jedna SQLite datoteka. Zato hosting mora imati:

1. **Trajni disk (volume)** montiran na `/data`. Bez njega se baza (računi, rezultati) briše pri svakom
   ponovnom pokretanju ili novoj verziji. Ovo je najvažniji uvjet pri izboru hostinga.
2. **Jednu instancu.** SQLite ne podržava više servera koji pišu u istu bazu. Za prvih nekoliko tisuća
   igrača jedna instanca je dovoljna; za više treba prijeći na PostgreSQL.
3. **HTTPS** (svi veći hostinzi ga daju automatski). `NODE_ENV=production` šalje kolačić samo preko HTTPS-a.

## Docker (radi na bilo kojem hostingu koji pokreće kontejnere)

```
docker build -t igra-hr .
docker run -d -p 80:3000 -v kvizdata:/data --restart unless-stopped igra-hr
```
Provjereno: slika se gradi, `/healthz` vraća `ok`, a računi ostaju nakon ponovnog pokretanja kontejnera.

## Varijable okruženja
| Varijabla | Zadano | Značenje |
|---|---|---|
| `PORT` | 3000 | port na kojem server sluša |
| `DB_FILE` | `/data/kviz.db` u Dockeru | put do baze |
| `NODE_ENV` | `production` u Dockeru | uključuje `Secure` kolačić |

## Sigurnosna kopija
Baza je jedna datoteka. Za kopiju dok igra radi koristi `sqlite3 /data/kviz.db ".backup /data/kopija.db"`
(obično kopiranje datoteke usred pisanja može dati neispravnu kopiju).

## Prije javnog otvaranja
- Napisati i provjeriti puno više pitanja (vidi README).
- Ograničenje pokušaja prijave gleda IP adresu; iza proxyja hostinga sve adrese mogu izgledati isto,
  pa ograničenje tada radi samo po korisničkom imenu.
