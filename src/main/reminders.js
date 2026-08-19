'use strict';
const store = require('./store');

// Every phrase is normalised to the same shape so the break screen never has
// to care which pack it came from:
//   primary   the line you read (Arabic, a quote, your own text)
//   secondary transliteration, or the person being quoted
//   meaning   translation, or the work it comes from
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

// Sources are recorded rather than implied. Where a line is traditionally
// attributed but has no verifiable source in the named author's work, it says
// so — putting words in a real person's mouth is not a rounding error.
const QUOTES = [
  ['It is not that we have a short time to live, but that we waste a lot of it.',
   'Seneca', 'On the Shortness of Life I.3 (trans. Costa)'],
  ['Rest is not idleness, and to lie sometimes on the grass under the trees on a summer’s day, listening to the murmur of water, or watching the clouds float across the blue sky, is by no means waste of time.',
   'John Lubbock', 'The Use of Life, 1894, ch. IV'],
  ['Almost everything will work again if you unplug it for a few minutes, including you.',
   'Anne Lamott', 'From a 2015 social media post; no published source'],
  ['Every now and then go away and have a little relaxation. When you come back to your work your judgement will be surer.',
   'Leonardo da Vinci', 'Paraphrased from the Notebooks §530'],
  ['Great things are not done by impulse, but by a series of small things brought together.',
   'Vincent van Gogh', 'Letter to Theo van Gogh, 1882'],
  ['You could leave life right now. Let that determine what you do and say and think.',
   'Marcus Aurelius', 'Meditations, Book 2 (trans. Hays)'],
  ['Take rest; a field that has rested gives a bountiful crop.',
   'Ovid', 'Traditionally attributed'],
  ['Nature does not hurry, yet everything is accomplished.',
   'Lao Tzu', 'Traditionally attributed; not found in the Tao Te Ching'],
].map(([primary, secondary, meaning], i) => ({
  id: `quote-${i}`, pack: 'quotes', primary, secondary, meaning, rtl: false,
}));

const BUILT_IN = { adhkar: ADHKAR, quotes: QUOTES };

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
  if (s.packs.quotes) pool.push(...QUOTES);
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

module.exports = { BUILT_IN, active, advance, peek, ADHKAR, QUOTES };
