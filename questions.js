// Početni set ORIGINALNIH pitanja (napisana za ovaj projekt, nisu preuzeta iz tuđih kvizova).
// Format: [razina, pitanje, [točan odgovor, krivi, krivi, krivi]]
// Točan odgovor je uvijek prvi u ovom popisu; server ih miješa i nikad ne šalje klijentu koji je točan.
// Razina 1 = najlakše (stepenice 1–10) … razina 10 = najteže (stepenice 91–100).
// PRIJE PRODUKCIJE: svaku činjenicu provjeriti u pouzdanom izvoru (Hrvatska enciklopedija, enciklopedija.hr).
// Za igru treba ~100 pitanja po razini; ovdje je po 10 (minimum da način 'shared' radi jedan dan).

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
  [1, 'Koliko dana ima jedan tjedan?', ['7', '5', '6', '10']],
  [1, 'Koja domaća životinja laje?', ['Pas', 'Mačka', 'Krava', 'Ovca']],

  // ---- Razina 2 ----
  [2, 'Koji je najveći ocean na Zemlji?', ['Tihi ocean', 'Atlantski ocean', 'Indijski ocean', 'Arktički ocean']],
  [2, 'Koliko stranica ima šesterokut?', ['6', '5', '7', '8']],
  [2, 'Koja je zvijezda najbliža Zemlji?', ['Sunce', 'Sirius', 'Polarnica', 'Proxima Centauri']],
  [2, 'Koji je glavni grad Francuske?', ['Pariz', 'Lyon', 'Marseille', 'Bruxelles']],
  [2, 'U kojem se gradu nalazi Dioklecijanova palača?', ['Split', 'Zadar', 'Pula', 'Dubrovnik']],
  [2, 'Koje godišnje doba dolazi nakon zime?', ['Proljeće', 'Ljeto', 'Jesen', 'Nijedno']],
  [2, 'Koliko minuta ima jedan sat?', ['60', '100', '30', '90']],
  [2, 'Koja je životinja najveći kopneni sisavac?', ['Slon', 'Žirafa', 'Nosorog', 'Medvjed']],
  [2, 'Koliko je 12 × 12?', ['144', '124', '132', '154']],
  [2, 'Koji je glavni grad Italije?', ['Rim', 'Milano', 'Napulj', 'Venecija']],

  // ---- Razina 3 ----
  [3, 'Koji je planet najbliži Suncu?', ['Merkur', 'Venera', 'Mars', 'Zemlja']],
  [3, 'Koji je glavni grad Australije?', ['Canberra', 'Sydney', 'Melbourne', 'Perth']],
  [3, 'Koji je kemijski simbol za zlato?', ['Au', 'Ag', 'Zn', 'Go']],
  [3, 'Koliko kostiju ima kostur odrasla čovjeka?', ['206', '186', '226', '312']],
  [3, 'Koji se planet naziva „crvenim planetom”?', ['Mars', 'Jupiter', 'Venera', 'Saturn']],
  [3, 'Koje je godine Hrvatska postala članica Europske unije?', ['2013.', '2009.', '2004.', '2016.']],
  [3, 'Koja je službena valuta u Hrvatskoj od 1. siječnja 2023.?', ['Euro', 'Kuna', 'Dinar', 'Franak']],
  [3, 'Koji je glavni grad Njemačke?', ['Berlin', 'München', 'Hamburg', 'Frankfurt']],
  [3, 'Koji plin biljke uzimaju iz zraka za fotosintezu?', ['Ugljikov dioksid', 'Kisik', 'Dušik', 'Vodik']],
  [3, 'Koliko centimetara ima jedan metar?', ['100', '10', '1000', '60']],

  // ---- Razina 4 ----
  [4, 'Tko je naslikao Mona Lisu?', ['Leonardo da Vinci', 'Michelangelo', 'Rafael', 'Tizian']],
  [4, 'Koliko igrača jedne momčadi istodobno igra na terenu u nogometu?', ['11', '10', '9', '12']],
  [4, 'Kolika je približno brzina svjetlosti u vakuumu?', ['300 000 km/s', '30 000 km/s', '3 000 km/s', '3 000 000 km/s']],
  [4, 'Na kojoj se planini nalazi najviši vrh Hrvatske?', ['Dinara', 'Velebit', 'Biokovo', 'Učka']],
  [4, 'Koja je od navedenih rijeka najdulja?', ['Sava', 'Kupa', 'Krka', 'Cetina']],
  [4, 'Tko je napisao dramu „Romeo i Julija”?', ['William Shakespeare', 'Molière', 'Johann Wolfgang von Goethe', 'Charles Dickens']],
  [4, 'Koji je najveći grad u Dalmaciji?', ['Split', 'Zadar', 'Šibenik', 'Dubrovnik']],
  [4, 'Tko je napisao roman „Zlatarovo zlato”?', ['August Šenoa', 'Ksaver Šandor Gjalski', 'Eugen Kumičić', 'Vjenceslav Novak']],
  [4, 'Koliko stupnjeva ima pravi kut?', ['90', '45', '180', '60']],
  [4, 'Koji je glavni grad Španjolske?', ['Madrid', 'Barcelona', 'Sevilla', 'Valencia']],

  // ---- Razina 5 ----
  [5, 'U kojem je mjestu rođen Nikola Tesla?', ['Smiljan', 'Gospić', 'Karlovac', 'Senj']],
  [5, 'Koji kemijski element ima atomski broj 1?', ['Vodik', 'Helij', 'Kisik', 'Ugljik']],
  [5, 'Koja je najmanja država na svijetu po površini?', ['Vatikan', 'Monako', 'San Marino', 'Lihtenštajn']],
  [5, 'Tko je napisao roman „Povratak Filipa Latinovicza”?', ['Miroslav Krleža', 'August Šenoa', 'Ivo Andrić', 'Ranko Marinković']],
  [5, 'Koje je godine srušen Berlinski zid?', ['1989.', '1991.', '1987.', '1961.']],
  [5, 'Koji je kemijski simbol za željezo?', ['Fe', 'Ir', 'Fr', 'Ž']],
  [5, 'Tko je postavio opću teoriju relativnosti?', ['Albert Einstein', 'Isaac Newton', 'Niels Bohr', 'Max Planck']],
  [5, 'Koji je kemijski simbol za srebro?', ['Ag', 'Au', 'Si', 'Sr']],
  [5, 'Koja je najviša planina na svijetu?', ['Mount Everest', 'K2', 'Mont Blanc', 'Kilimandžaro']],
  [5, 'Koji je planet Sunčeva sustava drugi po veličini i poznat po izraženim prstenovima?', ['Saturn', 'Uran', 'Neptun', 'Jupiter']],

  // ---- Razina 6 ----
  [6, 'Koliko srca ima hobotnica?', ['3', '1', '2', '8']],
  [6, 'U kojem se oceanu nalazi Marijanska brazda?', ['Tihom', 'Atlantskom', 'Indijskom', 'Južnom']],
  [6, 'Tko je autor spjeva „Judita”?', ['Marko Marulić', 'Ivan Gundulić', 'Marin Držić', 'Petar Hektorović']],
  [6, 'Koliko kromosoma ima tipična tjelesna stanica čovjeka?', ['46', '23', '44', '48']],
  [6, 'Koji je glavni grad Kanade?', ['Ottawa', 'Toronto', 'Montreal', 'Vancouver']],
  [6, 'Koje je godine počeo Prvi svjetski rat?', ['1914.', '1918.', '1939.', '1905.']],
  [6, 'Koje je godine čovjek prvi put hodao po Mjesecu?', ['1969.', '1961.', '1972.', '1957.']],
  [6, 'Koji je glavni grad Japana?', ['Tokio', 'Kyoto', 'Osaka', 'Seul']],
  [6, 'Tko je napisao roman „Na Drini ćuprija”?', ['Ivo Andrić', 'Meša Selimović', 'Miroslav Krleža', 'Branko Ćopić']],
  [6, 'Koliko je 15 % od 200?', ['30', '15', '20', '35']],

  // ---- Razina 7 ----
  [7, 'Po čemu je poznat Ivan Vučetić, rodom s Hvara?', ['Sustavu identifikacije otiscima prstiju', 'Izumu mehaničke olovke', 'Izumu padobrana', 'Otkriću vitamina C']],
  [7, 'Što je izumio Slavoljub Penkala?', ['Mehaničku olovku', 'Telefon', 'Padobran', 'Kravatu']],
  [7, 'Koji je kemičar rođen u Vukovaru dobio Nobelovu nagradu za kemiju 1939.?', ['Lavoslav Ružička', 'Vladimir Prelog', 'Fran Bošnjaković', 'Ivan Supek']],
  [7, 'Koje se godine odigrala bitka kod Siska?', ['1593.', '1493.', '1683.', '1526.']],
  [7, 'Koji je pisac dobio Nobelovu nagradu za književnost 1961.?', ['Ivo Andrić', 'Miroslav Krleža', 'Ernest Hemingway', 'Albert Camus']],
  [7, 'Tko je napisao komediju „Dundo Maroje”?', ['Marin Držić', 'Ivan Gundulić', 'Marko Marulić', 'Hanibal Lucić']],
  [7, 'Koji je glavni grad Brazila?', ['Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador']],
  [7, 'Tko je autor epa „Osman”?', ['Ivan Gundulić', 'Marin Držić', 'Petar Zoranić', 'Andrija Kačić Miošić']],
  [7, 'Koliko planeta ima Sunčev sustav (prema podjeli iz 2006.)?', ['8', '9', '7', '10']],
  [7, 'Koje je godine potonuo Titanic?', ['1912.', '1905.', '1915.', '1921.']],

  // ---- Razina 8 ----
  [8, 'Koji je glavni grad Mongolije?', ['Ulan Bator', 'Astana', 'Biškek', 'Taškent']],
  [8, 'Koliko je kemijskih elemenata službeno potvrđeno i imenovano u periodnom sustavu?', ['118', '108', '112', '126']],
  [8, 'Koje se godine odigrala Krbavska bitka?', ['1493.', '1593.', '1389.', '1102.']],
  [8, 'U kojem je gradu rođen Ruđer Bošković?', ['Dubrovnik', 'Split', 'Zadar', 'Rim']],
  [8, 'Koji je glavni grad Turske?', ['Ankara', 'Istanbul', 'Izmir', 'Antalya']],
  [8, 'Kako se zove mjerna jedinica električnog otpora?', ['Om (ohm)', 'Volt', 'Amper', 'Vat']],
  [8, 'Tko je napisao „Ribanje i ribarsko prigovaranje”?', ['Petar Hektorović', 'Marko Marulić', 'Petar Zoranić', 'Hanibal Lucić']],
  [8, 'Koje je godine Kristofor Kolumbo prvi put stigao do Amerike?', ['1492.', '1498.', '1453.', '1519.']],
  [8, 'Koji je najveći mjesec planeta Saturna?', ['Titan', 'Europa', 'Ganimed', 'Enceladus']],
  [8, 'Tko je otkrio penicilin?', ['Alexander Fleming', 'Louis Pasteur', 'Robert Koch', 'Edward Jenner']],

  // ---- Razina 9 ----
  [9, 'Koji je izumitelj u djelu „Machinae novae” opisao napravu „Homo volans”, preteču padobrana?', ['Faust Vrančić', 'Ruđer Bošković', 'Ivan Vučetić', 'Slavoljub Penkala']],
  [9, 'Koje je godine ukinuta Dubrovačka Republika?', ['1808.', '1797.', '1815.', '1848.']],
  [9, 'Koji je najmanji prirodni broj koji se na dva različita načina može zapisati kao zbroj dvaju kubova?', ['1729', '1001', '4104', '9999']],
  [9, 'Koje je godine Hrvatski sabor u Cetingradu izabrao Ferdinanda Habsburškog za kralja?', ['1527.', '1526.', '1573.', '1102.']],
  [9, 'Koji je kemijski simbol volframa?', ['W', 'V', 'Wo', 'Tu']],
  [9, 'Kolika je približna vrijednost Eulerova broja e?', ['2,718', '3,142', '1,618', '1,414']],
  [9, 'Tko je napisao „Planine”, prvi hrvatski roman?', ['Petar Zoranić', 'Petar Hektorović', 'Juraj Baraković', 'Marin Držić']],
  [9, 'Koji kemijski element ima atomski broj 26?', ['Željezo', 'Bakar', 'Nikal', 'Kobalt']],
  [9, 'Koje je najdublje jezero na svijetu?', ['Bajkal', 'Tanganjika', 'Kaspijsko jezero', 'Gornje jezero']],
  [9, 'Koji je glavni grad Kazahstana?', ['Astana', 'Almati', 'Taškent', 'Biškek']],

  // ---- Razina 10 ----
  [10, 'Koji kemijski element ima najveću elektronegativnost?', ['Fluor', 'Kisik', 'Klor', 'Dušik']],
  [10, 'Kolika je apsolutna nula izražena u Celzijevim stupnjevima?', ['−273,15 °C', '−100 °C', '−459,67 °C', '−237,15 °C']],
  [10, 'Koje je godine Hrvatski sabor proglasio hrvatski jezik službenim umjesto latinskoga?', ['1847.', '1848.', '1868.', '1790.']],
  [10, 'Koji je najmanji savršeni broj (jednak zbroju svojih pravih djelitelja)?', ['6', '28', '12', '8']],
  [10, 'Koje je godine Leopoldovom diplomom osnovano sveučilište u Zagrebu?', ['1669.', '1874.', '1607.', '1776.']],
  [10, 'Tko je dokazao Fermatov posljednji teorem?', ['Andrew Wiles', 'Grigorij Perelman', 'Pierre de Fermat', 'Leonhard Euler']],
  [10, 'Koliki je zbroj unutarnjih kutova peterokuta?', ['540°', '360°', '720°', '450°']],
  [10, 'Koji je glavni grad Butana?', ['Thimphu', 'Katmandu', 'Dhaka', 'Lhasa']],
  [10, 'Koje je godine Hrvatska primljena u Ujedinjene narode?', ['1992.', '1991.', '1995.', '1993.']],
  [10, 'Koji kemijski element ima atomski broj 79?', ['Zlato', 'Srebro', 'Platina', 'Živa']],
];
