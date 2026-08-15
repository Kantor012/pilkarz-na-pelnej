"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Position = "Napastnik" | "Pomocnik" | "Obrońca" | "Bramkarz";
type AttrKey =
  | "technika"
  | "strzal"
  | "podania"
  | "drybling"
  | "odbior"
  | "szybkosc"
  | "sila"
  | "kondycja"
  | "refleks";
type Attributes = Record<AttrKey, number>;
type GameKind = "timing" | "choice" | "sequence" | "reaction";

type Player = {
  name: string;
  position: Position;
  foot: "Prawa" | "Lewa";
  number: number;
  club: string;
  potential: number;
  attrs: Attributes;
};

type Career = {
  player: Player;
  season: number;
  week: number;
  matchIndex: number;
  energy: number;
  morale: number;
  professionalism: number;
  media: number;
  money: number;
  trainingDone: boolean;
  decisions: number[];
  totals: { matches: number; goals: number; assists: number; saves: number; rating: number };
};

type Outcome = {
  us?: number;
  them?: number;
  goal?: number;
  assist?: number;
  save?: number;
  tackle?: number;
  text: string;
};

type MatchAction = {
  id: number;
  minute: number;
  title: string;
  flavor: string;
  stake: string;
  kind: GameKind;
  skill: AttrKey;
  success: Outcome;
  fail: Outcome;
};

type MatchState = {
  opponent: { name: string; short: string; strength: number; color: string };
  actions: MatchAction[];
  index: number;
  minute: number;
  us: number;
  them: number;
  rating: number;
  stats: { goals: number; assists: number; saves: number; tackles: number; won: number };
  log: string[];
  resolved: null | { success: boolean; text: string };
  finished: boolean;
};

const ATTR_LABELS: Record<AttrKey, string> = {
  technika: "Technika",
  strzal: "Strzał",
  podania: "Podania",
  drybling: "Drybling",
  odbior: "Odbiór",
  szybkosc: "Szybkość",
  sila: "Siła",
  kondycja: "Kondycja",
  refleks: "Refleks",
};

const WEIGHTS: Record<Position, Partial<Record<AttrKey, number>>> = {
  Napastnik: { strzal: 0.26, technika: 0.16, drybling: 0.16, szybkosc: 0.14, sila: 0.1, podania: 0.07, kondycja: 0.07, refleks: 0.04 },
  Pomocnik: { podania: 0.24, technika: 0.2, drybling: 0.15, kondycja: 0.13, odbior: 0.09, szybkosc: 0.07, strzal: 0.07, sila: 0.05 },
  Obrońca: { odbior: 0.27, sila: 0.2, kondycja: 0.13, szybkosc: 0.11, podania: 0.1, technika: 0.08, refleks: 0.06, drybling: 0.05 },
  Bramkarz: { refleks: 0.34, technika: 0.16, podania: 0.13, sila: 0.12, kondycja: 0.09, szybkosc: 0.07, odbior: 0.05, drybling: 0.04 },
};

const OPPONENTS = [
  { name: "KS Chrząszczyżewko", short: "CHR", strength: 43, color: "#ff6846" },
  { name: "Betonowianka Betonów", short: "BET", strength: 47, color: "#65a7ff" },
  { name: "LKS Paragon", short: "PAR", strength: 51, color: "#f6c744" },
  { name: "Orzeł Niedziela", short: "ORN", strength: 54, color: "#dc79ff" },
  { name: "Naprzód Po Wypłatę", short: "NPW", strength: 58, color: "#62d6a2" },
  { name: "Turbo Pogoń II", short: "TPI", strength: 62, color: "#ff8db5" },
];

const TRAININGS: Array<{
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  gains: Partial<Record<AttrKey, number>>;
  energy: number;
  morale: number;
}> = [
  { id: "ball", eyebrow: "TECHNIKA", title: "Pachołki i fantazja", copy: "Trener ustawia sześć pachołków. Ty omijasz siedem.", gains: { technika: 0.8, drybling: 0.7, podania: 0.25 }, energy: -11, morale: 2 },
  { id: "finish", eyebrow: "ATAK", title: "Sto strzałów", copy: "Dziewięćdziesiąt osiem w płot. Dwa nagrane na TikToka.", gains: { strzal: 1.05, technika: 0.35, sila: 0.25 }, energy: -14, morale: 1 },
  { id: "gym", eyebrow: "FIZYCZNOŚĆ", title: "Siłownia bez selfie", copy: "Rzadki trening, na którym naprawdę ćwiczysz.", gains: { sila: 0.9, kondycja: 0.65, szybkosc: 0.25 }, energy: -16, morale: -1 },
  { id: "tactics", eyebrow: "GŁOWA", title: "Wideo z trenerem", copy: "Dwie godziny analizy, z czego 80 minut to pauzowanie pilota.", gains: { odbior: 0.65, podania: 0.65, refleks: 0.45 }, energy: -7, morale: 0 },
  { id: "recovery", eyebrow: "REGENERACJA", title: "Rosół i sen", copy: "Metoda zatwierdzona przez babcię oraz fizjoterapeutę.", gains: { kondycja: 0.2 }, energy: 24, morale: 4 },
];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function ovr(player: Player) {
  const weights = WEIGHTS[player.position];
  const value = Object.entries(weights).reduce((sum, [key, weight]) => sum + player.attrs[key as AttrKey] * (weight ?? 0), 0);
  return Math.round(value * 10) / 10;
}

function initialAttributes(position: Position): Attributes {
  const common: Attributes = { technika: 43, strzal: 39, podania: 41, drybling: 42, odbior: 38, szybkosc: 46, sila: 40, kondycja: 45, refleks: 40 };
  const boosts: Record<Position, Partial<Attributes>> = {
    Napastnik: { strzal: 52, drybling: 47, szybkosc: 50, odbior: 29 },
    Pomocnik: { podania: 52, technika: 49, drybling: 47, kondycja: 49 },
    Obrońca: { odbior: 53, sila: 51, kondycja: 49, strzal: 31 },
    Bramkarz: { refleks: 55, technika: 45, podania: 46, odbior: 34, strzal: 24 },
  };
  return { ...common, ...boosts[position] };
}

function outcome(text: string, values: Omit<Outcome, "text"> = {}): Outcome {
  return { ...values, text };
}

function buildActions(position: Position): MatchAction[] {
  const attack: MatchAction[] = [
    { id: 1, minute: 8, title: "Pierwszy kontakt i już pachnie golem", flavor: "Obrońca rusza jak szafa wniesiona po schodach. Omiń go sekwencją zwodów.", stake: "Sukces = sam na sam i gol. Pomyłka = aut dla rywala.", kind: "sequence", skill: "drybling", success: outcome("Obrońca kupił zwód, paragon i przedłużoną gwarancję. GOL!", { us: 1, goal: 1 }), fail: outcome("Piłka została z tyłu. Ty pobiegłeś dalej z przekonaniem.") },
    { id: 2, minute: 21, title: "Okienko transferowe w bramce", flavor: "Uderz wtedy, gdy znacznik wejdzie w zieloną strefę.", stake: "Sukces = gol. Pudło = piłka odwiedza parking.", kind: "timing", skill: "strzal", success: outcome("Siatka zatrzepotała. Bramkarz składa reklamację. GOL!", { us: 1, goal: 1 }), fail: outcome("Piłka minęła słupek oraz powiat.") },
    { id: 3, minute: 34, title: "Podanie, którego nie wymyśliłby komentator", flavor: "Zapamiętaj wolny korytarz, zanim rywale go zamkną.", stake: "Dobry wybór = kolega strzela gola, a ty masz asystę.", kind: "choice", skill: "podania", success: outcome("Podanie przecięło obronę jak nóż plastikowy ciepłe masło. ASYSTA I GOL!", { us: 1, assist: 1 }), fail: outcome("Podałeś idealnie. Szkoda, że do rywala.") },
    { id: 4, minute: 48, title: "Pressing na zapach kiełbasy", flavor: "Zareaguj, gdy piłka odskoczy obrońcy.", stake: "Szybka reakcja = odbiór i gol do pustej. Spóźnienie = kontra.", kind: "reaction", skill: "szybkosc", success: outcome("Dopadłeś piłkę pierwszy i wturlałeś ją do bramki. GOL!", { us: 1, goal: 1 }), fail: outcome("Ruszyłeś szybko, ale dopiero po gwizdku.", { them: 1 }) },
    { id: 5, minute: 62, title: "Wolej imienia prezesa", flavor: "Złap idealny moment na strzał z powietrza.", stake: "Zielona strefa = gol. Reszta = nowa piłka potrzebna.", kind: "timing", skill: "technika", success: outcome("CO ZA BOMBA. Prezes chce nazwać trybunę twoim imieniem! GOL!", { us: 1, goal: 1 }), fail: outcome("Kontakt z piłką był symboliczny, ale szczery.") },
    { id: 6, minute: 77, title: "Kontra 3 na 2", flavor: "Jedna droga jest wolna. Zapamiętaj ją i zagraj bez litości.", stake: "Dobry korytarz = asysta i gol. Zły = groźna kontra rywala.", kind: "choice", skill: "podania", success: outcome("Kolega nie mógł tego zmarnować. Choć próbował. GOL I ASYSTA!", { us: 1, assist: 1 }), fail: outcome("Kontra wróciła jak bumerang. Niestety z golem.", { them: 1 }) },
    { id: 7, minute: 88, title: "Ostatnia piłka meczu", flavor: "Stadion wstrzymał oddech. Kiosk też. Traf w moment.", stake: "Sukces = gol. Porażka = trener mówi „było blisko”.", kind: "timing", skill: "strzal", success: outcome("W SAMO OKIENKO! Jutro nie idziesz do pracy. GOL!", { us: 1, goal: 1 }), fail: outcome("Bramkarz broni. Wyglądał, jakby wiedział, co robisz.") },
  ];

  const midfield: MatchAction[] = [attack[2], attack[0], attack[3], attack[1], attack[5], attack[4], attack[6]]
    .sort((a, b) => a.minute - b.minute)
    .map((item, index) => ({ ...item, id: index + 1 }));
  const defense: MatchAction[] = [
    { id: 1, minute: 7, title: "Napastnik wjeżdża w twoją dzielnicę", flavor: "Zatrzymaj znacznik w zielonej strefie i odbierz czysto.", stake: "Sukces = odbiór. Spóźnienie = gol rywala.", kind: "timing", skill: "odbior", success: outcome("Piłka twoja, napastnik szuka dowodu osobistego.", { tackle: 1 }), fail: outcome("Wślizg efektowny, niestety obok. Gol rywala.", { them: 1 }) },
    { id: 2, minute: 19, title: "Wyprowadzenie spod własnej bramki", flavor: "Zapamiętaj wolną linię podania.", stake: "Dobry wybór = akcja kończy się golem. Zły = prezent dla rywala.", kind: "choice", skill: "podania", success: outcome("Jednym podaniem uruchamiasz kontrę. GOL, a skaut zapisuje nazwisko!", { us: 1, assist: 1 }), fail: outcome("Rywal przejął prezent i strzelił. Podziękował.", { them: 1 }) },
    { id: 3, minute: 31, title: "Główka w polu karnym", flavor: "Zareaguj na dośrodkowanie szybciej niż napastnik.", stake: "Szybka reakcja = wybicie. Spóźnienie = gol.", kind: "reaction", skill: "refleks", success: outcome("Wybijasz z linii bramkowej! Trybuna skanduje twoje nazwisko.", { tackle: 1 }), fail: outcome("Napastnik był pierwszy. Gol rywala.", { them: 1 }) },
    { id: 4, minute: 44, title: "Rajd obrońcy, czyli trener zamyka oczy", flavor: "Wykonaj sekwencję zwodów bez zgubienia ochraniacza.", stake: "Sukces = gol po twoim rajdzie. Błąd = bez konsekwencji poza memami.", kind: "sequence", skill: "technika", success: outcome("Przeszedłeś całe boisko i strzeliłeś! Roberto Carlos z okręgówki. GOL!", { us: 1, goal: 1 }), fail: outcome("Rajd zakończony po czterech metrach. Rekord życiowy.") },
    { id: 5, minute: 57, title: "Wślizg ostatniej szansy", flavor: "Traf w zielony moment. Tu nie ma miękkiej gry.", stake: "Sukces = czysty odbiór. Błąd = gol rywala.", kind: "timing", skill: "odbior", success: outcome("Perfekcyjny wślizg! Nawet sędzia bije brawo.", { tackle: 1 }), fail: outcome("Napastnik mija cię i strzela. Gol rywala.", { them: 1 }) },
    { id: 6, minute: 72, title: "Pułapka ofsajdowa bez instrukcji", flavor: "Powtórz sekwencję ustawienia linii obrony.", stake: "Sukces = spalony. Pomyłka = sam na sam i gol.", kind: "sequence", skill: "kondycja", success: outcome("Chorągiewka w górze. Plan zadziałał, choć nikt nie wie dlaczego.", { tackle: 1 }), fail: outcome("Każdy wyszedł, tylko nie ty. Gol rywala.", { them: 1 }) },
    { id: 7, minute: 86, title: "Rzut rożny i pełna odpowiedzialność", flavor: "Złap moment na główkę.", stake: "Zielona strefa = twój gol. Pudło = szybka kontra rywala.", kind: "timing", skill: "sila", success: outcome("Wyskoczyłeś wyżej niż rata kredytu. GOL!", { us: 1, goal: 1 }), fail: outcome("Kontra po twoim pudle kończy się golem rywala.", { them: 1 }) },
  ];

  const keeper: MatchAction[] = [
    { id: 1, minute: 6, title: "Pierwszy strzał, pierwsza kawa jeszcze działa", flavor: "Zapamiętaj kierunek strzału i rzuć się tam bez dyskusji.", stake: "Dobry kierunek = obrona. Zły = gol rywala.", kind: "choice", skill: "refleks", success: outcome("Pewny chwyt! Udajesz, że to było łatwe.", { save: 1 }), fail: outcome("Rzut piękny, kierunek odwrotny. Gol rywala.", { them: 1 }) },
    { id: 2, minute: 17, title: "Dobitka z pięciu metrów", flavor: "Reaguj natychmiast, gdy pojawi się piłka.", stake: "Szybki klik = parada. Spóźnienie = gol.", kind: "reaction", skill: "refleks", success: outcome("PARADA! Napastnik już świętował. Musi odświętować.", { save: 1 }), fail: outcome("Ręce dotarły chwilę po piłce. Gol rywala.", { them: 1 }) },
    { id: 3, minute: 29, title: "Wznowienie jak u pomocnika", flavor: "Znajdź wolny korytarz i uruchom kontrę.", stake: "Dobry wybór = bezpośrednia asysta i gol. Zły = rywal strzela.", kind: "choice", skill: "podania", success: outcome("Wykop przez całe boisko! Kolega trafia. ASYSTA BRAMKARZA!", { us: 1, assist: 1 }), fail: outcome("Podanie do napastnika rywali. Skorzystał. Gol.", { them: 1 }) },
    { id: 4, minute: 43, title: "Karny. Cisza jak po pytaniu o premię", flavor: "Zapamiętaj zamiar strzelca i wybierz róg.", stake: "Dobry kierunek = obrona karnego. Zły = gol.", kind: "choice", skill: "refleks", success: outcome("BRONISZ KARNEGO! Pomnik zamówiony, cokół w ratach.", { save: 1 }), fail: outcome("Strzelec wysłał cię po hot-doga. Gol rywala.", { them: 1 }) },
    { id: 5, minute: 59, title: "Strzał zza pola karnego", flavor: "Złap idealny moment na interwencję.", stake: "Zielona strefa = obrona. Poza nią = gol.", kind: "timing", skill: "refleks", success: outcome("Końcówkami rękawic! Producent chce wykorzystać zdjęcie.", { save: 1 }), fail: outcome("Piłka wpada przy słupku. Gol rywala.", { them: 1 }) },
    { id: 6, minute: 74, title: "Sam na sam", flavor: "Powtórz sekwencję ruchów: skróć, stań, rzuć się.", stake: "Pełna sekwencja = obrona. Pomyłka = gol.", kind: "sequence", skill: "technika", success: outcome("Wygrywasz sam na sam! Napastnik prosi o zmianę nazwiska.", { save: 1 }), fail: outcome("Minął cię. Została tylko reklama za bramką. Gol.", { them: 1 }) },
    { id: 7, minute: 89, title: "Ostatnia bomba pod poprzeczkę", flavor: "Zareaguj, zanim komentator skończy krzyczeć.", stake: "Szybko = obrona. Za wolno = gol w 89. minucie.", kind: "reaction", skill: "refleks", success: outcome("WYCIĄGASZ TO! Mecz uratowany własnoręcznie.", { save: 1 }), fail: outcome("O centymetr za późno. Gol rywala.", { them: 1 }) },
  ];

  if (position === "Bramkarz") return keeper;
  if (position === "Obrońca") return defense;
  if (position === "Pomocnik") return midfield;
  return attack;
}

function MiniGame({ action, player, onResolve }: { action: MatchAction; player: Player; onResolve: (success: boolean) => void }) {
  const skill = player.attrs[action.skill];
  const [cursor, setCursor] = useState(4);
  const [preview, setPreview] = useState(true);
  const [inputs, setInputs] = useState<string[]>([]);
  const [reaction, setReaction] = useState<"wait" | "go" | "done">("wait");
  const done = useRef(false);
  const startedAt = useRef(0);
  const correctLane = action.id % 3;
  const arrows = useMemo(() => {
    const options = ["←", "↑", "→", "↓"];
    return [0, 1, 2].map((index) => options[(action.id * 3 + index * 2) % options.length]);
  }, [action.id]);
  const targetCenter = 28 + ((action.id * 17) % 45);
  const targetWidth = clamp(12 + skill / 6, 16, 29);

  const resolveOnce = (success: boolean) => {
    if (done.current) return;
    done.current = true;
    onResolve(success);
  };

  useEffect(() => {
    if (action.kind !== "timing") return;
    let frame = 0;
    let direction = 1;
    let value = 4;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(32, now - last);
      last = now;
      value += direction * delta * 0.075;
      if (value >= 98) { value = 98; direction = -1; }
      if (value <= 2) { value = 2; direction = 1; }
      setCursor(value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [action.kind]);

  useEffect(() => {
    if (action.kind === "choice" || action.kind === "sequence") {
      const timer = window.setTimeout(() => setPreview(false), 1350);
      return () => window.clearTimeout(timer);
    }
  }, [action.kind]);

  useEffect(() => {
    if (action.kind !== "reaction") return;
    const appear = window.setTimeout(() => {
      startedAt.current = performance.now();
      setReaction("go");
    }, 850 + action.id * 55);
    const fail = window.setTimeout(() => resolveOnce(false), 850 + action.id * 55 + 1250);
    return () => { window.clearTimeout(appear); window.clearTimeout(fail); };
  }, [action.id, action.kind]);

  const timingStop = () => resolveOnce(Math.abs(cursor - targetCenter) <= targetWidth / 2);
  const pushArrow = (arrow: string) => {
    const next = [...inputs, arrow];
    setInputs(next);
    const index = next.length - 1;
    if (arrows[index] !== arrow) resolveOnce(false);
    else if (next.length === arrows.length) resolveOnce(true);
  };

  return (
    <div className="minigame">
      <div className="minigame-head">
        <span className="micro-label">MINIGRA • {ATTR_LABELS[action.skill].toUpperCase()} {Math.round(skill)}</span>
        <span className="real-impact">BEZPOŚREDNI WPŁYW</span>
      </div>

      {action.kind === "timing" && (
        <div className="timing-game">
          <div className="timing-bar" aria-label="Pasek wyczucia momentu">
            <div className="danger-zone" />
            <div className="target-zone" style={{ left: `${targetCenter - targetWidth / 2}%`, width: `${targetWidth}%` }} />
            <div className="cursor" style={{ left: `${cursor}%` }} />
          </div>
          <button className="action-button full" onClick={timingStop}>STRZAŁ / INTERWENCJA <kbd>SPACJA</kbd></button>
        </div>
      )}

      {action.kind === "choice" && (
        <div className="choice-game">
          <p className="instruction">{preview ? "ZAPAMIĘTAJ WOLNY KIERUNEK" : "TERAZ WYBIERAJ"}</p>
          <div className="lane-grid">
            {["LEWO", "ŚRODEK", "PRAWO"].map((label, index) => (
              <button key={label} disabled={preview} className={`lane ${preview && correctLane === index ? "open" : ""}`} onClick={() => resolveOnce(index === correctLane)}>
                <span>{index === 0 ? "↙" : index === 1 ? "↓" : "↘"}</span>{label}
              </button>
            ))}
          </div>
        </div>
      )}

      {action.kind === "sequence" && (
        <div className="sequence-game">
          <p className="instruction">{preview ? "ZAPAMIĘTAJ SEKWENCJĘ" : `POWTÓRZ • ${inputs.length}/${arrows.length}`}</p>
          {preview ? (
            <div className="sequence-preview">{arrows.map((arrow, index) => <span key={`${arrow}-${index}`}>{arrow}</span>)}</div>
          ) : (
            <div className="arrow-grid">{["←", "↑", "↓", "→"].map((arrow) => <button key={arrow} onClick={() => pushArrow(arrow)}>{arrow}</button>)}</div>
          )}
        </div>
      )}

      {action.kind === "reaction" && (
        <div className="reaction-game">
          {reaction === "wait" && <div className="reaction-wait">CZEKAJ NA ODSKOK PIŁKI…</div>}
          {reaction === "go" && <button className="reaction-target" onClick={() => { setReaction("done"); resolveOnce(performance.now() - startedAt.current < clamp(590 + skill * 3, 680, 850)); }}>PIŁKA!<small>KLIKNIJ</small></button>}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [career, setCareer] = useState<Career | null>(null);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("Mirek Wolej");
  const [position, setPosition] = useState<Position>("Pomocnik");
  const [foot, setFoot] = useState<"Prawa" | "Lewa">("Prawa");
  const [club, setClub] = useState("LKS Drobny Druk");

  useEffect(() => {
    const saved = window.localStorage.getItem("pilkarz-na-pelnej-save");
    if (saved) {
      try { setCareer(JSON.parse(saved) as Career); } catch { window.localStorage.removeItem("pilkarz-na-pelnej-save"); }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded && career) window.localStorage.setItem("pilkarz-na-pelnej-save", JSON.stringify(career));
  }, [career, loaded]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space" && match && !match.resolved && !match.finished && match.actions[match.index]?.kind === "timing") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>(".timing-game .action-button")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match]);

  const createCareer = () => {
    const cleanName = name.trim() || "Mirek Wolej";
    setCareer({
      player: { name: cleanName, position, foot, number: position === "Bramkarz" ? 1 : position === "Napastnik" ? 9 : position === "Obrońca" ? 4 : 8, club, potential: 86, attrs: initialAttributes(position) },
      season: 1, week: 1, matchIndex: 0, energy: 91, morale: 72, professionalism: 47, media: 12, money: 1200, trainingDone: false, decisions: [],
      totals: { matches: 0, goals: 0, assists: 0, saves: 0, rating: 0 },
    });
  };

  const applyTraining = (training: (typeof TRAININGS)[number]) => {
    if (!career || career.trainingDone) return;
    const multiplier = (0.75 + career.professionalism / 180) * (career.energy < 35 ? 0.62 : 1);
    const attrs = { ...career.player.attrs };
    Object.entries(training.gains).forEach(([key, gain]) => {
      const attr = key as AttrKey;
      attrs[attr] = clamp(attrs[attr] + gain * multiplier, 1, career.player.potential);
    });
    setCareer({ ...career, player: { ...career.player, attrs }, energy: clamp(career.energy + training.energy), morale: clamp(career.morale + training.morale), trainingDone: true });
  };

  const startMatch = () => {
    if (!career) return;
    const opponent = OPPONENTS[career.matchIndex % OPPONENTS.length];
    setMatch({ opponent, actions: buildActions(career.player.position), index: 0, minute: 1, us: 0, them: 0, rating: 6, stats: { goals: 0, assists: 0, saves: 0, tackles: 0, won: 0 }, log: ["1′ Sędzia sprawdził zegarek. Działa. Gramy!"], resolved: null, finished: false });
  };

  const resolveAction = (success: boolean) => {
    if (!career || !match || match.resolved) return;
    const action = match.actions[match.index];
    const result = success ? action.success : action.fail;
    let us = match.us + (result.us ?? 0);
    let them = match.them + (result.them ?? 0);
    const log = [`${action.minute}′ ${result.text}`, ...match.log];

    // Pełny silnik rozgrywa także akcje pozostałych 21 zawodników. Wynik minigry
    // pozostaje deterministyczny; ten fragment odpowiada wyłącznie za tło meczu.
    if (match.index === 2 || match.index === 5) {
      const engineRoll = (career.week * 31 + match.index * 19 + Math.round(ovr(career.player))) % 100;
      const strengthGap = ovr(career.player) - match.opponent.strength;
      if (engineRoll < clamp(25 - strengthGap * 0.6, 9, 38)) {
        them += 1;
        log.unshift(`${action.minute + 3}′ Rywale rozegrali akcję bez twojego udziału. Gol dla ${match.opponent.name}.`);
      } else if (engineRoll > clamp(82 - strengthGap * 0.5, 63, 91)) {
        us += 1;
        log.unshift(`${action.minute + 2}′ Koledzy też coś potrafią! Gol dla ${career.player.club}.`);
      } else {
        log.unshift(`${action.minute + 2}′ Środek pola mieli piłkę tak długo, aż wszyscy zapomnieli po co.`);
      }
    }

    setMatch({
      ...match, minute: action.minute, us, them, log, resolved: { success, text: result.text },
      rating: clamp(match.rating + (success ? 0.48 : -0.27), 1, 10),
      stats: {
        goals: match.stats.goals + (result.goal ?? 0), assists: match.stats.assists + (result.assist ?? 0),
        saves: match.stats.saves + (result.save ?? 0), tackles: match.stats.tackles + (result.tackle ?? 0), won: match.stats.won + (success ? 1 : 0),
      },
    });
  };

  const continueMatch = () => {
    if (!match) return;
    if (match.index >= match.actions.length - 1) {
      setMatch({ ...match, minute: 90, finished: true, resolved: null, log: [`90′ KONIEC! ${match.us}:${match.them}. Bufet zamyka okienko.`, ...match.log] });
    } else {
      setMatch({ ...match, index: match.index + 1, resolved: null });
    }
  };

  const finishMatch = () => {
    if (!career || !match) return;
    const matchNumber = career.matchIndex + 1;
    const seasonComplete = matchNumber >= OPPONENTS.length;
    const moraleDelta = match.us > match.them ? 7 : match.us === match.them ? 2 : -5;
    const professionalGrowth = 0.12 + match.stats.won * 0.035;
    const attrs = { ...career.player.attrs };
    const weights = WEIGHTS[career.player.position];
    Object.keys(weights).slice(0, 4).forEach((key) => {
      const attr = key as AttrKey;
      attrs[attr] = clamp(attrs[attr] + professionalGrowth * (0.7 + career.professionalism / 100), 1, career.player.potential);
    });
    setCareer({
      ...career,
      player: { ...career.player, attrs },
      season: seasonComplete ? career.season + 1 : career.season,
      week: career.week + 1,
      matchIndex: seasonComplete ? 0 : matchNumber,
      energy: clamp(career.energy - 17 + (seasonComplete ? 24 : 0)),
      morale: clamp(career.morale + moraleDelta),
      professionalism: clamp(career.professionalism + (match.stats.won >= 5 ? 1 : 0)),
      media: clamp(career.media + match.stats.goals * 2 + (match.rating >= 8 ? 2 : 0)),
      money: career.money + 850 + (match.us > match.them ? 350 : 0),
      trainingDone: false,
      totals: {
        matches: career.totals.matches + 1,
        goals: career.totals.goals + match.stats.goals,
        assists: career.totals.assists + match.stats.assists,
        saves: career.totals.saves + match.stats.saves,
        rating: career.totals.rating + match.rating,
      },
    });
    setMatch(null);
  };

  const takeDecision = (choice: "fun" | "pro") => {
    if (!career) return;
    const decisionWeek = career.week;
    if (decisionWeek % 6 === 3) {
      setCareer({ ...career, money: career.money + (choice === "fun" ? 3400 : 0), media: clamp(career.media + (choice === "fun" ? 12 : -2)), professionalism: clamp(career.professionalism + (choice === "pro" ? 4 : -3)), morale: clamp(career.morale + (choice === "fun" ? 5 : 1)), decisions: [...career.decisions, decisionWeek] });
    } else {
      setCareer({ ...career, energy: clamp(career.energy + (choice === "pro" ? -9 : 15)), professionalism: clamp(career.professionalism + (choice === "pro" ? 5 : -1)), media: clamp(career.media + (choice === "fun" ? 5 : 0)), decisions: [...career.decisions, decisionWeek] });
    }
  };

  const reset = () => {
    window.localStorage.removeItem("pilkarz-na-pelnej-save");
    setCareer(null);
    setMatch(null);
  };

  if (!loaded) return <main className="loading-screen">ŁADOWANIE KORKÓW…</main>;

  if (!career) {
    return (
      <main className="start-screen">
        <header className="brand-bar"><div className="brand-mark">P:N:P</div><div>PIŁKARZ: NA PEŁNEJ</div><span>wersja boiskowa 0.1</span></header>
        <section className="hero">
          <div className="hero-copy">
            <p className="kicker">SZYBKA KARIERA • PRAWDZIWE DECYZJE • ZERO ŚCIEMY</p>
            <h1>ZAWODOWIEC?<br /><em>JESZCZE NIE.</em></h1>
            <p className="lead">Od zapachu szatni w okręgówce do hymnu Ligi Mistrzów. O ile najpierw trafisz w zielony pasek.</p>
            <div className="promise-row"><span>✓ każdy gol jest wygrany</span><span>✓ każdy odbiór ma znaczenie</span><span>✓ OVR liczony jawnie</span></div>
          </div>
          <div className="creator-card">
            <div className="tape">KARTA ZGŁOSZENIOWA</div>
            <label>Imię i nazwisko<input value={name} onChange={(event) => setName(event.target.value)} maxLength={28} /></label>
            <div className="two-cols">
              <label>Pozycja<select value={position} onChange={(event) => setPosition(event.target.value as Position)}><option>Napastnik</option><option>Pomocnik</option><option>Obrońca</option><option>Bramkarz</option></select></label>
              <label>Lepsza noga<select value={foot} onChange={(event) => setFoot(event.target.value as "Prawa" | "Lewa")}><option>Prawa</option><option>Lewa</option></select></label>
            </div>
            <label>Pierwszy klub<select value={club} onChange={(event) => setClub(event.target.value)}><option>LKS Drobny Druk</option><option>Grom Paragonowo</option><option>Unia Kiełbasa</option></select></label>
            <div className="starter-ovr"><span>STARTOWY OVR</span><strong>{ovr({ name, position, foot, number: 8, club, potential: 86, attrs: initialAttributes(position) })}</strong><small>Potencjał 86 • reszta zależy od ciebie</small></div>
            <button className="start-button" onClick={createCareer}>ZACZYNAM OD PONIEDZIAŁKU <span>→</span></button>
          </div>
        </section>
        <footer className="ticker"><span>OSTATNIA CHWILA</span><p>Prezes zapewnia, że premia jest „już prawie zaksięgowana” • Murawa posiada 72% trawy • Skaut przyjechał, ale pomylił stadiony</p></footer>
      </main>
    );
  }

  if (match) {
    const action = match.actions[match.index];
    return (
      <main className="match-screen">
        <header className="match-top"><div className="brand-mark">P:N:P</div><div className="competition">LIGA WIELKICH NADZIEI <span>• MECZ {career.matchIndex + 1}/{OPPONENTS.length}</span></div><button className="quiet-button" onClick={() => setMatch(null)}>PRZERWIJ MECZ</button></header>
        <section className="scoreboard">
          <div className="team home"><div className="crest">{career.player.club.slice(0, 2).toUpperCase()}</div><div><span>GOSPODARZE</span><strong>{career.player.club}</strong></div></div>
          <div className="score"><span>{match.minute}′</span><strong>{match.us}<i>:</i>{match.them}</strong><small>{match.finished ? "KONIEC MECZU" : "NA ŻYWO"}</small></div>
          <div className="team away"><div><span>GOŚCIE</span><strong>{match.opponent.name}</strong></div><div className="crest opponent" style={{ background: match.opponent.color }}>{match.opponent.short.slice(0, 2)}</div></div>
        </section>

        <section className="match-layout">
          <aside className="match-card player-match-card">
            <div className="shirt-number">{career.player.number}</div>
            <p className="micro-label">TWÓJ MECZ</p><h2>{career.player.name}</h2><span>{career.player.position} • OVR {ovr(career.player)}</span>
            <div className="rating-ring"><strong>{match.rating.toFixed(1)}</strong><small>OCENA</small></div>
            <div className="match-stat-grid"><div><strong>{match.stats.goals}</strong><span>GOLE</span></div><div><strong>{match.stats.assists}</strong><span>ASYSTY</span></div><div><strong>{match.stats.saves}</strong><span>OBRONY</span></div><div><strong>{match.stats.tackles}</strong><span>ODBIORY</span></div></div>
          </aside>

          <section className="action-stage">
            {!match.finished && !match.resolved && (
              <>
                <div className="minute-stamp">{action.minute}′</div>
                <p className="micro-label">KLUCZOWA AKCJA {match.index + 1}/{match.actions.length}</p>
                <h1>{action.title}</h1><p className="action-flavor">{action.flavor}</p>
                <div className="stake">STAWKA: {action.stake}</div>
                <MiniGame key={action.id} action={action} player={career.player} onResolve={resolveAction} />
              </>
            )}
            {match.resolved && !match.finished && (
              <div className={`result-card ${match.resolved.success ? "success" : "fail"}`}>
                <p>{match.resolved.success ? "AKCJA UDANA" : "AKCJA PRZEGRANA"}</p>
                <h1>{match.resolved.success ? "TO BYŁO TWOJE." : "NA POWTÓRCE WYGLĄDA GORZEJ."}</h1>
                <div className="result-copy">{match.resolved.text}</div>
                <strong className="result-score">WYNIK TERAZ: {match.us}:{match.them}</strong>
                <button className="action-button" onClick={continueMatch}>{match.index === match.actions.length - 1 ? "KOŃCZ TEN MECZ" : "GRAMY DALEJ"} →</button>
              </div>
            )}
            {match.finished && (
              <div className="final-card">
                <p className="micro-label">KONIEC MECZU</p><h1>{match.us > match.them ? "SZATNIA ŚPIEWA. FAŁSZUJE, ALE ŚPIEWA." : match.us === match.them ? "REMIS. CZYLI NIKT NIE WIE, CZY SIĘ CIESZYĆ." : "PREZES JUŻ SZUKA WINNEGO. NIE ODBIERAJ."}</h1>
                <div className="final-score">{match.us}<span>:</span>{match.them}</div>
                <p>Twoja ocena <strong>{match.rating.toFixed(1)}</strong> • wygrane minigry <strong>{match.stats.won}/{match.actions.length}</strong></p>
                <button className="action-button" onClick={finishMatch}>WRACAM DO SZATNI →</button>
              </div>
            )}
          </section>

          <aside className="match-card commentary-card"><p className="micro-label">RADIO BOISKOWE 98.7 FM</p><h3>Relacja bez powtórek</h3><div className="match-log">{match.log.slice(0, 7).map((entry, index) => <p key={`${entry}-${index}`} className={index === 0 ? "latest" : ""}>{entry}</p>)}</div></aside>
        </section>
      </main>
    );
  }

  const currentOvr = ovr(career.player);
  const nextOpponent = OPPONENTS[career.matchIndex % OPPONENTS.length];
  const showDecision = career.week % 3 === 0 && !career.decisions.includes(career.week);

  return (
    <main className="career-screen">
      <header className="career-top"><div className="brand-lockup"><div className="brand-mark">P:N:P</div><strong>PIŁKARZ: NA PEŁNEJ</strong></div><div className="season-chip">SEZON {career.season} • TYDZIEŃ {career.week}</div><button className="quiet-button" onClick={reset}>NOWA KARIERA</button></header>
      <section className="career-grid">
        <aside className="profile-panel">
          <div className="profile-shirt"><span>{career.player.number}</span><small>{career.player.club.slice(0, 3).toUpperCase()}</small></div>
          <p className="micro-label">{career.player.position.toUpperCase()} • {career.player.foot.toUpperCase()} NOGA</p><h1>{career.player.name}</h1><p className="club-name">{career.player.club}</p>
          <div className="ovr-block"><div><span>OVR</span><strong>{currentOvr.toFixed(1)}</strong></div><p>Potencjał <b>{career.player.potential}</b><br />OVR wynika wyłącznie z atrybutów.</p></div>
          <div className="vitals">
            <div><span>ENERGIA</span><strong>{Math.round(career.energy)}%</strong><i><b style={{ width: `${career.energy}%` }} /></i></div>
            <div><span>MORALE</span><strong>{Math.round(career.morale)}%</strong><i><b style={{ width: `${career.morale}%` }} /></i></div>
            <div><span>PROFESJONALIZM</span><strong>{Math.round(career.professionalism)}%</strong><i><b style={{ width: `${career.professionalism}%` }} /></i></div>
          </div>
          <div className="wallet"><span>STAN KONTA</span><strong>{career.money.toLocaleString("pl-PL")} zł</strong><small>Premia wpłynie. Kiedyś.</small></div>
        </aside>

        <section className="dashboard">
          <div className="welcome-row"><div><p className="kicker">CENTRUM DOWODZENIA</p><h2>{career.trainingDone ? "Trening zrobiony. Czas udowodnić, że coś dał." : "Co robimy przed kolejnym meczem?"}</h2></div><div className="record"><span>KARIERA</span><strong>{career.totals.matches} M • {career.totals.goals} G • {career.totals.assists} A • {career.totals.saves} O</strong></div></div>

          {showDecision && (
            <section className="decision-banner"><div><p className="micro-label">DECYZJA TYGODNIA • SKUTKI SĄ PEWNE</p><h3>{career.week % 6 === 3 ? "Kebab „U Prezesa” chce sponsorować twoją lewą łydkę." : "Trener proponuje dodatkowy trening w niedzielę o 6:15."}</h3></div><div className="decision-buttons"><button onClick={() => takeDecision("fun")}>{career.week % 6 === 3 ? "BIORĘ 3400 ZŁ" : "WYBIERAM ROSÓŁ"}<small>{career.week % 6 === 3 ? "+12 medialność • −3 profesjonalizm" : "+15 energia • +5 medialność"}</small></button><button onClick={() => takeDecision("pro")}>{career.week % 6 === 3 ? "ODMAWIAM" : "IDĘ NA TRENING"}<small>{career.week % 6 === 3 ? "+4 profesjonalizm" : "+5 profesjonalizm • −9 energia"}</small></button></div></section>
          )}

          <section className="training-section">
            <div className="section-title"><div><p className="micro-label">PLAN TYGODNIA</p><h3>Jeden wybór. Konkretne liczby.</h3></div><span className={career.trainingDone ? "done-chip" : "open-chip"}>{career.trainingDone ? "PLAN ZREALIZOWANY" : "WYBIERZ TRENING"}</span></div>
            <div className="training-grid">{TRAININGS.map((training) => (
              <button key={training.id} disabled={career.trainingDone} className="training-card" onClick={() => applyTraining(training)}>
                <span>{training.eyebrow}</span><strong>{training.title}</strong><p>{training.copy}</p>
                <div>{Object.entries(training.gains).map(([key, gain]) => <b key={key}>+{gain} {ATTR_LABELS[key as AttrKey]}</b>)}<em className={training.energy > 0 ? "positive" : "negative"}>{training.energy > 0 ? "+" : ""}{training.energy} energii</em></div>
              </button>
            ))}</div>
          </section>

          <section className="attributes-section">
            <div className="section-title"><div><p className="micro-label">TWOJE LICZBY</p><h3>Skąd bierze się OVR {currentOvr.toFixed(1)}?</h3></div><span className="formula-chip">SUMA WAŻONA DLA POZYCJI</span></div>
            <div className="attributes-grid">{(Object.keys(career.player.attrs) as AttrKey[]).map((key) => {
              const value = career.player.attrs[key]; const weight = WEIGHTS[career.player.position][key] ?? 0;
              return <div className={`attribute ${weight >= 0.15 ? "key-attribute" : ""}`} key={key}><div><span>{ATTR_LABELS[key]}</span>{weight > 0 && <small>{Math.round(weight * 100)}% OVR</small>}<strong>{value.toFixed(1)}</strong></div><i><b style={{ width: `${value}%` }} /></i></div>;
            })}</div>
          </section>
        </section>

        <aside className="next-match-panel">
          <p className="micro-label">NASTĘPNY MECZ • {career.matchIndex + 1}/{OPPONENTS.length}</p><div className="versus"><div className="mini-crest">{career.player.club.slice(0, 2).toUpperCase()}</div><span>VS</span><div className="mini-crest opponent" style={{ background: nextOpponent.color }}>{nextOpponent.short.slice(0, 2)}</div></div><h2>{nextOpponent.name}</h2><p>Siła rywala <strong>{nextOpponent.strength}</strong><br />Twoja forma zależy od energii i minigier.</p>
          <div className="impact-note"><strong>TU NIE MA „+5% SZANS”.</strong><p>Udany strzał daje gola. Udana obrona kasuje gola. Dobra asysta zmienia wynik na tablicy.</p></div>
          <button className="match-button" onClick={startMatch} disabled={showDecision}>{showDecision ? "NAJPIERW DECYZJA" : career.trainingDone ? "WYCHODZĘ NA BOISKO" : "GRAM BEZ TRENINGU"}<span>→</span></button>
          <div className="season-track">{OPPONENTS.map((opponent, index) => <div key={opponent.short} className={index < career.matchIndex ? "played" : index === career.matchIndex ? "current" : ""}><span>{index + 1}</span><small>{opponent.short}</small></div>)}</div>
        </aside>
      </section>
    </main>
  );
}
