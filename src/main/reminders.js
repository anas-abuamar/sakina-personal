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

const BUILT_IN = { adhkar: ADHKAR };

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

module.exports = { BUILT_IN, active, advance, peek, ADHKAR };
