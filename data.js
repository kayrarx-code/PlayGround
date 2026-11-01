/* ============================================================
   BÜYÜK HARP — veri katmanı
   Harita: Natural Earth 110m tabanlı, sadeleştirilmiş Avrupa
   ============================================================ */
(() => {
  'use strict';
  const BH = window.BH = window.BH || {};

  const MAP = window.MAP_DATA;
  const REGIONS = MAP.regions;
  const REG = Object.fromEntries(REGIONS.map(r => [r.id, r]));
  const NEI = Object.fromEntries(REGIONS.map(r => [r.id, r.neighbors.slice()]));

  // Deniz bağlantıları — kara sınırı olmayan stratejik geçişler
  const SEA_LINKS = [
    ['UK', 'FRA'], ['UK', 'BEN'], ['UK', 'NOR'], ['UK', 'GER'], ['IRE', 'UK'],
    ['DEN', 'SWE'], ['DEN', 'NOR'], ['SWE', 'BAL'], ['SWE', 'FIN'],
    ['ITA', 'LBY'], ['ITA', 'ALB'], ['ITA', 'GRE'], ['ITA', 'FNA'],
    ['GRE', 'LBY'], ['TUR', 'UKR'], ['RUS', 'TUR'], ['SPA', 'FNA'], ['LBY', 'FNA']
  ];
  const SEA = new Set(SEA_LINKS.map(([a, b]) => [a, b].sort().join('|')));
  const isSea = (a, b) => SEA.has([a, b].sort().join('|'));

  const OWNER = {
    axis: { color: '#b5503f', light: '#e09a83', fill: 'rgba(181,80,63,.70)', name: 'Mihver' },
    allies: { color: '#4b7fa8', light: '#9cc6e2', fill: 'rgba(75,127,168,.70)', name: 'Müttefik' },
    neutral: { color: '#7d7a63', light: '#c9c1a2', fill: 'rgba(125,122,99,.50)', name: 'Tarafsız' }
  };

  const TERRAIN = {
    'ova': { label: 'Ova', def: 0.02, icon: '▤' },
    'dağ': { label: 'Dağlık', def: 0.30, icon: '▲' },
    'orman': { label: 'Orman', def: 0.18, icon: '♣' },
    'ada': { label: 'Ada', def: 0.22, icon: '≈' },
    'çöl': { label: 'Çöl', def: 0.10, icon: '☼' },
    'step': { label: 'Step', def: 0.05, icon: '⌁' },
    'kıyı': { label: 'Kıyı', def: 0.08, icon: '≋' }
  };

  const DIFF = {
    easy: { label: 'Kolay', aiAttack: 0.84, aiDefense: 0.88, aiIncome: 0.86, playerIncome: 1.12, aggro: 1.35 },
    normal: { label: 'Tarihî', aiAttack: 1.00, aiDefense: 1.00, aiIncome: 1.00, playerIncome: 1.00, aggro: 1.08 },
    hard: { label: 'Zor', aiAttack: 1.18, aiDefense: 1.14, aiIncome: 1.22, playerIncome: 0.94, aggro: 0.92 }
  };

  const SAVE_KEY = 'buyuk-harp-save-v1';
  const SOUND_KEY = 'buyuk-harp-sound';
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  // Harita üzerinde etiketlerin daha okunaklı durması için ince ayarlar
  const LABEL_OVERRIDES = {
    POR: [117, 801], SPA: [235, 785], FRA: [356, 668], UK: [263, 555], IRE: [125, 551],
    BEN: [407, 558], GER: [505, 585], BOH: [601, 614], SWI: [461, 672], ITA: [535, 698],
    DEN: [490, 482], NOR: [478, 365], SWE: [654, 312], FIN: [855, 319], POL: [722, 571],
    BAL: [868, 473], BLR: [904, 534], UKR: [994, 626], RUS: [1240, 405], CAU: [1337, 781],
    HUN: [737, 661], ROM: [839, 689], BUL: [837, 746], ADR: [650, 688], SRB: [737, 713],
    ALB: [725, 774], GRE: [763, 797], TUR: [1007, 804], LBY: [570, 942], EGY: [954, 949],
    FNA: [392, 908], SYR: [1109, 866], IRQ: [1224, 886]
  };

  // ------------------------------------------------------------
  // SEFERLER
  // ------------------------------------------------------------
  const SCENARIOS = {
    ww2: {
      id: 'ww2',
      era: 'İKİNCİ DÜNYA SAVAŞI',
      year: '1939',
      title: 'Şimşek Savaşı',
      subtitle: 'Avrupa 1939',
      tag: '1939 — 1943',
      blurb: 'Polonya sınırında başlayan kıvılcım, kıtayı yıllar sürecek bir ateşe çeviriyor.',
      start: { year: 1939, month: 8 },
      monthsPerTurn: 1,
      maxTurns: 42,
      startTreasury: { axis: 18, allies: 17 },
      startMorale: { axis: 68, allies: 66 },
      sides: {
        axis: {
          name: 'Mihver Devletleri', short: 'MİHVER', emblem: 'cross',
          motto: 'Yıldırım gibi vur, kıtayı tek hamlede bük.',
          difficulty: 'Saldırgan'
        },
        allies: {
          name: 'Müttefik Devletler', short: 'MÜTTEFİK', emblem: 'star',
          motto: 'Savunmayı örgütle, dalgayı kıyıda kır.',
          difficulty: 'Dengeli'
        }
      },
      owners: {
        GER: 'axis', BOH: 'axis', ITA: 'axis', ALB: 'axis', LBY: 'axis',
        UK: 'allies', FRA: 'allies', POL: 'allies', FNA: 'allies', EGY: 'allies'
      },
      troops: {
        GER: 11, BOH: 4, ITA: 7, ALB: 2, LBY: 3,
        UK: 8, FRA: 9, POL: 6, FNA: 3, EGY: 3,
        BEN: 4, SWI: 6, SPA: 5, POR: 3, IRE: 2, DEN: 2, NOR: 3, SWE: 5, FIN: 4,
        BAL: 3, BLR: 4, UKR: 5, RUS: 13, CAU: 3, HUN: 4, ROM: 5, BUL: 4,
        ADR: 3, SRB: 4, GRE: 4, TUR: 7, SYR: 2, IRQ: 2
      },
      capitals: {
        GER: 'Berlin', FRA: 'Paris', UK: 'Londra', RUS: 'Moskova',
        ITA: 'Roma', POL: 'Varşova', BOH: 'Prag'
      },
      objectives: {
        axis: [
          { region: 'FRA', label: 'Paris' },
          { region: 'UK', label: 'Londra' },
          { region: 'RUS', label: 'Moskova' }
        ],
        allies: [
          { region: 'GER', label: 'Berlin' },
          { region: 'ITA', label: 'Roma' },
          { region: 'BOH', label: 'Prag' }
        ]
      },
      names: {
        UK: 'İngiltere', GER: 'Almanya', BOH: 'Bohemya', RUS: 'SSCB', BAL: 'Baltık',
        BLR: 'Beyaz Rusya', UKR: 'Ukrayna', CAU: 'Kafkasya', FNA: 'K. Afrika',
        SYR: 'Levant', EGY: 'Mısır', LBY: 'Libya', TUR: 'Türkiye', ROM: 'Romanya',
        HUN: 'Macaristan', BUL: 'Bulgaristan', ADR: 'Hırvatistan', SRB: 'Sırbistan',
        ALB: 'Arnavutluk', GRE: 'Yunanistan', BEN: 'Benelüks', DEN: 'Danimarka',
        NOR: 'Norveç', SWE: 'İsveç', FIN: 'Finlandiya', POL: 'Polonya', ITA: 'İtalya',
        FRA: 'Fransa', SPA: 'İspanya', POR: 'Portekiz', SWI: 'İsviçre', IRE: 'İrlanda'
      },
      events: [
        {
          id: 'w2-1', turn: 1, date: '1 Eylül 1939', title: 'FALL WEISS',
          kicker: 'HAREKÂT EMRİ',
          text: '1 Eylül sabahı saat 04.45’te Alman zırhlıları Polonya sınırını geçti. Danzig için verilen ültimatom cevapsız kaldı; Avrupa’nın kaderi artık tank paletlerinin altında yazılacak.\n\nPolonya ordusu cesur ama yalnız. Batı’daki müttefikler ise hâlâ harekete geçmedi. Bu, yıldırım savaşının ilk dersi olacak.',
          effects: [
            { type: 'troops', region: 'GER', side: 'axis', amount: 2 },
            { type: 'troops', region: 'POL', side: 'allies', amount: 2 },
            { type: 'morale', side: 'axis', amount: 2 }
          ]
        },
        {
          id: 'w2-2', turn: 3, date: '30 Kasım 1939', title: 'KIŞ SAVAŞI',
          kicker: 'KUZEY CEPHESİ',
          text: 'Sovyet birlikleri Finlandiya sınırını aştı. Kışın ortasında, ormanların ve göllerin arasında ilerleyen Kızıl Ordu, küçük ama inatçı bir savunmayla karşılaştı. Finlandiya’nın “Mannerheim Hattı” adı tarihe geçiyor.',
          effects: [
            { type: 'troops', region: 'FIN', side: 'allies', amount: 2 },
            { type: 'troops', region: 'RUS', side: 'allies', amount: 2 },
            { type: 'morale', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w2-3', turn: 5, date: 'Şubat 1940', title: 'TÜFEK SESİZLİĞİ',
          kicker: 'BATI CEPHESİ',
          text: 'Maginot Hattı ile Siegfried Hattı arasında garip bir sessizlik hüküm sürüyor. Askerler siperlerde kâğıt oynuyor, radyoda dans müziği çalıyor. Ama her iki taraf da fırtınanın geleceğini biliyor.',
          effects: [
            { type: 'gold', side: 'axis', amount: 7 },
            { type: 'gold', side: 'allies', amount: 7 },
            { type: 'morale', side: 'axis', amount: 2 },
            { type: 'morale', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w2-4', turn: 7, date: '9 Nisan 1940', title: 'WESERÜBUNG',
          kicker: 'KUZEY İSTİLASI',
          text: 'Alman birlikleri Danimarka’ya ve Norveç’e aynı anda girdi. Kopenhag birkaç saat içinde teslim oldu; Norveç’te ise Narvik’e kadar uzanan çetin bir kış savaşı başladı. Atlantik’in kapıları artık Mihver’in elinde.',
          effects: [
            { type: 'join', regions: ['DEN', 'NOR'], side: 'axis', amount: 2 },
            { type: 'troops', region: 'GER', side: 'axis', amount: 2 },
            { type: 'troops', region: 'UK', side: 'allies', amount: 2 },
            { type: 'morale', side: 'allies', amount: -2 }
          ]
        },
        {
          id: 'w2-5', turn: 9, date: '10 Mayıs 1940', title: 'FRANSA SEFERİ',
          kicker: 'BATI CEPHESİ',
          text: 'Alman panzer tümenleri Ardenler’den geçerek Sedan’ı yarıp geçti. Müttefik hatları ikiye bölündü; Manş kıyısına doğru çekilme başladı. Fransa’nın kaderi artık birkaç hafta meselesi.',
          effects: [
            { type: 'troops', region: 'GER', side: 'axis', amount: 4 },
            { type: 'troops', region: 'FRA', side: 'allies', amount: 3 },
            { type: 'morale', side: 'axis', amount: 3 },
            { type: 'morale', side: 'allies', amount: -3 }
          ]
        },
        {
          id: 'w2-6', turn: 10, date: 'Haziran 1940', title: 'DUNKIRK',
          kicker: 'TAHLİYE',
          text: 'Manş kıyısında sıkışan yüz binlerce asker, küçük teknelerden oluşan bir filoyla İngiltere’ye taşınıyor. Tarihçiler buna “bir mucize” diyecek. Ama mucizenin bedeli, Fransa’da bırakılan ağır silahlardır.',
          effects: [
            { type: 'troops', region: 'UK', side: 'allies', amount: 3 },
            { type: 'troops', region: 'FRA', side: 'allies', amount: -2 },
            { type: 'morale', side: 'allies', amount: 3 }
          ]
        },
        {
          id: 'w2-7', turn: 12, date: 'Eylül 1940', title: 'BRİTANYA MUHAREBESİ',
          kicker: 'HAVA SAVAŞI',
          text: 'Luftwaffe, Londra’yı gece gündüz bombalıyor. Radar istasyonları, Spitfire filoları ve inatçı bir halk direniyor. Churchill’in sesi radyoda yankılanıyor: “Asla teslim olmayacağız.”',
          effects: [
            { type: 'troops', region: 'UK', side: 'allies', amount: -2 },
            { type: 'morale', side: 'allies', amount: -4 },
            { type: 'morale', side: 'axis', amount: 3 }
          ]
        },
        {
          id: 'w2-8', turn: 14, date: 'Kasım 1940', title: 'ÖDÜNÇ VERME',
          kicker: 'ATLANTİK KÖPRÜSÜ',
          text: 'ABD Kongresi, İngiltere’ye silah ve malzeme sağlayan Lend-Lease yasasını kabul etti. Resmen tarafsız olsa da Amerikan sanayisi artık Müttefiklerin cephaneliği hâline geliyor.',
          effects: [
            { type: 'gold', side: 'allies', amount: 14 },
            { type: 'morale', side: 'allies', amount: 3 }
          ]
        },
        {
          id: 'w2-9', turn: 16, date: 'Ocak 1941', title: 'BALKAN PAKTI',
          kicker: 'GÜNEYDOĞU AVRUPA',
          text: 'Macaristan, Romanya ve Bulgaristan Mihver safında yerini aldı. Ploiești petrol sahaları ve Balkan demiryolları, Almanya’nın savaş makinesine yakıt taşıyacak. Sovyet sınırı artık çok daha yakın.',
          effects: [
            { type: 'join', regions: ['HUN', 'ROM', 'BUL'], side: 'axis', amount: 2 },
            { type: 'gold', side: 'axis', amount: 6 },
            { type: 'troops', region: 'GER', side: 'axis', amount: 2 }
          ]
        },
        {
          id: 'w2-10', turn: 22, date: '22 Haziran 1941', title: 'BARBAROSSA',
          kicker: 'DOĞU CEPHESİ',
          text: 'Üç milyon asker, üç bin tank ve yüzlerce uçak, Sovyet sınırını aynı anda aştı. Berlin’de zafer havası esiyor; Moskova’ya giden yol açık görünüyor. Ama Rusya’nın derinliği ve kışı hesaba katılmadı.',
          effects: [
            { type: 'join', regions: ['RUS', 'BLR', 'UKR', 'CAU'], side: 'allies', amount: 2 },
            { type: 'troops', region: 'GER', side: 'axis', amount: 6 },
            { type: 'troops', region: 'RUS', side: 'allies', amount: 6 },
            { type: 'morale', side: 'axis', amount: 4 },
            { type: 'morale', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w2-11', turn: 27, date: '7 Aralık 1941', title: 'PEARL HARBOR',
          kicker: 'PASİFİK',
          text: 'Japon uçakları Pearl Harbor’daki Amerikan üssünü vurdu. Ertesi gün ABD savaşa girdi. Atlantik’ten Pasifik’e uzanan bu savaş artık gerçek anlamda bir dünya savaşı.',
          effects: [
            { type: 'gold', side: 'allies', amount: 16 },
            { type: 'morale', side: 'allies', amount: 6 },
            { type: 'troops', region: 'UK', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w2-12', turn: 31, date: 'Haziran 1942', title: 'MIDWAY',
          kicker: 'DENİZ HÂKİMİYETİ',
          text: 'Pasifik’te dört Japon uçak gemisi battı. Deniz savaşının yönü değişti; Amerikan sanayisi ve istihbaratı üstünlüğü ele geçirdi. Müttefikler artık sadece savunmuyor, karşı saldırıya hazırlanıyor.',
          effects: [
            { type: 'gold', side: 'allies', amount: 10 },
            { type: 'morale', side: 'allies', amount: 5 }
          ]
        },
        {
          id: 'w2-13', turn: 35, date: 'Ağustos 1942', title: 'STALİNGRAD',
          kicker: 'DOĞU CEPHESİ',
          text: 'Volga kıyısındaki şehir harabeye döndü. Sokak sokak, ev ev süren savaşta iki ordu da tükeniyor. Kış yaklaşırken Kızıl Ordu karşı taarruz için birliklerini topluyor.',
          effects: [
            { type: 'troops', region: 'RUS', side: 'allies', amount: 8 },
            { type: 'morale', side: 'axis', amount: -8 },
            { type: 'morale', side: 'allies', amount: 4 }
          ]
        },
        {
          id: 'w2-14', turn: 37, date: 'Kasım 1942', title: 'EL ALAMEYN',
          kicker: 'KUZEY AFRİKA',
          text: 'Çölün ortasında aylarca süren kovalamaca sona erdi. Montgomery’nin Sekizinci Ordusu, Rommel’in Afrika Kolordusu’nu geri çekilmeye zorladı. Akdeniz’in güney kapısı Müttefiklere açılıyor.',
          effects: [
            { type: 'gold', side: 'allies', amount: 9 },
            { type: 'morale', side: 'axis', amount: -4 },
            { type: 'morale', side: 'allies', amount: 3 }
          ]
        },
        {
          id: 'w2-15', turn: 39, date: 'Aralık 1942', title: 'MEŞALE HAREKÂTI',
          kicker: 'KUZEY AFRİKA',
          text: 'Amerikan ve İngiliz birlikleri Fas ve Cezayir’e çıktı. Mihver, Afrika’da iki ateş arasında kaldı. Savaşın ağırlık merkezi yavaş yavaş Avrupa’ya kayıyor.',
          effects: [
            { type: 'gold', side: 'allies', amount: 10 },
            { type: 'troops', region: 'UK', side: 'allies', amount: 3 },
            { type: 'morale', side: 'allies', amount: 3 }
          ]
        },
        {
          id: 'w2-16', turn: 41, date: 'Şubat 1943', title: 'SON HESAPLAŞMA',
          kicker: 'TOPLAM SAVAŞ',
          text: 'Artık hiçbir ülke savaşın dışında değil. Fabrikalar gece gündüz çalışıyor, cepheler her geçen gün biraz daha yaklaşıyor. Tarihin son sayfası henüz yazılmadı.',
          effects: [
            { type: 'gold', side: 'axis', amount: 8 },
            { type: 'gold', side: 'allies', amount: 8 },
            { type: 'morale', side: 'axis', amount: 2 },
            { type: 'morale', side: 'allies', amount: 2 }
          ]
        }
      ]
    },

    ww1: {
      id: 'ww1',
      era: 'BİRİNCİ DÜNYA SAVAŞI',
      year: '1914',
      title: 'Büyük Savaş',
      subtitle: 'Avrupa 1914',
      tag: '1914 — 1918',
      blurb: 'Saraybosna’daki tek bir kurşun, dört imparatorluğu ve milyonlarca insanı sürükleyecek bir makineyi ateşliyor.',
      start: { year: 1914, month: 6 },
      monthsPerTurn: 2,
      maxTurns: 27,
      startTreasury: { axis: 20, allies: 18 },
      startMorale: { axis: 70, allies: 68 },
      sides: {
        axis: {
          name: 'İttifak Devletleri', short: 'İTTİFAK', emblem: 'iron',
          motto: 'İki cephede savaş, ama önce Batı’yı bitir.',
          difficulty: 'Zorlu'
        },
        allies: {
          name: 'İtilaf Devletleri', short: 'İTİLAF', emblem: 'tricolor',
          motto: 'Kuşatmayı kır, imparatorlukları yıprat.',
          difficulty: 'Dengeli'
        }
      },
      owners: {
        GER: 'axis', BOH: 'axis', HUN: 'axis', ADR: 'axis',
        FRA: 'allies', UK: 'allies', RUS: 'allies', BLR: 'allies', UKR: 'allies',
        BAL: 'allies', FIN: 'allies', POL: 'allies', SRB: 'allies', FNA: 'allies',
        EGY: 'allies', CAU: 'allies'
      },
      troops: {
        GER: 12, BOH: 8, HUN: 6, ADR: 3,
        FRA: 11, UK: 8, RUS: 14, BLR: 3, UKR: 4, BAL: 3, FIN: 3, POL: 5,
        SRB: 4, FNA: 3, EGY: 3, CAU: 3,
        BEN: 3, ITA: 7, TUR: 7, BUL: 4, ROM: 5, GRE: 4, ALB: 2,
        SPA: 5, POR: 3, SWI: 6, SWE: 5, NOR: 3, DEN: 2, LBY: 2, SYR: 2, IRQ: 2
      },
      capitals: {
        GER: 'Berlin', FRA: 'Paris', UK: 'Londra', RUS: 'Petrograd',
        BOH: 'Viyana', HUN: 'Budapeşte', TUR: 'İstanbul', SRB: 'Belgrad', ITA: 'Roma'
      },
      objectives: {
        axis: [
          { region: 'FRA', label: 'Paris' },
          { region: 'RUS', label: 'Petrograd' },
          { region: 'SRB', label: 'Belgrad' }
        ],
        allies: [
          { region: 'GER', label: 'Berlin' },
          { region: 'BOH', label: 'Viyana' },
          { region: 'HUN', label: 'Budapeşte' }
        ]
      },
      names: {
        GER: 'Almanya', BOH: 'Avusturya', HUN: 'Macaristan', ADR: 'Bosna',
        SRB: 'Sırbistan', RUS: 'Rusya', POL: 'Polonya', BAL: 'Baltık',
        BLR: 'Beyaz Rusya', UKR: 'Ukrayna', CAU: 'Kafkasya', TUR: 'Osmanlı',
        SYR: 'Suriye', IRQ: 'Irak', EGY: 'Mısır', FNA: 'K. Afrika', UK: 'İngiltere',
        BEN: 'Belçika', ITA: 'İtalya', ROM: 'Romanya', BUL: 'Bulgaristan',
        GRE: 'Yunanistan', ALB: 'Arnavutluk', FRA: 'Fransa', SPA: 'İspanya',
        POR: 'Portekiz', SWI: 'İsviçre', SWE: 'İsveç', NOR: 'Norveç',
        DEN: 'Danimarka', FIN: 'Finlandiya', LBY: 'Trablusgarp', IRE: 'İrlanda'
      },
      events: [
        {
          id: 'w1-1', turn: 1, date: '28 Haziran 1914', title: 'SARAYBOSNA',
          kicker: 'KIVILCIM',
          text: 'Avusturya-Macaristan Veliahtı Arşidük Franz Ferdinand, Saraybosna’da vuruldu. Viyana, Sırbistan’a bir ültimatom gönderdi. Avrupa’nın ittifak zincirleri gıcırdamaya başladı.',
          effects: [
            { type: 'morale', side: 'axis', amount: 3 },
            { type: 'morale', side: 'allies', amount: -2 }
          ]
        },
        {
          id: 'w1-2', turn: 2, date: 'Ağustos 1914', title: 'BELÇİKA’NIN İŞGALİ',
          kicker: 'BATI CEPHESİ',
          text: 'Alman ordusu, Fransa’yı kuşatmak için tarafsız Belçika’dan geçti. “Kâğıt parçası” diye anılan tarafsızlık garantisi yırtıldı. İngiltere, Belçika’nın yanında savaşa girdi.',
          effects: [
            { type: 'join', regions: ['BEN'], side: 'allies', amount: 2 },
            { type: 'troops', region: 'GER', side: 'axis', amount: 4 },
            { type: 'troops', region: 'UK', side: 'allies', amount: 2 },
            { type: 'morale', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w1-3', turn: 3, date: 'Eylül 1914', title: 'MARNE MUCIZESİ',
          kicker: 'BATI CEPHESİ',
          text: 'Paris’in kapılarına dayanan Alman sağ kanadı, Marne Nehri kıyısında durduruldu. Taksi şoförleri asker taşıdı, telefon hatları kesildi, ama Paris kurtuldu. Siper savaşı artık kaçınılmaz.',
          effects: [
            { type: 'troops', region: 'FRA', side: 'allies', amount: 3 },
            { type: 'morale', side: 'allies', amount: 5 },
            { type: 'morale', side: 'axis', amount: -4 }
          ]
        },
        {
          id: 'w1-4', turn: 5, date: 'Mart 1915', title: 'SİPER SAVAŞI',
          kicker: 'BATI CEPHESİ',
          text: 'İki ordu da toprağa gömüldü. Dikenli teller, makineli tüfekler ve çamur, saldırıyı intihara dönüştürüyor. Cephe hattı yüzlerce kilometre boyunca dondu.',
          effects: [
            { type: 'entrenchAll', amount: 1 },
            { type: 'morale', side: 'axis', amount: -1 },
            { type: 'morale', side: 'allies', amount: -1 }
          ]
        },
        {
          id: 'w1-5', turn: 6, date: 'Mayıs 1915', title: 'İTALYA’NIN KATILIŞI',
          kicker: 'AKDENİZ',
          text: 'İtalya, İttifak Devletleri’nden ayrılarak İtilaf safına geçti. Alplerde yeni bir cephe açıldı; Akdeniz’deki dengeler bir kez daha değişti.',
          effects: [
            { type: 'join', regions: ['ITA', 'LBY'], side: 'allies', amount: 2 },
            { type: 'morale', side: 'allies', amount: 3 },
            { type: 'morale', side: 'axis', amount: -2 }
          ]
        },
        {
          id: 'w1-6', turn: 8, date: 'Nisan 1915', title: 'ÇANAKKALE',
          kicker: 'BOĞAZLAR',
          text: 'İtilaf donanması Çanakkale Boğazı’nı zorladı; kara çıkarması başladı. Siperler, dik yamaçlar ve inatçı savunma, bu harekâtı unutulmaz bir direnişe dönüştürdü. Osmanlı İmparatorluğu savaşa resmen girdi.',
          effects: [
            { type: 'join', regions: ['TUR', 'SYR', 'IRQ'], side: 'axis', amount: 2 },
            { type: 'troops', region: 'TUR', side: 'axis', amount: 3 },
            { type: 'troops', region: 'UK', side: 'allies', amount: -2 },
            { type: 'morale', side: 'allies', amount: -4 }
          ]
        },
        {
          id: 'w1-7', turn: 10, date: 'Şubat 1916', title: 'VERDUN',
          kicker: 'BATI CEPHESİ',
          text: 'Alman topçusu Verdun’u on saat boyunca dövdü. “Fransa’yı kanatmak” için seçilen bu küçük kale, aylarca süren bir ölüm makinesine dönüştü. İki taraf da yüz binlerce asker kaybetti.',
          effects: [
            { type: 'troops', region: 'FRA', side: 'allies', amount: -3 },
            { type: 'troops', region: 'GER', side: 'axis', amount: -3 },
            { type: 'morale', side: 'axis', amount: -3 },
            { type: 'morale', side: 'allies', amount: -3 }
          ]
        },
        {
          id: 'w1-8', turn: 12, date: 'Temmuz 1916', title: 'SOMME',
          kicker: 'BATI CEPHESİ',
          text: 'İngiliz ve Fransız birlikleri Somme’da taarruza geçti. İlk gün on binlerce asker hayatını kaybetti. Kazanılan toprak birkaç kilometreyi geçmedi; ama Alman ordusu burada kan kaybetti.',
          effects: [
            { type: 'troops', region: 'UK', side: 'allies', amount: 5 },
            { type: 'troops', region: 'GER', side: 'axis', amount: -3 },
            { type: 'morale', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w1-9', turn: 14, date: 'Ekim 1915', title: 'BULGARİSTAN',
          kicker: 'BALKANLAR',
          text: 'Bulgaristan, İttifak Devletleri safında savaşa girdi. Sırbistan’a yönelen ortak taarruz, Balkan cephesini yeniden alevlendirdi.',
          effects: [
            { type: 'join', regions: ['BUL'], side: 'axis', amount: 2 },
            { type: 'troops', region: 'BUL', side: 'axis', amount: 3 },
            { type: 'morale', side: 'axis', amount: 2 }
          ]
        },
        {
          id: 'w1-10', turn: 16, date: 'Ağustos 1916', title: 'ROMANYA',
          kicker: 'BALKANLAR',
          text: 'Romanya, İtilaf Devletleri’nin yanında savaşa katıldı. Transilvanya’ya giren Romen ordusu kısa sürede geri püskürtüldü; ama yeni cephe İttifak’ın kaynaklarını böldü.',
          effects: [
            { type: 'join', regions: ['ROM'], side: 'allies', amount: 2 },
            { type: 'troops', region: 'ROM', side: 'allies', amount: 3 },
            { type: 'morale', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w1-11', turn: 18, date: 'Nisan 1917', title: 'ABD SAVAŞA GİRİYOR',
          kicker: 'ATLANTİK',
          text: 'Sınırsız denizaltı savaşı ve Zimmermann Telgrafı, Amerika’nın sabrını taşırdı. ABD Kongresi savaş ilan etti. Taze birlikler ve dev sanayi, İtilaf’ın eline geçti.',
          effects: [
            { type: 'gold', side: 'allies', amount: 18 },
            { type: 'morale', side: 'allies', amount: 6 },
            { type: 'troops', region: 'UK', side: 'allies', amount: 3 },
            { type: 'troops', region: 'FRA', side: 'allies', amount: 3 }
          ]
        },
        {
          id: 'w1-12', turn: 20, date: 'Ekim 1917', title: 'RUS DEVRİMİ',
          kicker: 'DOĞU CEPHESİ',
          text: 'Petrograd’da Bolşevikler iktidarı ele geçirdi. Rusya, savaştan çekilmek için ateşkes imzaladı. Doğu cephesi çökerken Almanya, tüm gücünü Batı’ya kaydırma fırsatı buldu.',
          effects: [
            { type: 'leave', regions: ['RUS', 'BLR', 'UKR', 'BAL', 'FIN', 'CAU'], side: 'allies' },
            { type: 'morale', side: 'allies', amount: -10 },
            { type: 'morale', side: 'axis', amount: 5 },
            { type: 'gold', side: 'axis', amount: 8 }
          ]
        },
        {
          id: 'w1-13', turn: 22, date: 'Ocak 1918', title: 'YUNANİSTAN',
          kicker: 'BALKANLAR',
          text: 'Yunanistan, İtilaf safında savaşa girdi. Selanik cephesi güçlendi; Balkanlar’daki denge İtilaf’ın lehine dönmeye başladı.',
          effects: [
            { type: 'join', regions: ['GRE'], side: 'allies', amount: 2 },
            { type: 'troops', region: 'GRE', side: 'allies', amount: 2 }
          ]
        },
        {
          id: 'w1-14', turn: 24, date: 'Mayıs 1918', title: 'SON TAARRUZ',
          kicker: 'BATI CEPHESİ',
          text: 'Alman ordusu son büyük taarruzunu başlattı. Marne’a kadar ilerledi ama hedefe ulaşamadı. Şimdi karşı taarruz için hazırlanan Müttefikler, savaşın sonunu getirecek hamleyi planlıyor.',
          effects: [
            { type: 'gold', side: 'axis', amount: 10 },
            { type: 'gold', side: 'allies', amount: 10 },
            { type: 'morale', side: 'axis', amount: 3 },
            { type: 'morale', side: 'allies', amount: 3 }
          ]
        }
      ]
    }
  };

  // ------------------------------------------------------------
  // Yardımcılar
  // ------------------------------------------------------------
  function emblemSVG(kind, cls = '') {
    const common = `class="${cls}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"`;
    if (kind === 'cross') {
      return `<svg ${common}><circle cx="32" cy="32" r="30" fill="#241311" stroke="#d3af69" stroke-width="1.4"/><circle cx="32" cy="32" r="23" fill="#b5503f"/><path d="M26 10h12v16h16v12H38v16H26V38H10V26h16z" fill="#10100f" stroke="#f2d99f" stroke-width="1.1"/></svg>`;
    }
    if (kind === 'star') {
      return `<svg ${common}><circle cx="32" cy="32" r="30" fill="#0d1c27" stroke="#d3af69" stroke-width="1.4"/><circle cx="32" cy="32" r="23" fill="#4b7fa8"/><path d="M32 13l5.1 12.4 13.4 1.1-10.2 8.8 3.1 13.1L32 41.9l-11.4 6.5 3.1-13.1-10.2-8.8 13.4-1.1z" fill="#f2e6c9"/><circle cx="32" cy="32" r="27" fill="none" stroke="#f2d99f" stroke-width=".7" opacity=".7"/></svg>`;
    }
    if (kind === 'iron') {
      return `<svg ${common}><circle cx="32" cy="32" r="30" fill="#1a1b1a" stroke="#d3af69" stroke-width="1.4"/><circle cx="32" cy="32" r="23" fill="#3a3d3b"/><path d="M27 12h10v15h15v10H37v15H27V37H12V27h15z" fill="#0d0e0d" stroke="#c7c2b2" stroke-width="1"/><path d="M29 18h6v11h11v6H35v11h-6V35H18v-6h11z" fill="#5a5d58"/></svg>`;
    }
    if (kind === 'tricolor') {
      return `<svg ${common}><circle cx="32" cy="32" r="30" fill="#0d1c27" stroke="#d3af69" stroke-width="1.4"/><clipPath id="tc"><circle cx="32" cy="32" r="23"/></clipPath><g clip-path="url(#tc)"><rect x="9" y="9" width="15.4" height="46" fill="#2f5f96"/><rect x="24.4" y="9" width="15.2" height="46" fill="#e9e2cf"/><rect x="39.6" y="9" width="15.4" height="46" fill="#a9443b"/></g><circle cx="32" cy="32" r="27" fill="none" stroke="#f2d99f" stroke-width=".7" opacity=".7"/></svg>`;
    }
    return `<svg ${common}><circle cx="32" cy="32" r="30" fill="#141a18" stroke="#d3af69" stroke-width="1.2"/><circle cx="32" cy="32" r="22" fill="#7d7a63"/><path d="M32 15v34M15 32h34" stroke="#e8dfc8" stroke-width="2" opacity=".65"/></svg>`;
  }

  function scenarioNow() {
    if (BH.state && BH.state.mode !== 'intro' && BH.state.scenario) return BH.state.scenario;
    return SCENARIOS[(BH.state && BH.state.previewScenarioId) || 'ww2'];
  }
  function regionName(id) {
    const sc = scenarioNow();
    return (sc.names && sc.names[id]) || (REG[id] && REG[id].name) || id;
  }
  function sideLabel(side) {
    const sc = scenarioNow();
    if (side === 'neutral') return 'Tarafsız';
    return (sc.sides[side] && sc.sides[side].name) || side;
  }
  function sideShort(side) {
    const sc = scenarioNow();
    if (side === 'neutral') return 'TARAFSIZ';
    return (sc.sides[side] && sc.sides[side].short) || side;
  }
  function otherSide(side) { return side === 'axis' ? 'allies' : 'axis'; }
  function isCapital(id) { return !!(scenarioNow().capitals && scenarioNow().capitals[id]); }
  function capitalName(id) { return (scenarioNow().capitals && scenarioNow().capitals[id]) || regionName(id); }
  function dateForTurn(start, turn, monthsPerTurn = 1) {
    const m0 = start.month + (turn - 1) * monthsPerTurn;
    return { year: start.year + Math.floor(m0 / 12), month: ((m0 % 12) + 12) % 12 };
  }
  function formatDate(d) { return `${MONTHS[d.month]} ${d.year}`; }

  BH.MAP = MAP;
  BH.REGIONS = REGIONS;
  BH.REG = REG;
  BH.NEI = NEI;
  BH.SEA = SEA;
  BH.isSea = isSea;
  BH.OWNER = OWNER;
  BH.TERRAIN = TERRAIN;
  BH.DIFF = DIFF;
  BH.SAVE_KEY = SAVE_KEY;
  BH.SOUND_KEY = SOUND_KEY;
  BH.MONTHS = MONTHS;
  BH.LABEL_OVERRIDES = LABEL_OVERRIDES;
  BH.SCENARIOS = SCENARIOS;
  BH.emblemSVG = emblemSVG;
  BH.scenarioNow = scenarioNow;
  BH.regionName = regionName;
  BH.sideLabel = sideLabel;
  BH.sideShort = sideShort;
  BH.otherSide = otherSide;
  BH.isCapital = isCapital;
  BH.capitalName = capitalName;
  BH.dateForTurn = dateForTurn;
  BH.formatDate = formatDate;
})();
