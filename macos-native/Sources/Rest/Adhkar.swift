import Foundation

struct Dhikr {
    let arabic: String
    let transliteration: String
    let translation: String
}

/// Short adhkar that fit comfortably in a 20-second break. Deliberately kept to
/// phrases you can say two or three times while your eyes are off the screen —
/// anything longer competes with the break instead of filling it.
enum Adhkar {
    static let all: [Dhikr] = [
        Dhikr(arabic: "سُبْحَانَ اللهِ وَبِحَمْدِهِ",
              transliteration: "Subḥān Allāhi wa biḥamdih",
              translation: "Glory be to Allah, and praise be to Him"),
        Dhikr(arabic: "أَسْتَغْفِرُ اللهَ",
              transliteration: "Astaghfirullāh",
              translation: "I seek forgiveness from Allah"),
        Dhikr(arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ",
              transliteration: "Lā ḥawla wa lā quwwata illā billāh",
              translation: "There is no might nor power except with Allah"),
        Dhikr(arabic: "الْحَمْدُ لِلَّهِ",
              transliteration: "Alḥamdu lillāh",
              translation: "All praise is due to Allah"),
        Dhikr(arabic: "سُبْحَانَ اللهِ الْعَظِيمِ",
              transliteration: "Subḥān Allāhi al-ʿAẓīm",
              translation: "Glory be to Allah, the Most Great"),
        Dhikr(arabic: "لَا إِلَٰهَ إِلَّا اللهُ",
              transliteration: "Lā ilāha illā Allāh",
              translation: "There is no god but Allah"),
        Dhikr(arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ",
              transliteration: "Allāhumma ṣalli ʿalā Muḥammad",
              translation: "O Allah, send blessings upon Muhammad"),
        Dhikr(arabic: "حَسْبِيَ اللهُ وَنِعْمَ الْوَكِيلُ",
              transliteration: "Ḥasbiya Allāhu wa niʿma al-wakīl",
              translation: "Allah is sufficient for me, and He is the best disposer of affairs"),
        Dhikr(arabic: "اللَّهُمَّ أَعِنِّي عَلَىٰ ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ",
              transliteration: "Allāhumma aʿinnī ʿalā dhikrika wa shukrika wa ḥusni ʿibādatik",
              translation: "O Allah, help me to remember You, thank You, and worship You well"),
    ]

    /// Advances one step through the list and returns the new entry. Rotating in
    /// order rather than at random means you actually cycle the whole set
    /// instead of seeing the same two phrases all morning.
    static func advance() -> Dhikr {
        let index = (Settings.dhikrIndex + 1) % all.count
        Settings.dhikrIndex = index
        return all[index]
    }

    static var current: Dhikr {
        all[min(max(Settings.dhikrIndex, 0), all.count - 1)]
    }
}
