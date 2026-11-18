// Pozivi Claude API-ja: (1) sastavljanje pitanja uz pretraživanje pouzdanih izvora,
// (2) neovisna "slijepa" provjera: drugi poziv, bez interneta, dobije pitanje s izmiješanim odgovorima
// i isječak izvora koji je dohvatio NAŠ kod, te mora sam pronaći točan odgovor.
'use strict';

const OPIS_RAZINA = {
  1: 'vrlo lako: zna gotovo svaki odrasli, i većina djece od 12 godina',
  2: 'lako: opće znanje iz škole i svakodnevice',
  3: 'srednje: zna otprilike polovica odraslih koji prate kvizove',
  4: 'teško: traži dobro opće obrazovanje ili interes za područje',
  5: 'vrlo teško: znaju rijetki, ali je činjenica jasna i provjerljiva (nije trivija o sitnim brojevima)',
};

const ALAT_PREDAJ = {
  name: 'predaj_pitanja',
  description: 'Predaj gotova pitanja. Pozovi jednom, na kraju, kad su sva pitanja provjerena u izvorima.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['pitanja'],
    properties: {
      pitanja: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['pitanje', 'tocan', 'netocni', 'kategorija', 'izvor_url', 'izvor_citat'],
          properties: {
            pitanje: { type: 'string', description: 'Pitanje na hrvatskom standardnom jeziku, završava upitnikom.' },
            tocan: { type: 'string', description: 'Jedini točan odgovor, kratko.' },
            netocni: { type: 'array', items: { type: 'string' }, description: 'Točno 3 uvjerljiva, ali nedvojbeno netočna odgovora.' },
            kategorija: { type: 'string' },
            izvor_url: { type: 'string', description: 'Točan https URL stranice na kojoj je činjenica, s popisa dopuštenih domena.' },
            izvor_citat: { type: 'string', description: 'DOSLOVNO prepisana rečenica (20 do 300 znakova) s te stranice koja potvrđuje točan odgovor.' },
          },
        },
      },
    },
  },
};

function sustavGeneratora(cfg) {
  return `Ti si urednik hrvatskog dnevnog kviza. Pišeš originalna pitanja s četiri ponuđena odgovora.

Pravila (sva su obavezna):
- Svaku činjenicu PROVJERI alatom za pretraživanje ili dohvat stranice na jednoj od dopuštenih domena: ${cfg.dopusteneDomene.join(', ')}. Ne oslanjaj se na sjećanje.
- Uz svako pitanje navedi URL stranice koju si stvarno otvorio i DOSLOVAN citat s nje (prepiši znak po znak, bez skraćivanja i bez "..."). Naš program će otvoriti taj URL i tražiti citat; ako ga ne nađe, pitanje se odbacuje.
- Ako činjenicu ne možeš potvrditi u izvoru, izostavi pitanje. Manje pitanja je bolje od jednog netočnog.
- Samo vremenski stabilne činjenice. Ne pitaj o trenutačnim dužnosnicima, rekordima, broju stanovnika, cijenama ni ičemu što se može promijeniti.
- Točno jedan odgovor je točan; tri netočna su uvjerljiva, iste vrste kao točan (npr. sve godine ili svi gradovi) i nedvojbeno netočna.
- Bez "sve navedeno", "ništa od navedenog", trik-pitanja i dvosmislenih formulacija. Pitanje razumljivo samo za sebe.
- Hrvatski standardni jezik, pravopis Instituta za hrvatski jezik; godine s točkom (npr. 1991.).
- Pitanja moraju biti originalna (ne prepisuj pitanja iz drugih kvizova) i međusobno različita po temi.
- Kad završiš, pozovi alat predaj_pitanja točno jednom sa svim pitanjima.`;
}

function zahtjevGeneratora({ razina, broj, kategorije, izbjegavaj }) {
  return `Sastavi ${broj} pitanja razine ${razina} od 5 (${OPIS_RAZINA[razina]}).
Raspodijeli ih po ovim područjima: ${kategorije.join(', ')}.
${izbjegavaj.length ? `Ove točne odgovore već imamo; NE sastavljaj pitanja o istim činjenicama:\n${izbjegavaj.join('; ')}` : ''}`;
}

function zbrojiPotrosnju(potrosnja, odgovor) {
  const u = odgovor.usage || {};
  potrosnja.ulaz += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  potrosnja.cache += u.cache_read_input_tokens || 0;
  potrosnja.izlaz += u.output_tokens || 0;
  potrosnja.pretrage += u.server_tool_use?.web_search_requests || 0;
  potrosnja.pozivi += 1;
}

function cijena(potrosnja, c) {
  return (potrosnja.ulaz * c.ulazPoMil + potrosnja.cache * c.cachePoMil + potrosnja.izlaz * c.izlazPoMil) / 1e6
    + potrosnja.pretrage * c.pretragaPoTisucu / 1000;
}

// Ako model odbije zahtjev (sigurnosni filtar), API ga sam ponovi na zamjenskom modelu.
const zajednickiParametri = (cfg, model) => ({ model, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });

// Vraća { pitanja: [...], greska? }.
async function generiraj(client, cfg, zadatak, potrosnja) {
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: cfg.generator.maxPretraga, allowed_domains: cfg.dopusteneDomene },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: cfg.generator.maxDohvata, allowed_domains: cfg.dopusteneDomene, max_content_tokens: cfg.generator.maxTokenaPoStranici },
    ALAT_PREDAJ,
  ];
  const messages = [{ role: 'user', content: zahtjevGeneratora(zadatak) }];
  let podsjetio = false;
  for (let krug = 0; krug < cfg.generator.maxKrugova; krug++) {
    const odgovor = await client.beta.messages.stream({
      ...zajednickiParametri(cfg, cfg.generator.model),
      max_tokens: 64000,
      output_config: { effort: cfg.generator.effort },
      system: sustavGeneratora(cfg),
      tools, messages,
    }).finalMessage();
    zbrojiPotrosnju(potrosnja, odgovor);
    if (odgovor.stop_reason === 'refusal') return { pitanja: [], greska: 'model je odbio zahtjev' };
    if (odgovor.stop_reason === 'max_tokens') return { pitanja: [], greska: 'odgovor je prekinut (max_tokens)' };
    const predaja = odgovor.content.find(b => b.type === 'tool_use' && b.name === ALAT_PREDAJ.name);
    if (predaja) {
      const ulaz = predaja.input;
      if (!ulaz || !Array.isArray(ulaz.pitanja)) return { pitanja: [], greska: 'neispravan format predaje' };
      return { pitanja: ulaz.pitanja };
    }
    messages.push({ role: 'assistant', content: odgovor.content });
    if (odgovor.stop_reason === 'pause_turn') continue;     // server nastavlja pretraživanje
    if (podsjetio) break;
    podsjetio = true;
    messages.push({ role: 'user', content: 'Predaj pitanja alatom predaj_pitanja (samo ona koja si potvrdio u izvoru).' });
  }
  return { pitanja: [], greska: 'model nije predao pitanja' };
}

const SHEMA_PROVJERE = {
  type: 'object', additionalProperties: false,
  required: ['odgovor', 'izvor_potvrduje', 'jednoznacno', 'netocni_su_netocni', 'vremenski_stabilno', 'jezik_ispravan', 'razina_odgovara', 'razlog'],
  properties: {
    odgovor: { type: 'string', enum: ['A', 'B', 'C', 'D', 'nijedan'] },
    izvor_potvrduje: { type: 'boolean' },
    jednoznacno: { type: 'boolean' },
    netocni_su_netocni: { type: 'boolean' },
    vremenski_stabilno: { type: 'boolean' },
    jezik_ispravan: { type: 'boolean' },
    razina_odgovara: { type: 'boolean' },
    razlog: { type: 'string' },
  },
};

// Slijepa provjera. `redoslijed` je permutacija [0..3] (0 = točan) da model ne zna koji je točan.
async function provjeri(client, cfg, { kandidat, razina, isjecak, redoslijed }, potrosnja) {
  const svi = [kandidat.tocan, ...kandidat.netocni];
  const slova = ['A', 'B', 'C', 'D'];
  const ponude = redoslijed.map((i, k) => `${slova[k]}) ${svi[i]}`).join('\n');
  const odgovor = await client.beta.messages.create({
    ...zajednickiParametri(cfg, cfg.provjera.model),
    max_tokens: 16000,
    output_config: { effort: cfg.provjera.effort, format: { type: 'json_schema', schema: SHEMA_PROVJERE } },
    system: 'Ti si strogi provjeravatelj činjenica za hrvatski kviz. Nemaš pristup internetu. Oslanjaj se na priloženi isječak izvora; opće znanje koristi samo da procijeniš jesu li netočni odgovori sigurno netočni. Kad nisi siguran, odgovori false.',
    messages: [{ role: 'user', content:
`Isječak sa stranice ${kandidat.izvor_url}:
<izvor>
${isjecak}
</izvor>

Pitanje (zamišljena razina ${razina} od 5: ${OPIS_RAZINA[razina]}):
${kandidat.pitanje}
${ponude}

Koji je odgovor točan prema izvoru? Ocijeni i: potvrđuje li izvor taj odgovor; je li pitanje jednoznačno (točno jedan točan odgovor); jesu li ostala tri sigurno netočna; je li činjenica vremenski stabilna; je li hrvatski jezik i pravopis ispravan; odgovara li težina zamišljenoj razini (dopusti odstupanje za jednu razinu). U "razlog" ukratko napiši zašto, posebno ako je nešto false.` }],
  });
  zbrojiPotrosnju(potrosnja, odgovor);
  if (odgovor.stop_reason === 'refusal') return { ok: false, razlog: 'provjera: model je odbio' };
  const tekst = odgovor.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let r;
  try { r = JSON.parse(tekst); } catch { return { ok: false, razlog: 'provjera: neispravan JSON' }; }
  const ocekivano = slova[redoslijed.indexOf(0)];
  const problemi = [];
  if (r.odgovor !== ocekivano) problemi.push(`provjeravatelj je odabrao ${r.odgovor}, točan je ${ocekivano}`);
  for (const k of ['izvor_potvrduje', 'jednoznacno', 'netocni_su_netocni', 'vremenski_stabilno', 'jezik_ispravan', 'razina_odgovara'])
    if (r[k] !== true) problemi.push(k + ' = ne');
  return problemi.length ? { ok: false, razlog: 'provjera: ' + problemi.join(', ') + (r.razlog ? ` (${r.razlog})` : '') } : { ok: true, napomena: r.razlog };
}

module.exports = { generiraj, provjeri, cijena, ALAT_PREDAJ, OPIS_RAZINA };
