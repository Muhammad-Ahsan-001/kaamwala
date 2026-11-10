import type { Driver, DriveStep, PopoverDOM } from "driver.js";
import type { AuthUser } from "../data/types";
import { speakUrdu } from "../lib/audio";
import type { Lang } from "../lib/settings";
import { hasUrduVoice, stopSpeaking } from "./voice";

export type TourKind = "worker" | "customer";

export const TOUR_HOME: Record<TourKind, string> = { worker: "/app/worker", customer: "/app/adda" };

type Words = readonly [ur: string, roman: string, en: string];

type TourStep = {
  find?: () => Element | null;
  side?: "top" | "bottom";
  title: Words;
  body: Words;
  /** Short Urdu read aloud on the worker side. */
  spoken?: string;
};

const navItem = (path: string) => () => document.querySelector(`nav a[href="${path}"]`);
const statusSwitch = () => document.querySelector('main [role="switch"]');
const firstSection = () => document.querySelector("main h2");
const map = () => document.querySelector(".leaflet-container");

const STEPS: Record<TourKind, TourStep[]> = {
  worker: [
    {
      title: ["خوش آمدید", "Khush aamdeed", "Welcome"],
      body: ["کام والا آپ کو قریب کا کام دلاتا ہے۔ یہ چند چیزیں دیکھ لیں۔", "KaamWala aap ko qareeb ka kaam dilata hai. Ye chand cheezein dekh lein.", "KaamWala brings you work nearby. Here are the few things to know."],
      spoken: "کام والا میں خوش آمدید۔ یہ چند چیزیں دیکھ لیں۔",
    },
    {
      find: statusSwitch,
      side: "bottom",
      title: ["فارغ یا مصروف", "Farigh ya masroof", "Available or busy"],
      body: ["اس بڑے بٹن سے بتائیں کہ آپ فارغ ہیں یا مصروف۔ مصروف ہوں تو گاہک آپ کو نہیں دیکھتے۔", "Is bare button se batayein ke aap farigh hain ya masroof. Masroof hon to gahak aap ko nahi dekhte.", "Use this big button to say whether you are free or busy. Customers cannot see you while you are busy."],
      spoken: "اس بڑے بٹن سے بتائیں کہ آپ فارغ ہیں یا مصروف۔",
    },
    {
      find: firstSection,
      side: "top",
      title: ["نیا کام", "Naya kaam", "New jobs"],
      body: ["قریب کے نئے کام یہاں آتے ہیں۔ آفر بھیجیں دبا کر اپنی قیمت بتائیں۔", "Qareeb ke naye kaam yahan aate hain. Offer bhejein daba kar apni qeemat batayein.", "New jobs near you appear here. Tap Send offer to give your price."],
      spoken: "قریب کے نئے کام یہاں آتے ہیں۔",
    },
    {
      find: navItem("/app/jobs"),
      side: "top",
      title: ["میرے کام", "Mere kaam", "My jobs"],
      body: ["آپ کے سارے کام یہاں ہیں۔ انٹرنیٹ نہ ہو تب بھی دیکھ سکتے ہیں۔", "Aap ke saare kaam yahan hain. Internet na ho tab bhi dekh sakte hain.", "All your jobs are here. You can read them even with no internet."],
      spoken: "آپ کے سارے کام یہاں ہیں۔",
    },
    {
      find: navItem("/app/earnings"),
      side: "top",
      title: ["کمائی", "Kamai", "Earnings"],
      body: ["ہر کام اور ہر دن کی کمائی یہاں دیکھیں۔", "Har kaam aur har din ki kamai yahan dekhein.", "See what each job and each day has earned you."],
      spoken: "ہر کام اور ہر دن کی کمائی یہاں دیکھیں۔",
    },
  ],
  customer: [
    {
      title: ["خوش آمدید", "Khush aamdeed", "Welcome"],
      body: ["قریب کا کاریگر ڈھونڈنا آسان ہے۔ یہ چند چیزیں دیکھ لیں۔", "Qareeb ka kaarigar dhoondna aasan hai. Ye chand cheezein dekh lein.", "Finding a worker nearby is easy. Here are the few things to know."],
    },
    {
      find: map,
      side: "bottom",
      title: ["نقشہ", "Naqsha", "The map"],
      body: ["قریب کے فارغ کاریگر نقشے اور فہرست میں نظر آتے ہیں۔ کسی کو چن کر درخواست بھیجیں۔", "Qareeb ke farigh kaarigar naqshe aur fehrist mein nazar aate hain. Kisi ko chun kar darkhwast bhejein.", "Available workers near you show on the map and in the list. Pick one to send a request."],
    },
    {
      find: navItem("/app/describe"),
      side: "top",
      title: ["مسئلہ بتائیں", "Masla batayein", "Describe a problem"],
      body: ["بول کر، لکھ کر یا تصویر سے اپنا مسئلہ بتائیں۔", "Bol kar, likh kar ya tasveer se apna masla batayein.", "Tell us what is wrong by voice, typing or a photo."],
    },
    {
      find: navItem("/app/jobs"),
      side: "top",
      title: ["میرے کام", "Mere kaam", "My jobs"],
      body: ["آپ کے کام، آفرز اور بات چیت یہاں ہیں۔", "Aap ke kaam, offers aur baat cheet yahan hain.", "Your jobs, offers and conversations are here."],
    },
  ],
};

/** Who should get which tour. An unfinished sign-up, an agent or an admin gets none. */
export function tourKindFor(user: AuthUser): TourKind | null {
  if (user.role === "worker" && user.workerId) return "worker";
  if (user.role === "customer" && user.hasHirerProfile) return "customer";
  return null;
}

const seenKey = (kind: TourKind, userId: string) => `kw.tour.${kind}.${userId}`;

export function tourSeen(kind: TourKind, userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(kind, userId)) === "1";
  } catch {
    // Without storage the choice cannot be remembered, so do not show the tour on every visit.
    return true;
  }
}

function markTourSeen(kind: TourKind, userId: string): void {
  try {
    window.localStorage.setItem(seenKey(kind, userId), "1");
  } catch {
    // Handled by tourSeen.
  }
}

export function resetTour(kind: TourKind, userId: string): void {
  try {
    window.localStorage.removeItem(seenKey(kind, userId));
  } catch {
    // Handled by tourSeen.
  }
}

/** Long enough for someone to answer whatever sheet the screen opened first, such as choosing an area. */
const ANCHOR_WAIT_MS = 2 * 60 * 1000;
const ANCHOR_CHECK_MS = 200;

/** The screen fills in after its data arrives. The tour needs what it points at to be there and uncovered. */
export async function waitForTourAnchors(kind: TourKind, isCancelled: () => boolean): Promise<boolean> {
  const anchor = STEPS[kind].find((step) => step.find)?.find;
  const deadline = Date.now() + ANCHOR_WAIT_MS;
  while (Date.now() < deadline) {
    if (isCancelled()) return false;
    if (anchor?.() && !document.querySelector('[role="dialog"]')) return true;
    await new Promise((resolve) => setTimeout(resolve, ANCHOR_CHECK_MS));
  }
  return false;
}

type TourOptions = {
  kind: TourKind;
  userId: string;
  lang: Lang;
  audioCues: boolean;
  onEnd: () => void;
};

const pick = (words: Words, lang: Lang) => (lang === "ur" ? words[0] : lang === "roman" ? words[1] : words[2]);

/** Browsers only speak after the person has touched the page, so the first step may stay quiet. */
const canSpeakNow = () => {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
};

/** Starts the tour and returns a function that stops it. */
export async function runTour({ kind, userId, lang, audioCues, onEnd }: TourOptions): Promise<() => void> {
  const [{ driver }, urduVoice] = await Promise.all([import("driver.js"), hasUrduVoice(), import("driver.js/dist/driver.css")]);
  const speaks = kind === "worker" && audioCues && urduVoice;
  // Honest about why nothing is heard. Only worth saying if sound was wanted and could have played.
  const explainSilence = kind === "worker" && audioCues && !urduVoice;

  const present = STEPS[kind].filter((step) => !step.find || step.find());

  const steps: DriveStep[] = present.map((step, index) => {
    const element = step.find?.() ?? undefined;
    return {
      ...(element ? { element } : {}),
      popover: {
        title: pick(step.title, lang),
        description: pick(step.body, lang),
        side: step.side ?? "bottom",
        align: "center",
        // There is nothing to go back to from the first step.
        showButtons: index === 0 ? ["next", "close"] : ["next", "previous", "close"],
      },
    };
  });

  const spokenFor = (index: number | undefined) => (index === undefined ? undefined : present[index]?.spoken);

  const say = (index: number | undefined) => {
    const text = spokenFor(index);
    if (speaks && text && canSpeakNow()) speakUrdu(text, true);
  };

  const decorate = (popover: PopoverDOM, index: number | undefined) => {
    popover.wrapper.setAttribute("dir", lang === "ur" ? "rtl" : "ltr");
    popover.wrapper.classList.toggle("kw-tour-ur", lang === "ur");

    if (speaks && spokenFor(index)) {
      popover.footer.querySelector(".kw-tour-listen")?.remove();
      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "driver-popover-footer-btn kw-tour-listen";
      listen.textContent = pick(["سنیں", "Sunein", "Listen"], lang);
      listen.addEventListener("click", () => speakUrdu(spokenFor(index) ?? "", true));
      popover.footer.prepend(listen);
    }

    if (explainSilence && index === 0 && !popover.description.querySelector(".kw-tour-note")) {
      const note = document.createElement("span");
      note.className = "kw-tour-note";
      note.textContent = pick(["اس فون میں اردو آواز موجود نہیں، اس لیے بولا نہیں جا رہا۔", "Is phone mein Urdu awaz mojood nahi, is liye bola nahi ja raha.", "This phone has no Urdu voice installed, so these steps are not read aloud."], lang);
      popover.description.append(note);
    }
  };

  const tour: Driver = driver({
    steps,
    popoverClass: "kw-tour",
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayClickBehavior: "none",
    overlayColor: "rgb(30 43 37)",
    overlayOpacity: 0.62,
    stagePadding: 6,
    stageRadius: 18,
    popoverOffset: 12,
    disableActiveInteraction: true,
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: pick(["آگے", "Aage", "Next"], lang),
    prevBtnText: pick(["پیچھے", "Peeche", "Back"], lang),
    doneBtnText: pick(["ٹھیک ہے", "Theek hai", "Got it"], lang),
    closeBtnLabel: pick(["بند کریں", "Band karein", "Close"], lang),
    onPopoverRender: (popover, { state }) => decorate(popover, state.activeIndex),
    onHighlighted: (_element, _step, { state }) => say(state.activeIndex),
    onDestroyed: () => {
      stopSpeaking();
      markTourSeen(kind, userId);
      onEnd();
    },
  });

  tour.drive();
  return () => {
    if (tour.isActive()) tour.destroy();
  };
}
