/**
 * The trade dictionary the demo ships with. It is seed data only: once loaded, admins manage it
 * in the Category table. An everyday word on its own (band, gas, door, khana) means something else
 * most of the time, so words like that appear here only inside a phrase with a trade word.
 */
export interface SeedCategory {
  id: string;
  nameUr: string;
  nameRoman: string;
  nameEn: string;
  icon: string;
  floorPrice: number;
  crewAllowed: boolean;
  keywords: string[];
  skills: Record<string, string[]>;
  tasks: string[];
}

export const CATEGORIES: SeedCategory[] = [
  {
    id: "electrician",
    nameUr: "الیکٹریشن",
    nameRoman: "bijli wala",
    nameEn: "Electrician",
    icon: "⚡",
    floorPrice: 500,
    crewAllowed: true,
    keywords: ["electrician", "electric", "bijli", "bijli ka kaam", "wiring", "switch", "socket", "board", "ups", "short circuit", "breaker", "meter", "بجلی", "الیکٹریشن", "وائرنگ", "سوئچ", "بورڈ", "ساکٹ"],
    skills: {
      "Fan repair": ["pankha", "punkha", "fan", "ceiling fan", "پنکھا"],
      "House wiring": ["wiring", "tar", "وائرنگ"],
      "UPS installation": ["ups", "battery", "یو پی ایس"],
      "Switchboard repair": ["switch", "board", "socket", "سوئچ", "ساکٹ"],
      "Light fitting": ["light", "bulb", "tube light", "بلب", "لائٹ"],
    },
    tasks: ["Ceiling fan bohat awaz kar raha hai", "Kitchen ka socket jal gaya hai", "UPS lagwana hai", "Poore ghar ki wiring check karni hai"],
  },
  {
    id: "plumber",
    nameUr: "پلمبر",
    nameRoman: "plumber",
    nameEn: "Plumber",
    icon: "🚰",
    floorPrice: 500,
    crewAllowed: true,
    keywords: ["plumber", "plumbing", "nalka", "pipe", "leak", "leakage", "tanki", "pani", "pani ka masla", "gutter", "flush", "commode", "نلکا", "پلمبر", "پائپ", "پانی", "ٹینکی", "گٹر"],
    skills: {
      "Tap repair": ["nalka", "tap", "tooti", "نلکا", "ٹونٹی"],
      "Leak fixing": ["leak", "leakage", "tapak", "رساؤ", "لیک"],
      "Geyser fitting": ["geyser", "gizer", "گیزر"],
      "Water tank cleaning": ["tanki", "tank", "ٹینکی"],
      "Drain unblocking": ["gutter", "naali", "گٹر", "نالی"],
    },
    tasks: ["Bathroom ka nalka tapak raha hai", "Geyser ka pipe leak hai", "Chhat wali tanki saaf karni hai", "Kitchen ki naali band hai"],
  },
  {
    id: "ac-technician",
    nameUr: "اے سی ٹیکنیشن",
    nameRoman: "ac wala",
    nameEn: "AC technician",
    icon: "❄️",
    floorPrice: 1000,
    crewAllowed: false,
    keywords: ["ac", "a/c", "air conditioner", "aircon", "split", "cooling", "thanda", "fridge", "اے سی", "ایئر کنڈیشنر", "ٹھنڈا"],
    skills: {
      "AC service": ["ac safai", "اے سی سروس", "اے سی صفائی"],
      "Gas refill": ["ac gas", "اے سی گیس"],
      "AC installation": ["ac lagana", "ac lagwana", "ac fitting", "اے سی لگانا"],
      "Compressor repair": ["compressor", "کمپریسر"],
    },
    tasks: ["AC thanda nahi kar raha", "Split AC ki service karwani hai", "AC ki gas khatam hai", "Naya AC lagwana hai"],
  },
  {
    id: "carpenter",
    nameUr: "بڑھئی",
    nameRoman: "tarkhan",
    nameEn: "Carpenter",
    icon: "🪚",
    floorPrice: 800,
    crewAllowed: true,
    keywords: ["carpenter", "tarkhan", "lakri", "wood", "darwaza", "almari", "furniture", "kabat", "bed", "بڑھئی", "ترکھان", "لکڑی", "دروازہ", "الماری", "فرنیچر"],
    skills: {
      "Door repair": ["darwaza", "door theek", "door toot", "door broken", "دروازہ"],
      "Wardrobe making": ["almari", "wardrobe", "الماری"],
      "Furniture repair": ["furniture", "kursi", "table", "فرنیچر"],
      "Kitchen cabinets": ["cabinet", "kabat", "الماریاں"],
    },
    tasks: ["Kamray ka darwaza band nahi hota", "Kitchen ke cabinet theek karne hain", "Naye almari banwani hai", "Sofa ki lakri toot gayi hai"],
  },
  {
    id: "mechanic",
    nameUr: "مکینک",
    nameRoman: "mechanic",
    nameEn: "Mechanic",
    icon: "🔧",
    floorPrice: 500,
    crewAllowed: false,
    keywords: ["mechanic", "machanic", "gari", "gaari", "car", "bike", "motorcycle", "engine", "tuning", "workshop", "گاڑی", "مکینک", "موٹر سائیکل", "انجن", "بائیک"],
    skills: {
      "Engine tuning": ["engine", "tuning", "انجن"],
      "Bike repair": ["bike", "motorcycle", "موٹر سائیکل"],
      "Brake service": ["brake", "bregin", "بریک"],
      "Oil change": ["oil", "tel", "تیل"],
    },
    tasks: ["Gari start nahi ho rahi", "Bike ka engine awaz kar raha hai", "Brake kaam nahi kar rahe", "Oil change karwana hai"],
  },
  {
    id: "mistri",
    nameUr: "مستری",
    nameRoman: "mistri",
    nameEn: "Mason",
    icon: "🧱",
    floorPrice: 1200,
    crewAllowed: true,
    keywords: ["mistri", "mason", "construction", "deewar", "plaster", "cement", "tiles", "chhat", "فرش", "مستری", "دیوار", "پلستر", "سیمنٹ", "ٹائل", "چھت"],
    skills: {
      Plastering: ["plaster", "پلستر"],
      "Tile fixing": ["tiles", "tile", "ٹائل"],
      "Brick work": ["eent", "brick", "deewar", "اینٹ", "دیوار"],
      "Roof repair": ["chhat", "roof", "چھت"],
    },
    tasks: ["Deewar ka plaster utar gaya hai", "Bathroom ki tiles lagwani hain", "Chhat se pani aa raha hai", "Choti deewar banwani hai"],
  },
  {
    id: "labourer",
    nameUr: "مزدور",
    nameRoman: "mazdoor",
    nameEn: "Labourer",
    icon: "💪",
    floorPrice: 1000,
    crewAllowed: true,
    keywords: ["mazdoor", "labour", "labourer", "helper", "dihari", "saman", "shifting", "maleba", "مزدور", "دیہاڑی", "سامان", "ملبہ"],
    skills: {
      "Loading and shifting": ["saman", "shifting", "loading", "سامان"],
      "Debris removal": ["maleba", "debris", "ملبہ"],
      "Site helper": ["helper", "ہیلپر"],
    },
    tasks: ["Ghar ka saman shift karna hai", "Maleba uthwana hai", "Do din ke liye helper chahiye"],
  },
  {
    id: "painter",
    nameUr: "پینٹر",
    nameRoman: "rang saaz",
    nameEn: "Painter",
    icon: "🎨",
    floorPrice: 1000,
    crewAllowed: true,
    keywords: ["painter", "paint", "rang", "rang saaz", "distemper", "polish", "putty", "پینٹر", "رنگ", "رنگ ساز", "پینٹ"],
    skills: {
      "Wall painting": ["deewar rang", "rang", "رنگ"],
      "Wood polish": ["polish", "پالش"],
      "Putty work": ["putty", "پٹی"],
    },
    tasks: ["Do kamron ko rang karwana hai", "Darwazon ko polish karni hai", "Deewar par seelan ke baad paint karna hai"],
  },
  {
    id: "home-maid",
    nameUr: "ماسی",
    nameRoman: "maasi",
    nameEn: "Home maid",
    icon: "🧹",
    floorPrice: 800,
    crewAllowed: false,
    keywords: ["maasi", "masi", "kaam wali", "kaam wali bai", "ghar ki safai", "safai wali", "maid", "cleaning", "ماسی", "کام والی", "گھر کی صفائی", "صفائی والی"],
    skills: {
      "House cleaning": ["safai", "jhaaru", "pocha", "صفائی"],
      "Dish washing": ["bartan", "برتن"],
      "Laundry": ["kapre", "kapray", "dhulai", "کپڑے"],
      "Cooking help": ["khana banana", "khana pakana", "cooking", "کھانا بنانا", "کھانا پکانا"],
    },
    tasks: ["Poore ghar ki safai karwani hai", "Roz bartan aur jhaaru pocha", "Hafte mein do din kapre dhone hain"],
  },
];
