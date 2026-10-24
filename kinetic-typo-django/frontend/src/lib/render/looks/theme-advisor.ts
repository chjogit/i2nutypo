import type { LookElementState, LanguageCode, LyricLine } from "@/types/project";
import { getLookPreset, type ThemedPresetId } from "./presets";

export interface ThemeRecommendation {
  /** Primary background theme (`lookPreset`). */
  lookPreset: ThemedPresetId;
  /** Up to two mixed themes (`mixLooks`) whose decor & overlay harmonize with the primary theme. */
  mixLooks: ThemedPresetId[];
  /** Optional dedicated lyric renderer theme (`lyricLook`), or null to use the background theme. */
  lyricLook: ThemedPresetId | null;
  /** Fine-tuned element overrides for this recipe. */
  lookElements?: Record<string, LookElementState>;
  /** Normalized confidence / match score (0..1). */
  confidence: number;
  /** Concise Korean explanation of why this theme & mix fits the song. */
  reason: string;
  /** Detected mood tags that triggered this recommendation. */
  tags: string[];
}

interface ThemeProfile {
  id: ThemedPresetId;
  /** Ideal BPM window [min, max, sweetSpot]. */
  bpmRange: [number, number, number];
  /** Ideal energy/intensity level (0 = quiet acoustic/ballad, 1 = high-octane rock/electronic). */
  energy: number;
  /** Multilingual keyword patterns weighted by relevance. */
  keywords: ReadonlyArray<{ pattern: RegExp; weight: number; tag: string }>;
  /** Curated mix recipes paired with this theme. */
  mixRecipes: ReadonlyArray<{
    mixLooks: ThemedPresetId[];
    lyricLook: ThemedPresetId | null;
    condition?: "high-energy" | "low-energy" | "japanese" | "default";
    note: string;
  }>;
  /** Bonus when lyrics contain vertical-friendly Japanese text. */
  japaneseAffinity?: number;
  /** Bonus when the song has many accented/impact words. */
  accentAffinity?: number;
}

const THEME_PROFILES: readonly ThemeProfile[] = [
  {
    id: "snow_night",
    bpmRange: [60, 118, 86],
    energy: 0.28,
    keywords: [
      {
        pattern:
          /눈|겨울|하얀|얼음|서리|추운|차가운|시린|입김|함박눈|첫눈|겨울밤|설원|창백|성탄|크리스마스|雪|冬|白い|氷|霜|寒い|冷たい|凍える|吐息|吹雪|粉雪|snow|winter|cold|frost|ice|frozen|freezing|white|chilly|december/gi,
        weight: 3.2,
        tag: "겨울·눈",
      },
      {
        pattern:
          /밤|달빛|고요|적막|조용히|혼자|외로|그리움|멀리|별|夜|月明かり|静か|孤独|寂しい|遠い|night|moonlight|silent|quiet|lonely/gi,
        weight: 1.4,
        tag: "고요한 밤",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["pastel_dream"],
        lyricLook: "snow_night",
        condition: "low-energy",
        note: "눈송이와 부드러운 보케 조화",
      },
      {
        mixLooks: ["eclipse_nebula"],
        lyricLook: "snow_night",
        condition: "default",
        note: "겨울밤 달빛과 별빛 강조",
      },
    ],
  },
  {
    id: "rain_window",
    bpmRange: [62, 115, 88],
    energy: 0.32,
    keywords: [
      {
        pattern:
          /비|빗물|빗방울|빗소리|우산|창문|창가|유리창|소나기|장마|젖은|흐린|안개|눈물|거리|골목|새벽|카세트|차창|雨|雨粒|雨音|傘|窓|ガラス|濡れた|曇り|霧|涙|街角|rain|rainy|raindrop|umbrella|window|glass|wet|storm|puddle|mist|tears/gi,
        weight: 3.2,
        tag: "비·창가",
      },
      {
        pattern:
          /기억|그리워|떠나|이별|혼자|잠들지|못하|외로|슬픔|한숨|커피|방안|記憶|恋しい|別れ|眠れない|ため息|lonely|miss|sleepless|goodbye|sigh/gi,
        weight: 1.4,
        tag: "새벽 감성",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["ballad_hud"],
        lyricLook: "rain_window",
        condition: "low-energy",
        note: "비 내리는 창가와 잔잔한 HUD",
      },
      {
        mixLooks: ["neon_sign"],
        lyricLook: "rain_window",
        condition: "default",
        note: "빗방울 너머 번지는 도시 네온",
      },
    ],
  },
  {
    id: "sakura_breeze",
    bpmRange: [75, 138, 106],
    energy: 0.45,
    japaneseAffinity: 0.8,
    keywords: [
      {
        pattern:
          /벚꽃|꽃|꽃잎|봄|봄날|봄바람|살랑|설렘|분홍|향기|피어나|흩날리|계절|졸업|입학|우연|고백|첫사랑|미소|햇살|桜|花|花びら|春|春風|咲く|舞う|散る|ピンク|香り|季節|卒業|初恋|笑顔|sakura|cherry|blossom|petal|spring|breeze|bloom|flower|pink|gentle|smile/gi,
        weight: 3.3,
        tag: "봄·벚꽃",
      },
      {
        pattern:
          /바람|하늘|구름|가볍게|걸어|너와|함께|손잡고|약속|風|空|歩く|約束|wind|walk|together|promise/gi,
        weight: 1.3,
        tag: "산뜻한 바람",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["pastel_dream"],
        lyricLook: "sakura_breeze",
        condition: "default",
        note: "흩날리는 꽃잎과 파스텔 빛망울",
      },
      {
        mixLooks: ["summer_film"],
        lyricLook: "sakura_breeze",
        condition: "high-energy",
        note: "봄 햇살 플레어와 벚꽃 바람",
      },
    ],
  },
  {
    id: "summer_film",
    bpmRange: [95, 165, 126],
    energy: 0.68,
    keywords: [
      {
        pattern:
          /여름|바다|파도|해변|푸른|하늘|구름|태양|햇살|청춘|소다|수평선|갈매기|필름|사진|폴라로이드|방학|불꽃놀이|달려|소나기|바람|夏|海|波|砂浜|青い|青空|雲|太陽|日差し|青春|ソーダ|水平線|写真|フィルム|花火|summer|sea|ocean|wave|beach|blue|sky|sun|sunlight|youth|film|photo|polaroid|horizon/gi,
        weight: 3.3,
        tag: "청량 여름·바다",
      },
      {
        pattern:
          /웃음|반짝|눈부신|기억|추억|달리|소리쳐|영원히|眩しい|輝く|走る|思い出|bright|shine|run|memories/gi,
        weight: 1.4,
        tag: "청춘·추억",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["pastel_dream"],
        lyricLook: "summer_film",
        condition: "low-energy",
        note: "아련한 여름 추억 폴라로이드",
      },
      {
        mixLooks: ["pop_cutout"],
        lyricLook: "summer_film",
        condition: "default",
        note: "청량한 햇살 플레어와 경쾌한 컷",
      },
    ],
  },
  {
    id: "deep_sea",
    bpmRange: [65, 125, 92],
    energy: 0.38,
    keywords: [
      {
        pattern:
          /심해|물속|바닷속|깊은|가라앉|잠기|거품|물결|수면|고래|파랑|푸른빛|산호|헤엄|숨쉬|호흡|익사|파도|바다|深海|水中|深い|沈む|溺れる|泡|水面|鯨|蒼い|泳ぐ|呼吸|deep|underwater|sink|sinking|drown|bubble|whale|abyss|depth|submerge|aqua|ocean/gi,
        weight: 3.3,
        tag: "심해·물속",
      },
      {
        pattern: /숨|안개|아득한|어둠|조용히|흔들리|꿈속|꿈결|息|揺れる|夢|breathe|sway|float|drifting/gi,
        weight: 1.5,
        tag: "몽환·유영",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["eclipse_nebula"],
        lyricLook: "deep_sea",
        condition: "default",
        note: "심해 물빛과 신비로운 성운 광채",
      },
      {
        mixLooks: ["rain_window"],
        lyricLook: "deep_sea",
        condition: "low-energy",
        note: "깊은 물결과 촉촉한 물방울 질감",
      },
    ],
  },
  {
    id: "eclipse_nebula",
    bpmRange: [70, 145, 108],
    energy: 0.55,
    keywords: [
      {
        pattern:
          /우주|은하|성운|별|별빛|유성|혜성|궤도|중력|일식|월식|달|행성|무한|영원|밤하늘|운명|시공간|차원|빛|어둠|宇宙|銀河|星雲|星|星空|流星|彗星|軌道|重力|日食|月食|月|惑星|永遠|夜空|運命|universe|galaxy|nebula|star|starlight|eclipse|cosmos|cosmic|orbit|gravity|moon|infinity|destiny|eternity/gi,
        weight: 3.3,
        tag: "우주·별빛",
      },
      {
        pattern: /신비|환상|너머|멀리|빛나는|사라지|기도|소원|輝く|祈り|願い|shine|wish|beyond|mystery/gi,
        weight: 1.4,
        tag: "신비·성운",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["cinematic_fantasy"],
        lyricLook: "eclipse_nebula",
        condition: "default",
        note: "이클립스 링과 시네마틱 금빛 플레어",
      },
      {
        mixLooks: ["tint_panels"],
        lyricLook: "eclipse_nebula",
        condition: "high-energy",
        note: "성운 안개와 반짝이는 빛줄기",
      },
    ],
  },
  {
    id: "cinematic_fantasy",
    bpmRange: [68, 136, 98],
    energy: 0.52,
    japaneseAffinity: 1.0,
    keywords: [
      {
        pattern:
          /판타지|신화|전설|전설의|왕국|성|기사|검|마법|기적|운명|기도|등불|황금|금빛|태양|날개|천사|신|영웅|모험|여정|역사|서사|전쟁|약속|神話|伝説|魔法|奇跡|運命|祈り|灯籠|黄金|翼|天使|神|英雄|物語|旅|誓い|fantasy|myth|legend|magic|miracle|destiny|lantern|golden|wings|angel|hero|epic|journey|kingdom/gi,
        weight: 3.2,
        tag: "판타지·서사",
      },
      {
        pattern: /영원|하늘|대지|타오르|불꽃|맹세|기억|시간|永遠|大地|炎|oath|flame|ancient|sacred/gi,
        weight: 1.5,
        tag: "시네마틱",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["eclipse_nebula"],
        lyricLook: "cinematic_fantasy",
        condition: "default",
        note: "레터박스 서사와 성운 별빛 조화",
      },
      {
        mixLooks: ["crimson_ink"],
        lyricLook: "cinematic_fantasy",
        condition: "japanese",
        note: "동양 판타지 등불과 불티 연출",
      },
    ],
  },
  {
    id: "crimson_ink",
    bpmRange: [80, 160, 118],
    energy: 0.65,
    japaneseAffinity: 1.2,
    keywords: [
      {
        pattern:
          /붉은|적색|홍연|먹|붓|동양|달|밤|불꽃|불티|타오르|재|칼|검|피|운명|인연|화연|낙화|귀신|요괴|신사|여우|춤|제사|사슬|홍련|紅|赤|朱|墨|筆|炎|火|火花|灰|刀|剣|血|運命|縁|鬼|狐|神社|舞|宵|鎖|crimson|red|ink|brush|flame|ember|ash|blade|sword|blood|fate|lantern|oriental|shrine/gi,
        weight: 3.3,
        tag: "붉은 먹·동양풍",
      },
      {
        pattern: /고독|어둠|차가운|조여|슬픔|원망|영혼|그림자|孤独|闇|魂|影|shadow|soul|chains|burn/gi,
        weight: 1.4,
        tag: "강렬한 동양풍",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["cinematic_fantasy"],
        lyricLook: "crimson_ink",
        condition: "default",
        note: "먹 붓질·낙관과 떠오르는 등불",
      },
      {
        mixLooks: ["dark_glitch"],
        lyricLook: "crimson_ink",
        condition: "high-energy",
        note: "붉은 먹과 강렬한 다크 글리치",
      },
    ],
  },
  {
    id: "dark_glitch",
    bpmRange: [105, 190, 140],
    energy: 0.85,
    accentAffinity: 1.2,
    keywords: [
      {
        pattern:
          /어둠|글리치|에러|오류|부서|깨진|조각|파괴|미쳐|광기|비명|사슬|목걸이|조여|숨이|고통|상처|악몽|거짓|배신|그림자|중독|독|혼란|방황|블랙|검은|闇|エラー|バグ|壊れ|砕け|狂う|叫び|鎖|首輪|苦しい|傷|悪夢|嘘|裏切り|毒|黒|dark|glitch|error|broken|shatter|chains|choke|nightmare|pain|lie|shadow|toxic|madness|chaos|black/gi,
        weight: 3.3,
        tag: "다크·글리치",
      },
      {
        pattern: /싫어|못하|떠나|끝|사라져|무너|추락|절망|嫌い|消えろ|崩れ|堕ちる|fall|crash|hate|lost/gi,
        weight: 1.5,
        tag: "강렬·다크",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["digital_crt"],
        lyricLook: "dark_glitch",
        condition: "default",
        note: "RGB 분리 글리치와 CRT 스캔라인",
      },
      {
        mixLooks: ["mono_accent"],
        lyricLook: "dark_glitch",
        condition: "high-energy",
        note: "흑백 대비 속 포인트 컬러와 글리치",
      },
    ],
  },
  {
    id: "digital_crt",
    bpmRange: [105, 185, 135],
    energy: 0.78,
    keywords: [
      {
        pattern:
          /디지털|사이버|컴퓨터|화면|모니터|픽셀|게임|네트워크|인터넷|데이터|코드|시스템|가상|미래|기계|로봇|신호|전파|로그인|프로그램|전자|도쿄|도시|デジタル|サイバー|画面|ピクセル|ゲーム|ネット|データ|コード|システム|仮想|未来|機械|ロボット|電波|電子|digital|cyber|pixel|screen|monitor|crt|system|code|data|virtual|arcade|matrix|futuristic|tech|glitch/gi,
        weight: 3.4,
        tag: "디지털·CRT",
      },
      {
        pattern:
          /네온|불빛|밤거리|연결|메시지|알림|기억|목소리|ネオン|都市|メッセージ|声|neon|city|signal|connect/gi,
        weight: 1.5,
        tag: "사이버·레트로",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["neon_sign"],
        lyricLook: "digital_crt",
        condition: "default",
        note: "CRT 모니터 프레임과 네온 테두리",
      },
      {
        mixLooks: ["dark_glitch"],
        lyricLook: "digital_crt",
        condition: "high-energy",
        note: "픽셀 시티와 RGB 글리치 이펙트",
      },
    ],
  },
  {
    id: "neon_sign",
    bpmRange: [92, 155, 118],
    energy: 0.7,
    keywords: [
      {
        pattern:
          /네온|밤거리|도시|불빛|가로등|간판|클럽|댄스|파티|오늘밤|투나잇|굿나잇|칵테일|드라이브|고속도로|자정|신주쿠|시부야|서울|홍대|불야성|ネオン|夜の街|都会|街灯|看板|クラブ|ダンス|パーティー|今夜|ドライブ|真夜中|neon|city|street|lights|club|dance|party|tonight|goodnight|midnight|drive|downtown|glow|boulevard/gi,
        weight: 3.3,
        tag: "시티팝·네온",
      },
      {
        pattern:
          /밤|술|취해|리듬|비트|흔들|반짝|외로웠지만|버텼던|夜|リズム|ビート|rhythm|beat|lonely|shining/gi,
        weight: 1.5,
        tag: "도시의 밤",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["tint_panels"],
        lyricLook: "neon_sign",
        condition: "default",
        note: "네온 사인 글로우와 빛줄기·반짝이",
      },
      {
        mixLooks: ["rain_window"],
        lyricLook: "neon_sign",
        condition: "low-energy",
        note: "네온 불빛이 번지는 밤의 빗방울",
      },
    ],
  },
  {
    id: "pop_cutout",
    bpmRange: [110, 185, 138],
    energy: 0.78,
    accentAffinity: 1.0,
    keywords: [
      {
        pattern:
          /팝|통통|귀여|달콤|캔디|초콜릿|쿠키|딸기|레몬|소다|파티|점프|신나|해피|웃어|장난|마법소녀|아이돌|하트|두근|반짝|좋아해|사랑해|최고|ポップ|かわいい|可愛い|甘い|キャンディ|チョコ|パーティー|ジャンプ|ハッピー|笑顔|アイドル|ドキドキ|大好き|pop|cute|sweet|candy|sugar|jump|happy|fun|party|bounce|idol|smile|yay|bubblegum/gi,
        weight: 3.3,
        tag: "발랄·팝 컷아웃",
      },
      {
        pattern: /노래|춤|함께|오늘|기분|하늘|내일|달려|歌|ダンス|今日|気分|sing|dance|today|feeling/gi,
        weight: 1.4,
        tag: "경쾌한 리듬",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["flat_type"],
        lyricLook: "pop_cutout",
        condition: "high-energy",
        note: "팝 컷아웃 블록과 동그라미 스티커",
      },
      {
        mixLooks: ["pastel_dream"],
        lyricLook: "pop_cutout",
        condition: "default",
        note: "통통 튀는 가사와 귀여운 하트 보케",
      },
    ],
  },
  {
    id: "flat_type",
    bpmRange: [115, 195, 145],
    energy: 0.88,
    accentAffinity: 1.4,
    keywords: [
      {
        pattern:
          /터져|폭발|소리쳐|외쳐|달려|질주|멈추지|부숴|깨뜨려|강렬|불타|에너지|파워|쇼크|임팩트|스피드|락|밴드|비트|드럼|베이스|혁명|자유|전부|爆発|叫べ|走れ|止まらない|壊せ|燃えろ|エネルギー|パワー|衝撃|スピード|ロック|革命|explode|shout|scream|run|unstoppable|break|smash|power|impact|energy|rock|punk|riot|boom|slam/gi,
        weight: 3.3,
        tag: "모션 타이포·임팩트",
      },
      {
        pattern: /지금|바로|여기서|일어나|던져|날아|끝까지|今|ここで|立ち上がれ|now|right|stand|fly/gi,
        weight: 1.4,
        tag: "고에너지",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["pop_cutout"],
        lyricLook: "flat_type",
        condition: "default",
        note: "플랫 대형 타이포와 망점·손그림 테두리",
      },
      {
        mixLooks: ["manga_panel"],
        lyricLook: "flat_type",
        condition: "high-energy",
        note: "대형 타이포와 강렬한 만화 집중선",
      },
    ],
  },
  {
    id: "manga_panel",
    bpmRange: [115, 195, 148],
    energy: 0.84,
    japaneseAffinity: 0.9,
    accentAffinity: 1.2,
    keywords: [
      {
        pattern:
          /만화|코믹|대결|승부|배틀|히어로|주인공|빌런|필살|일격|운명|반전|드라마|스토리|페이지|대사|외침|폭풍|번개|돌파|한계|초월|세상|소년|소녀|漫画|コミック|勝負|バトル|ヒーロー|主人公|必殺|一撃|ドラマ|ページ|セリフ|嵐|稲妻|突破|限界|少年|少女|manga|comic|battle|hero|villain|fight|strike|drama|page|storm|lightning|limit|action/gi,
        weight: 3.3,
        tag: "만화 컷·집중선",
      },
      {
        pattern: /절대|포기|못해|달려|심장|고동|뜨거운|絶対|諦めない|心臓|鼓動|熱い|never|give|up|heart/gi,
        weight: 1.5,
        tag: "소년만화 열혈",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["pop_cutout"],
        lyricLook: "manga_panel",
        condition: "default",
        note: "만화 컷 분할·집중선과 팝 망점",
      },
      {
        mixLooks: ["mono_accent"],
        lyricLook: "manga_panel",
        condition: "high-energy",
        note: "흑백 만화 지면 위 강렬한 포인트 컬러",
      },
    ],
  },
  {
    id: "mono_accent",
    bpmRange: [90, 165, 122],
    energy: 0.72,
    accentAffinity: 1.1,
    keywords: [
      {
        pattern:
          /흑백|모노|회색|잿빛|빨간|붉은|단하나|유일한|시선|차갑게|도시|고독|스타일|시크|그림자|대비|거짓말|진실|경계|선명한|립스틱|장미|피|モノクロ|白黒|灰色|赤い|唯一|視線|都会|孤独|影|嘘|真実|境界|鮮やか|薔薇|mono|monochrome|grayscale|grey|gray|red|contrast|sharp|minimal|urban|truth|lie|rose|line/gi,
        weight: 3.2,
        tag: "모노·포인트 컬러",
      },
      {
        pattern: /바라만|봐도|차라리|대신에|돌아가|심장|눈빛|見つめる|戻る|眼差し|stare|return|eyes|alone/gi,
        weight: 1.4,
        tag: "세련된 대비",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["dark_glitch"],
        lyricLook: "mono_accent",
        condition: "high-energy",
        note: "모노 라벨 가사와 다크 글리치 효과",
      },
      {
        mixLooks: ["tint_panels"],
        lyricLook: "mono_accent",
        condition: "default",
        note: "흑백 포인트 컬러와 세련된 비네팅",
      },
    ],
  },
  {
    id: "pastel_dream",
    bpmRange: [65, 128, 94],
    energy: 0.36,
    keywords: [
      {
        pattern:
          /꿈|꿈결|잠|자장가|구름|솜사탕|부드러운|포근한|따스한|파스텔|무지개|별똥별|요정|천사|하트|사랑|설렘|달콤한|기억|보케|안개|환상|소원|몽환|夢|眠り|子守唄|雲|ふわふわ|優しい|暖かい|パステル|虹|流れ星|妖精|ハート|愛|恋|甘い|幻想|dream|dreamy|sleep|lullaby|cloud|soft|warm|pastel|rainbow|fairy|heart|love|sweet|pillow|wish/gi,
        weight: 3.3,
        tag: "파스텔·꿈결",
      },
      {
        pattern: /안아|품에|미소|조용히|날아|하늘|별|抱きしめ|微笑み|飛ぶ|hug|embrace|float|gentle/gi,
        weight: 1.4,
        tag: "포근한 감성",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["sakura_breeze"],
        lyricLook: "pastel_dream",
        condition: "default",
        note: "파스텔 꿈결 보케와 봄바람 꽃잎",
      },
      {
        mixLooks: ["ballad_hud"],
        lyricLook: "pastel_dream",
        condition: "low-energy",
        note: "부드러운 꿈결 번짐과 감성 HUD",
      },
    ],
  },
  {
    id: "ballad_hud",
    bpmRange: [58, 108, 78],
    energy: 0.25,
    keywords: [
      {
        pattern:
          /발라드|이별|안녕|그리움|그리워|보고싶|눈물|울어|아파|가슴|기억|추억|시간|계절|혼자|외로|빈자리|편지|목소리|약속|미안|고마워|사랑했|잊지|못해|別れ|さよなら|恋しい|会いたい|涙|泣く|痛い|胸|記憶|思い出|時間|一人|孤独|手紙|声|約束|ごめん|ありがとう|ballad|goodbye|farewell|miss|missing|tears|cry|ache|memory|memories|letter|voice|sorry|lonely|without/gi,
        weight: 3.2,
        tag: "감성 발라드·HUD",
      },
      {
        pattern:
          /밤|잠에|들지|버텼던|돌아가고파|그때로|그대로|夜|眠り|あの頃|戻りたい|tonight|want|you|back/gi,
        weight: 1.6,
        tag: "서정적 아련함",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["vintage_paper"],
        lyricLook: "ballad_hud",
        condition: "low-energy",
        note: "4:3 감성 HUD와 아날로그 필름 스크래치",
      },
      {
        mixLooks: ["pastel_dream"],
        lyricLook: "ballad_hud",
        condition: "default",
        note: "하얗게 번진 빛과 부드러운 보케",
      },
    ],
  },
  {
    id: "vintage_paper",
    bpmRange: [60, 118, 84],
    energy: 0.3,
    keywords: [
      {
        pattern:
          /빈티지|오래된|낡은|종이|편지|일기|일기장|책|페이지|시계|태엽|세피아|추억|옛날|그때|기억|역사|필름|사진첩|레코드|가을|낙엽|기차|역|노을|커피|우체통|古い|紙|手紙|日記|本|ページ|時計|セピア|思い出|昔|あの頃|フィルム|アルバム|秋|落ち葉|列車|夕暮れ|vintage|old|paper|letter|diary|book|page|clock|sepia|nostalgia|autumn|sunset|train|retro|antique/gi,
        weight: 3.3,
        tag: "빈티지·오래된 편지",
      },
      {
        pattern:
          /바랜|색바랜|지나간|계절|거리|바람|목소리|色褪せた|過ぎ去った|季節|faded|past|season|whisper/gi,
        weight: 1.4,
        tag: "레트로 세피아",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["ballad_hud"],
        lyricLook: "vintage_paper",
        condition: "default",
        note: "낡은 종이 액자와 필름 먼지 입자",
      },
      {
        mixLooks: ["cinematic_fantasy"],
        lyricLook: "vintage_paper",
        condition: "japanese",
        note: "고전적인 종이 질감과 금빛 광채",
      },
    ],
  },
  {
    id: "tint_panels",
    bpmRange: [88, 155, 116],
    energy: 0.62,
    keywords: [
      {
        pattern:
          /빛줄기|조각|유리|크리스탈|보석|프리즘|보라|바이올렛|환상|무대|스포트라이트|반짝|찬란한|투명한|거울|비친|만화경|밤하늘|오로라|신비|울림|공명|光|欠片|ガラス|クリスタル|宝石|プリズム|紫|ステージ|スポットライト|煌めく|透明|鏡|万華鏡|オーロラ|共鳴|shard|panel|crystal|prism|violet|purple|spotlight|stage|sparkle|mirror|kaleidoscope|aurora|glow/gi,
        weight: 3.2,
        tag: "틴트 조각·빛줄기",
      },
      {
        pattern: /밤|멀리서|바라만|웃고|빛나|목소리|노래|夜|遠くから|笑って|輝く|shine|voice|night|light/gi,
        weight: 1.5,
        tag: "일러스트 MV 정석",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["eclipse_nebula"],
        lyricLook: "tint_panels",
        condition: "default",
        note: "조각 패널·빛줄기와 우주 플레어",
      },
      {
        mixLooks: ["neon_sign"],
        lyricLook: "tint_panels",
        condition: "high-energy",
        note: "보랏빛 색조 워시와 네온 테두리",
      },
    ],
  },
  {
    id: "album_jacket",
    bpmRange: [70, 150, 102],
    energy: 0.5,
    keywords: [
      {
        pattern:
          /앨범|레코드|바이닐|턴테이블|노래|음악|멜로디|트랙|라디오|이어폰|헤드폰|플레이리스트|스튜디오|마이크|보컬|리듬|코드|기타|피아노|듣고|들려|불러|アルバム|レコード|歌|音楽|メロディ|トラック|ラジオ|イヤホン|ヘッドホン|プレイリスト|ボーカル|リズム|ギター|ピアノ|album|vinyl|record|turntable|song|music|melody|track|radio|playlist|vocal|guitar|piano|listen/gi,
        weight: 3.1,
        tag: "앨범 자켓·레코드",
      },
      {
        pattern: /밤|너의|이름|다시|돌아와|기억|우리|시간|夜|名前|もう一度|remember|tonight|together/gi,
        weight: 1.2,
        tag: "뮤직 플레이어",
      },
    ],
    mixRecipes: [
      {
        mixLooks: ["tint_panels"],
        lyricLook: "album_jacket",
        condition: "default",
        note: "도는 바이닐 레코드와 은은한 반짝이·빛줄기",
      },
      {
        mixLooks: ["pastel_dream"],
        lyricLook: "album_jacket",
        condition: "low-energy",
        note: "앨범 자켓과 부드러운 보케 빛망울",
      },
    ],
  },
];

export interface SongFeatures {
  lines: readonly LyricLine[];
  bpm: number;
  language?: LanguageCode;
  /** Optional average audio energy (0..1) if analyzed. */
  audioEnergy?: number;
}

/**
 * Analyzes the song's lyrics (main text, pronunciation, and translation),
 * pacing (line density, word rate, BPM), and accent density to score and rank
 * all 20 themes, returning the top recommendations with ready-to-apply mix
 * combinations and element settings.
 */
/**
 * Themes ranked for a song by its lyric words, tempo and language. `only`
 * limits the candidates, e.g. to the three themes the beginner page offers.
 */
export function recommendThemes(
  features: SongFeatures,
  topK = 4,
  only?: readonly ThemedPresetId[],
): ThemeRecommendation[] {
  const { lines, bpm } = features;
  const fullText = lines.map((l) => `${l.cleanText} ${l.pronText} ${l.transText}`).join("\n");

  const hasJa = /[\u3040-\u30FF\u4E00-\u9FAF]/.test(fullText);
  const totalWords = Math.max(
    1,
    lines.reduce((acc, l) => acc + l.words.length, 0),
  );
  const accentWords = lines.reduce((acc, l) => acc + l.words.filter((w) => w.isAccent).length, 0);
  const accentRatio = accentWords / totalWords;

  // Estimate song pace from lyric timing when available, blended with BPM
  let avgWordsPerSec = 2.2;
  if (lines.length >= 2) {
    const span = Math.max(4, lines[lines.length - 1].endTime - lines[0].startTime);
    avgWordsPerSec = totalWords / span;
  }
  const bpmNorm = Math.min(1, Math.max(0, (bpm - 65) / 105));
  const paceNorm = Math.min(1, Math.max(0, (avgWordsPerSec - 1.2) / 3.2));
  const estimatedEnergy =
    features.audioEnergy !== undefined
      ? features.audioEnergy * 0.5 + bpmNorm * 0.3 + paceNorm * 0.2
      : bpmNorm * 0.45 + paceNorm * 0.35 + Math.min(1, accentRatio * 2.2) * 0.2;

  const profiles = only ? THEME_PROFILES.filter((p) => only.includes(p.id)) : THEME_PROFILES;
  const scored = profiles.map((profile) => {
    let keywordScore = 0;
    const matchedTags: string[] = [];

    for (const kw of profile.keywords) {
      const matches = fullText.match(kw.pattern);
      if (matches && matches.length > 0) {
        // Diminishing returns so a single repeated word doesn't overwhelm everything
        const countFactor = Math.min(3.2, 1 + Math.log2(matches.length) * 0.65);
        keywordScore += kw.weight * countFactor;
        if (!matchedTags.includes(kw.tag)) matchedTags.push(kw.tag);
      }
    }

    // BPM Gaussian affinity
    const [minBpm, maxBpm, sweetBpm] = profile.bpmRange;
    const bpmDist = Math.abs(bpm - sweetBpm);
    const bpmSpan = Math.max(20, (maxBpm - minBpm) * 0.65);
    const bpmScore = Math.exp(-(bpmDist * bpmDist) / (2 * bpmSpan * bpmSpan)) * 2.2;

    // Energy affinity
    const energyDiff = Math.abs(estimatedEnergy - profile.energy);
    const energyScore = Math.max(0, 1 - energyDiff * 1.4) * 1.8;

    // Script & accent affinities
    const jaScore = hasJa && profile.japaneseAffinity ? profile.japaneseAffinity : 0;
    const accScore = profile.accentAffinity ? Math.min(1.5, accentRatio * 3.5) * profile.accentAffinity : 0;

    const rawTotal = keywordScore + bpmScore + energyScore + jaScore + accScore;

    // Pick best mix recipe for current condition
    const condition =
      hasJa && profile.mixRecipes.some((r) => r.condition === "japanese")
        ? "japanese"
        : estimatedEnergy >= 0.62 && profile.mixRecipes.some((r) => r.condition === "high-energy")
          ? "high-energy"
          : estimatedEnergy <= 0.4 && profile.mixRecipes.some((r) => r.condition === "low-energy")
            ? "low-energy"
            : "default";

    const recipe =
      profile.mixRecipes.find((r) => r.condition === condition) ??
      profile.mixRecipes.find((r) => r.condition === "default") ??
      profile.mixRecipes[0];

    const presetMeta = getLookPreset(profile.id);
    const tagSummary = matchedTags.length > 0 ? matchedTags.slice(0, 2).join(" · ") : `${bpm}BPM 템포`;
    const reason = `${tagSummary} 분위기에 어울리는 「${presetMeta.label}」 중심 조합 (${recipe.note})`;

    return {
      profile,
      rawTotal,
      matchedTags: matchedTags.length > 0 ? matchedTags : [`${bpm}BPM 맞춤`],
      recipe,
      reason,
    };
  });

  scored.sort((a, b) => b.rawTotal - a.rawTotal);
  const topRaw = Math.max(1, scored[0]?.rawTotal ?? 1);

  return scored.slice(0, topK).map((item, idx) => {
    // Normalize confidence into a meaningful 0.65..0.98 range
    const ratio = item.rawTotal / topRaw;
    const confidence = Number(Math.min(0.98, Math.max(0.62, 0.58 + ratio * 0.38 - idx * 0.02)).toFixed(2));
    return {
      lookPreset: item.profile.id,
      mixLooks: item.recipe.mixLooks,
      lyricLook: item.recipe.lyricLook,
      confidence,
      reason: item.reason,
      tags: item.matchedTags,
    };
  });
}
