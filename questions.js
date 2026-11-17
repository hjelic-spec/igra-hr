// Početni set ORIGINALNIH pitanja (napisana za ovaj projekt, nisu preuzeta iz tuđih kvizova).
// Format: [razina, pitanje, [točan odgovor, krivi, krivi, krivi]]
// Točan odgovor je uvijek prvi u ovom popisu; server ih miješa i nikad ne šalje klijentu koji je točan.
// Razina 1 = najlakše (dno piramide), razina 5 = najteže (vrh).
// PRIJE PRODUKCIJE: svaku činjenicu provjeriti u pouzdanom izvoru (Hrvatska enciklopedija, enciklopedija.hr).

module.exports = [
  // ---- Razina 1 ----
  [1, 'Koji je glavni grad Hrvatske?', ['Zagreb', 'Split', 'Rijeka', 'Osijek']],
  [1, 'Koliko dana ima prijestupna godina?', ['366', '365', '364', '360']],
  [1, 'Koja je najveća planeta Sunčeva sustava?', ['Jupiter', 'Saturn', 'Zemlja', 'Neptun']],
  [1, 'Koliko nogu ima pauk?', ['8', '6', '10', '4']],
  [1, 'Koja je kemijska formula vode?', ['H₂O', 'CO₂', 'O₂', 'NaCl']],
  [1, 'Koja boja nastaje miješanjem plave i žute?', ['Zelena', 'Ljubičasta', 'Narančasta', 'Smeđa']],
  [1, 'Na kojem se kontinentu nalazi Egipat?', ['Afrika', 'Azija', 'Europa', 'Južna Amerika']],
  [1, 'Koliko je 7 × 8?', ['56', '54', '48', '64']],
  [1, 'Koji je najveći ocean na Zemlji?', ['Tihi ocean', 'Atlantski ocean', 'Indijski ocean', 'Arktički ocean']],
  [1, 'Koliko stranica ima šesterokut?', ['6', '5', '7', '8']],
  [1, 'Koja je zvijezda najbliža Zemlji?', ['Sunce', 'Sirius', 'Polarnica', 'Proxima Centauri']],
  [1, 'Koji je glavni grad Francuske?', ['Pariz', 'Lyon', 'Marseille', 'Bruxelles']],
  [1, 'U kojem se gradu nalazi Dioklecijanova palača?', ['Split', 'Zadar', 'Pula', 'Dubrovnik']],
  [1, 'Koje godišnje doba dolazi nakon zime?', ['Proljeće', 'Ljeto', 'Jesen', 'Nijedno']],
  [1, 'Koliko minuta ima jedan sat?', ['60', '100', '30', '90']],
  [1, 'Koja je životinja najveći kopneni sisavac?', ['Slon', 'Žirafa', 'Nosorog', 'Medvjed']],

  // ---- Razina 2 ----
  [2, 'Koji je planet najbliži Suncu?', ['Merkur', 'Venera', 'Mars', 'Zemlja']],
  [2, 'Koji je glavni grad Australije?', ['Canberra', 'Sydney', 'Melbourne', 'Perth']],
  [2, 'Koji je kemijski simbol za zlato?', ['Au', 'Ag', 'Zn', 'Go']],
  [2, 'Koliko kostiju ima kostur odrasla čovjeka?', ['206', '186', '226', '312']],
  [2, 'Koji se planet naziva „crvenim planetom”?', ['Mars', 'Jupiter', 'Venera', 'Saturn']],
  [2, 'Koje je godine Hrvatska postala članica Europske unije?', ['2013.', '2009.', '2004.', '2016.']],
  [2, 'Koja je službena valuta u Hrvatskoj od 1. siječnja 2023.?', ['Euro', 'Kuna', 'Dinar', 'Franak']],
  [2, 'Tko je naslikao Mona Lisu?', ['Leonardo da Vinci', 'Michelangelo', 'Rafael', 'Tizian']],
  [2, 'Koliko igrača jedne momčadi istodobno igra na terenu u nogometu?', ['11', '10', '9', '12']],
  [2, 'Kolika je približno brzina svjetlosti u vakuumu?', ['300 000 km/s', '30 000 km/s', '3 000 km/s', '3 000 000 km/s']],
  [2, 'Na kojoj se planini nalazi najviši vrh Hrvatske?', ['Dinara', 'Velebit', 'Biokovo', 'Učka']],
  [2, 'Koja je od navedenih rijeka najdulja?', ['Sava', 'Kupa', 'Krka', 'Cetina']],
  [2, 'Tko je napisao dramu „Romeo i Julija”?', ['William Shakespeare', 'Molière', 'Johann Wolfgang von Goethe', 'Charles Dickens']],

  // ---- Razina 3 ----
  [3, 'U kojem je mjestu rođen Nikola Tesla?', ['Smiljan', 'Gospić', 'Karlovac', 'Senj']],
  [3, 'Koji kemijski element ima atomski broj 1?', ['Vodik', 'Helij', 'Kisik', 'Ugljik']],
  [3, 'Koja je najmanja država na svijetu po površini?', ['Vatikan', 'Monako', 'San Marino', 'Lihtenštajn']],
  [3, 'Tko je napisao roman „Povratak Filipa Latinovicza”?', ['Miroslav Krleža', 'August Šenoa', 'Ivo Andrić', 'Ranko Marinković']],
  [3, 'Koje je godine srušen Berlinski zid?', ['1989.', '1991.', '1987.', '1961.']],
  [3, 'Koji je kemijski simbol za željezo?', ['Fe', 'Ir', 'Fr', 'Ž']],
  [3, 'Koliko srca ima hobotnica?', ['3', '1', '2', '8']],
  [3, 'U kojem se oceanu nalazi Marijanska brazda?', ['Tihom', 'Atlantskom', 'Indijskom', 'Južnom']],
  [3, 'Tko je autor spjeva „Judita”?', ['Marko Marulić', 'Ivan Gundulić', 'Marin Držić', 'Petar Hektorović']],
  [3, 'Koliko kromosoma ima tipična tjelesna stanica čovjeka?', ['46', '23', '44', '48']],
  [3, 'Koji je glavni grad Kanade?', ['Ottawa', 'Toronto', 'Montreal', 'Vancouver']],

  // ---- Razina 4 ----
  [4, 'Po čemu je poznat Ivan Vučetić, rodom s Hvara?', ['Sustavu identifikacije otiscima prstiju', 'Izumu mehaničke olovke', 'Izumu padobrana', 'Otkriću vitamina C']],
  [4, 'Što je izumio Slavoljub Penkala?', ['Mehaničku olovku', 'Telefon', 'Padobran', 'Kravatu']],
  [4, 'Koji je kemičar rođen u Vukovaru dobio Nobelovu nagradu za kemiju 1939.?', ['Lavoslav Ružička', 'Vladimir Prelog', 'Fran Bošnjaković', 'Ivan Supek']],
  [4, 'Koje se godine odigrala bitka kod Siska?', ['1593.', '1493.', '1683.', '1526.']],
  [4, 'Koji je pisac dobio Nobelovu nagradu za književnost 1961.?', ['Ivo Andrić', 'Miroslav Krleža', 'Ernest Hemingway', 'Albert Camus']],
  [4, 'Koji je glavni grad Mongolije?', ['Ulan Bator', 'Astana', 'Biškek', 'Taškent']],
  [4, 'Koliko je kemijskih elemenata službeno potvrđeno i imenovano u periodnom sustavu?', ['118', '108', '112', '126']],
  [4, 'Koje se godine odigrala Krbavska bitka?', ['1493.', '1593.', '1389.', '1102.']],
  [4, 'U kojem je gradu rođen Ruđer Bošković?', ['Dubrovnik', 'Split', 'Zadar', 'Rim']],

  // ---- Razina 5 ----
  [5, 'Koji je izumitelj u djelu „Machinae novae” opisao napravu „Homo volans”, preteču padobrana?', ['Faust Vrančić', 'Ruđer Bošković', 'Ivan Vučetić', 'Slavoljub Penkala']],
  [5, 'Koje je godine ukinuta Dubrovačka Republika?', ['1808.', '1797.', '1815.', '1848.']],
  [5, 'Koji je najmanji prirodni broj koji se na dva različita načina može zapisati kao zbroj dvaju kubova?', ['1729', '1001', '4104', '9999']],
  [5, 'Koji kemijski element ima najveću elektronegativnost?', ['Fluor', 'Kisik', 'Klor', 'Dušik']],
  [5, 'Kolika je apsolutna nula izražena u Celzijevim stupnjevima?', ['−273,15 °C', '−100 °C', '−459,67 °C', '−237,15 °C']],
];
