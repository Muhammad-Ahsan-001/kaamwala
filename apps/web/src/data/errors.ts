/** Every code the API can send, plus the few this client adds. Screens respond to these, never to message text. */
const API_ERROR_CODES = [
  "ACCOUNT_SUSPENDED",
  "AI_UNAVAILABLE",
  "ALREADY_REGISTERED",
  "ALREADY_REVIEWED",
  "BELOW_FLOOR",
  "CANNOT_HIRE_SELF",
  "CARD_OUTDATED",
  "CATEGORY_NOT_FOUND",
  "CNIC_DUPLICATE",
  "CNIC_REQUIRED",
  "CNIC_UNREADABLE",
  "CREW_FULL",
  "CREW_JOB_ACTIVE",
  "CREW_NOT_ALLOWED",
  "CREW_REQUIRED",
  "DAYS_ALREADY_COMPLETED",
  "DAY_SKIPPED",
  "FILE_NOT_SUPPORTED",
  "FILE_TOO_LARGE",
  "FORBIDDEN",
  "IMAGE_REQUIRED",
  "INPUT_REQUIRED",
  "INTERNAL_ERROR",
  "INVALID_AUDIO",
  "INVALID_IMAGE",
  "INVALID_JOB_STATE",
  "INVALID_JSON",
  "INVALID_OTP",
  "INVALID_PHONE",
  "LEADER_CANNOT_LEAVE",
  "LOCATION_REQUIRED",
  "NETWORK",
  "NOTHING_HEARD",
  "NOT_FOUND",
  "NOT_STAFF",
  "NO_DAYS_COMPLETED",
  "OFFER_NOT_PENDING",
  "PHONE_IN_USE",
  "PHONE_REQUIRED",
  "PRICE_CHANGED",
  "PRICE_REQUIRED",
  "RATE_LIMITED",
  "RATING_REQUIRED",
  "TEXT_TOO_LONG",
  "TOO_MANY_REQUESTS",
  "TRADE_NOT_RECOGNISED",
  "TRY_AGAIN",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "WORKER_ENGAGED",
  "WORKER_NOT_APPROVED",
  "WORKER_NOT_AVAILABLE",
  "WORKER_REQUIRED",
  "WRONG_TRADE",
  "UNKNOWN",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const KNOWN_CODES = new Set<string>(API_ERROR_CODES);

/** A code this build does not know about becomes UNKNOWN, so a newer API can never break a screen. */
export const toErrorCode = (code: unknown): ApiErrorCode => (typeof code === "string" && KNOWN_CODES.has(code) ? (code as ApiErrorCode) : "UNKNOWN");

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorCode(error: unknown): ApiErrorCode {
  return error instanceof ApiError ? error.code : "UNKNOWN";
}

type Translate = (ur: string, roman: string, en: string) => string;
type Words = readonly [ur: string, roman: string, en: string];

const AGAIN: Words = ["دوبارہ کوشش کریں", "Dobara koshish karein", "Please try again"];
const VOICE: Words = ["آواز سمجھ نہیں آئی۔ دوبارہ بولیں یا لکھ کر بھریں۔", "Awaz samajh nahi aayi. Dobara bolein ya likh kar bharein.", "We could not understand that. Try again or type instead."];

const MESSAGES: Partial<Record<ApiErrorCode, Words>> = {
  ACCOUNT_SUSPENDED: ["یہ اکاؤنٹ معطل ہے", "Ye account mu'attal hai", "This account is suspended"],
  AI_UNAVAILABLE: ["ابھی آواز سمجھی نہیں جا سکی۔ لکھ کر بھریں۔", "Abhi awaz samjhi nahi ja saki. Likh kar bharein.", "Voice could not be processed right now. Please type instead."],
  ALREADY_REGISTERED: ["اس فون پر پروفائل پہلے سے ہے", "Is phone par profile pehle se hai", "This phone already has a worker profile"],
  ALREADY_REVIEWED: ["آپ پہلے ہی جائزہ دے چکے ہیں", "Aap pehle hi jaiza de chuke hain", "You already reviewed this job"],
  BELOW_FLOOR: ["اس سے کم نہیں ہو سکتا", "Is se kam nahi ho sakta", "It cannot go below the minimum price"],
  CANNOT_HIRE_SELF: ["آپ خود کو کام نہیں دے سکتے", "Aap khud ko kaam nahi de sakte", "You cannot hire yourself"],
  CARD_OUTDATED: ["جاب کارڈ کی تاریخ گزر گئی۔ نیا کارڈ بنائیں۔", "Job card ki tareekh guzar gayi. Naya card banayein.", "The job card's start date has passed. Please make a new card."],
  CATEGORY_NOT_FOUND: ["یہ کام اب دستیاب نہیں", "Ye kaam ab dastyab nahi", "This trade is not available"],
  CNIC_DUPLICATE: ["یہ شناختی کارڈ پہلے سے رجسٹر ہے", "Ye CNIC pehle se registered hai", "This CNIC is already registered"],
  CNIC_UNREADABLE: ["شناختی کارڈ کا نمبر پڑھا نہیں جا سکا", "CNIC ka number parha nahi ja saka", "We could not read a 13-digit CNIC number"],
  CREW_FULL: ["ٹیم پوری ہو چکی ہے", "Crew poori ho chuki hai", "This crew is full"],
  CREW_JOB_ACTIVE: ["پہلے اس ٹیم کا کام مکمل کریں", "Pehle is crew ka kaam mukammal karein", "Finish this crew's current job first"],
  CREW_NOT_ALLOWED: ["اس کام کے لیے ٹیم نہیں بلائی جا سکتی", "Is kaam ke liye crew nahi bulai ja sakti", "Crew jobs are not allowed in this trade"],
  DAYS_ALREADY_COMPLETED: ["کچھ دن مکمل ہو چکے۔ جلدی ختم کریں۔", "Kuch din mukammal ho chuke. Jaldi khatam karein.", "Some days are done. Finish the job early instead."],
  INVALID_AUDIO: ["یہ آڈیو نہیں چل سکتی", "Ye audio nahi chal sakti", "This audio format is not supported"],
  FILE_NOT_SUPPORTED: ["یہ فائل نہیں لگ سکتی۔ JPG یا PNG تصویر چنیں۔", "Ye file nahi lag sakti. JPG ya PNG tasveer chunein.", "This file cannot be used. Please choose a JPG or PNG photo."],
  FILE_TOO_LARGE: ["یہ فائل بہت بڑی ہے۔ 12 MB سے چھوٹی فائل چنیں۔", "Ye file bohat bari hai. 12 MB se chhoti file chunein.", "This file is too large. Please choose one under 12 MB."],
  INVALID_IMAGE: ["یہ فائل پڑھی نہیں جا سکی۔ JPG تصویر یا PDF چنیں۔", "Ye file parhi nahi ja saki. JPG tasveer ya PDF chunein.", "This file could not be read. Please choose a JPG photo or a PDF."],
  INVALID_OTP: ["کوڈ درست نہیں", "Code durust nahi", "That code is not correct"],
  INVALID_PHONE: ["صحیح فون نمبر لکھیں", "Sahi phone number likhein", "Enter a valid phone number"],
  LEADER_CANNOT_LEAVE: ["لیڈر ٹیم نہیں چھوڑ سکتا", "Leader crew nahi chhor sakta", "The crew leader cannot leave the crew"],
  LOCATION_REQUIRED: ["فہرست سے علاقہ چنیں", "List se ilaqa chunein", "Pick an area from the list or share your location"],
  NETWORK: ["انٹرنیٹ نہیں مل رہا", "Internet nahi mil raha", "No internet connection"],
  NOTHING_HEARD: VOICE,
  NOT_STAFF: ["یہ نمبر اس لاگ ان کے لیے منظور نہیں", "Ye number is login ke liye manzoor nahi", "This number is not approved for this sign-in"],
  NO_DAYS_COMPLETED: ["ابھی کوئی دن مکمل نہیں۔ کام منسوخ کریں۔", "Abhi koi din mukammal nahi. Kaam mansookh karein.", "No day has been completed yet. Cancel the job instead."],
  OFFER_NOT_PENDING: ["یہ آفر اب نہیں رہی", "Ye offer ab nahi rahi", "This offer is no longer open"],
  PHONE_IN_USE: ["اس فون کا اکاؤنٹ پہلے سے ہے", "Is phone ka account pehle se hai", "This phone already has an account"],
  PRICE_CHANGED: ["قیمت بدل گئی۔ دوبارہ کوشش کریں۔", "Qeemat badal gayi. Dobara koshish karein.", "The price changed. Please try again."],
  RATE_LIMITED: ["تھوڑی دیر بعد کوشش کریں", "Thori der baad koshish karein", "Too many tries. Please wait a moment."],
  TEXT_TOO_LONG: ["بات بہت لمبی ہے، مختصر لکھیں", "Baat bohat lambi hai, mukhtasar likhein", "That is too long. Please shorten it."],
  TOO_MANY_REQUESTS: ["پہلے کاریگروں کے جواب کا انتظار کریں", "Pehle kaarigaron ke jawab ka intezar karein", "Please wait for an answer to your other requests, or cancel one"],
  TRADE_NOT_RECOGNISED: ["کام سمجھ نہیں آیا۔ فہرست سے چنیں۔", "Kaam samajh nahi aaya. List se chunein.", "We could not recognise this trade. Please pick one from the list."],
  WORKER_ENGAGED: ["کام جاری ہے، پہلے اسے مکمل کریں", "Kaam jari hai, pehle isay mukammal karein", "Finish the current job first"],
  WORKER_NOT_APPROVED: ["آپ کی پروفائل منظوری کے انتظار میں ہے", "Aapki profile manzoori ke intezar mein hai", "Your profile is waiting for approval"],
  WORKER_NOT_AVAILABLE: ["یہ کاریگر اب فارغ نہیں رہا", "Ye kaarigar ab farigh nahi raha", "This worker is no longer available"],
  WRONG_TRADE: ["یہ کام ان کے ہنر میں نہیں", "Ye kaam in ke hunar mein nahi", "This work is not in the trades they do"],
  CREW_REQUIRED: ["اس کام پر صرف ٹیم آفر دے سکتی ہے", "Is kaam par sirf crew offer de sakti hai", "Only a crew can bid on this job"],
  FORBIDDEN: ["یہ آپ نہیں کر سکتے", "Ye aap nahi kar sakte", "You are not allowed to do this"],
  INVALID_JOB_STATE: ["یہ کام آگے بڑھ چکا ہے، تازہ حالت دیکھیں", "Ye kaam aage barh chuka hai, taza haalat dekhein", "This job has moved on. Please see its latest status."],
};

/** The message for a failure, in the current language. Pass the `t` from useSettings. */
export function errorText(error: unknown, t: Translate): string {
  const words = MESSAGES[errorCode(error)] ?? AGAIN;
  return t(words[0], words[1], words[2]);
}

/** One busy person holds up a whole crew, so on a crew booking the refusal says that, not "this worker". */
export function crewErrorText(error: unknown, t: Translate): string {
  if (errorCode(error) === "WORKER_NOT_AVAILABLE") return t("ٹیم کا کوئی فرد اب فارغ نہیں، اس لیے یہ ٹیم ابھی نہیں بلائی جا سکتی", "Crew ka koi fard ab farigh nahi, is liye ye crew abhi nahi bulai ja sakti", "Someone in this crew is no longer free, so the crew cannot be booked right now");
  return errorText(error, t);
}
