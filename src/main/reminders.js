'use strict';
const store = require('./store');

// Every phrase is normalised to the same shape so the break screen never has
// to care which pack it came from:
//   primary   the line you read (Arabic, or your own text)
//   secondary transliteration, or whatever sits under the main line
//   meaning   translation, or a longer note
//   rtl       lay the primary line out right-to-left

const ADHKAR = [
  ['سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', 'Subḥān Allāhi wa biḥamdih', 'Glory be to Allah, and praise be to Him'],
  ['أَسْتَغْفِرُ اللَّهَ', 'Astaghfirullāh', 'I seek forgiveness from Allah'],
  ['لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', 'Lā ḥawla wa lā quwwata illā billāh', 'There is no might nor power except with Allah'],
  ['الْحَمْدُ لِلَّهِ', 'Alḥamdu lillāh', 'All praise is due to Allah'],
  ['سُبْحَانَ اللَّهِ الْعَظِيمِ', 'Subḥān Allāhi al-ʿAẓīm', 'Glory be to Allah, the Most Great'],
  ['لَا إِلَٰهَ إِلَّا اللَّهُ', 'Lā ilāha illā Allāh', 'There is no god but Allah'],
  ['اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ', 'Allāhumma ṣalli ʿalā Muḥammad', 'O Allah, send blessings upon Muhammad'],
  ['حَسْبِيَ اللَّهُ وَنِعْمَ الْوَكِيلُ', 'Ḥasbiya Allāhu wa niʿma al-wakīl', 'Allah is sufficient for me, and He is the best disposer of affairs'],
  ['اللَّهُمَّ أَعِنِّي عَلَىٰ ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ', 'Allāhumma aʿinnī ʿalā dhikrika wa shukrika wa ḥusni ʿibādatik', 'O Allah, help me to remember You, thank You, and worship You well'],
].map(([primary, secondary, meaning], i) => ({
  id: `adhkar-${i}`, pack: 'adhkar', primary, secondary, meaning, rtl: true,
}));


// Verified line by line against sunnah.com and quran.com: wording, collection
// number, and grading each checked before anything went in here. Deliberately
// left OUT, having been checked and failed:
//
//   "اعمل لدنياك كأنك تعيش أبدا..."  Not a hadith. Al-Albani: la asla lahu
//       marfu'an — no basis as a report from the Prophet. It circulates as a
//       saying of Abdullah ibn Amr. It is also about dunya versus akhira, so on
//       a break screen it would read as "work harder" — the opposite of this.
//   "خير الأمور أوسطها"  Not established in the six books; authentic only as a
//       mawquf saying of Mutarrif ibn Abdullah and Abu Qilaba.
//   Qur'an 20:2  Genuine, but it is addressed to the Prophet about revelation,
//       and it ends mid-clause — the thought completes in 20:3. Quoted alone on
//       a screen it becomes generic reassurance the ayah does not offer.
//   Qur'an 9:40  The sakina verse. Tempting, given the app's name, but it is
//       about the cave and the Prophet's companion, not about rest.
const SUNNAH = [
  ['فَإِنَّ لِجَسَدِكَ عَلَيْكَ حَقًّا',
   'Fa-inna li-jasadika ʿalayka ḥaqqan',
   'Your body has a right over you. · Sahih al-Bukhari 1975'],
  ['إِنَّ الدِّينَ يُسْرٌ',
   'Inna al-dīna yusrun',
   'Religion is easy. · Sahih al-Bukhari 39'],
  ['وَأَنَّ أَحَبَّ الأَعْمَالِ أَدْوَمُهَا إِلَى اللَّهِ، وَإِنْ قَلَّ',
   'Wa-anna aḥabba al-aʿmāli adwamuhā ilā Allāhi, wa-in qall',
   'The most beloved deed to Allah is the most constant, even if little. · Sahih al-Bukhari 6464'],
  ['وَجَعَلْنَا نَوْمَكُمْ سُبَاتًا',
   'Wa-jaʿalnā nawmakum subātā',
   'And made your sleep a means for rest. · Qur’an 78:9 (Saheeh International)'],
  ['وَهُوَ ٱلَّذِى جَعَلَ لَكُمُ ٱلَّيْلَ لِبَاسًا وَٱلنَّوْمَ سُبَاتًا',
   'Wa-huwa alladhī jaʿala lakumu al-layla libāsan wa-al-nawma subātā',
   'And it is He who has made the night for you as clothing, and sleep a means for rest. · Qur’an 25:47 (Saheeh International)'],
  ['وَمِن رَّحْمَتِهِۦ جَعَلَ لَكُمُ ٱلَّيْلَ وَٱلنَّهَارَ لِتَسْكُنُوا۟ فِيهِ',
   'Wa-min raḥmatihi jaʿala lakumu al-layla wa-al-nahāra li-taskunū fīhi',
   'In His mercy He has given you night and day, so that you may rest. · Qur’an 28:73 (Abdel Haleem)'],
].map(([primary, secondary, meaning], i) => ({
  id: `sunnah-${i}`, pack: 'sunnah', primary, secondary, meaning, rtl: true,
}));

const BUILT_IN = { adhkar: ADHKAR, sunnah: SUNNAH };

function custom() {
  return store.load().customPhrases.map((p, i) => ({
    id: p.id || `custom-${i}`,
    pack: 'custom',
    primary: p.primary || '',
    secondary: p.secondary || '',
    meaning: p.meaning || '',
    rtl: !!p.rtl,
  })).filter((p) => p.primary.trim());
}

/** Everything currently switched on, in a stable order. */
function active() {
  const s = store.load();
  const pool = [];
  if (s.packs.adhkar) pool.push(...ADHKAR);
  if (s.packs.sunnah) pool.push(...SUNNAH);
  if (s.packs.custom) pool.push(...custom());
  return pool;
}

/** Step one forward through the pool and remember where we got to. Rotating in
 *  order rather than at random means the whole set actually gets seen instead
 *  of the same two phrases all morning. */
function advance() {
  const pool = active();
  if (!pool.length) return null;
  const cursor = (store.load().cursor + 1) % pool.length;
  store.save({ cursor });
  return pool[cursor];
}

function peek() {
  const pool = active();
  if (!pool.length) return null;
  return pool[(store.load().cursor + 1) % pool.length];
}

module.exports = { BUILT_IN, active, advance, peek, ADHKAR, SUNNAH };
