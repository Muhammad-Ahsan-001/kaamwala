import { canonicalText } from "@kaamwala/jev";

export interface Area {
  name: string;
  nameUr: string;
  lat: number;
  lng: number;
}

/** Approximate centre points, used when a worker gives an area name but no GPS fix. */
export const AREAS: Area[] = [
  { name: "G-6", nameUr: "جی سکس", lat: 33.7075, lng: 73.0885 },
  { name: "G-8", nameUr: "جی ایٹ", lat: 33.6935, lng: 73.0525 },
  { name: "G-9", nameUr: "جی نائن", lat: 33.6885, lng: 73.0345 },
  { name: "G-10", nameUr: "جی ٹین", lat: 33.6785, lng: 73.0155 },
  { name: "G-11", nameUr: "جی الیون", lat: 33.6695, lng: 72.9965 },
  { name: "G-13", nameUr: "جی تھرٹین", lat: 33.6495, lng: 72.9625 },
  { name: "F-6", nameUr: "ایف سکس", lat: 33.7285, lng: 73.0765 },
  { name: "F-7", nameUr: "ایف سیون", lat: 33.7205, lng: 73.0575 },
  { name: "F-8", nameUr: "ایف ایٹ", lat: 33.7105, lng: 73.0395 },
  { name: "F-10", nameUr: "ایف ٹین", lat: 33.6945, lng: 73.0135 },
  { name: "F-11", nameUr: "ایف الیون", lat: 33.6845, lng: 72.9875 },
  { name: "E-11", nameUr: "ای الیون", lat: 33.7005, lng: 72.9755 },
  { name: "H-8", nameUr: "ایچ ایٹ", lat: 33.6815, lng: 73.0665 },
  { name: "H-13", nameUr: "ایچ تھرٹین", lat: 33.6375, lng: 72.9835 },
  { name: "I-8", nameUr: "آئی ایٹ", lat: 33.6645, lng: 73.0725 },
  { name: "I-9", nameUr: "آئی نائن", lat: 33.6565, lng: 73.0565 },
  { name: "I-10", nameUr: "آئی ٹین", lat: 33.6485, lng: 73.0405 },
  { name: "Blue Area", nameUr: "بلیو ایریا", lat: 33.7105, lng: 73.0605 },
  { name: "Bani Gala", nameUr: "بنی گالا", lat: 33.7275, lng: 73.1515 },
  { name: "Saddar", nameUr: "صدر", lat: 33.5965, lng: 73.0485 },
  { name: "Satellite Town", nameUr: "سیٹلائٹ ٹاؤن", lat: 33.6385, lng: 73.0725 },
  { name: "Commercial Market", nameUr: "کمرشل مارکیٹ", lat: 33.6345, lng: 73.0745 },
  { name: "Raja Bazaar", nameUr: "راجہ بازار", lat: 33.6135, lng: 73.0645 },
  { name: "Committee Chowk", nameUr: "کمیٹی چوک", lat: 33.6195, lng: 73.0655 },
  { name: "Westridge", nameUr: "ویسٹریج", lat: 33.6055, lng: 73.0135 },
  { name: "Peshawar Road", nameUr: "پشاور روڈ", lat: 33.6015, lng: 73.0205 },
  { name: "Chaklala Scheme 3", nameUr: "چکلالہ سکیم تھری", lat: 33.5845, lng: 73.0955 },
  { name: "Adiala Road", nameUr: "اڈیالہ روڈ", lat: 33.5605, lng: 73.0355 },
  { name: "Gulraiz", nameUr: "گلریز", lat: 33.5955, lng: 73.1335 },
  { name: "Soan Garden", nameUr: "سون گارڈن", lat: 33.5645, lng: 73.1405 },
  { name: "Bahria Town", nameUr: "بحریہ ٹاؤن", lat: 33.5225, lng: 73.0965 },
  { name: "DHA Phase 2", nameUr: "ڈی ایچ اے فیز ٹو", lat: 33.5305, lng: 73.1555 },
  { name: "G-7", nameUr: "جی سیون", lat: 33.7005, lng: 73.0705 },
  { name: "G-12", nameUr: "جی ٹویلو", lat: 33.6595, lng: 72.9795 },
  { name: "G-14", nameUr: "جی فورٹین", lat: 33.6395, lng: 72.9445 },
  { name: "G-15", nameUr: "جی ففٹین", lat: 33.6295, lng: 72.9265 },
  { name: "F-9", nameUr: "ایف نائن", lat: 33.7025, lng: 73.0265 },
  { name: "H-9", nameUr: "ایچ نائن", lat: 33.6735, lng: 73.0485 },
  { name: "H-10", nameUr: "ایچ ٹین", lat: 33.6655, lng: 73.0305 },
  { name: "H-11", nameUr: "ایچ الیون", lat: 33.6575, lng: 73.0125 },
  { name: "H-12", nameUr: "ایچ ٹویلو", lat: 33.6475, lng: 72.9945 },
  { name: "I-11", nameUr: "آئی الیون", lat: 33.6405, lng: 73.0225 },
  { name: "I-12", nameUr: "آئی ٹویلو", lat: 33.6305, lng: 73.0045 },
  { name: "I-13", nameUr: "آئی تھرٹین", lat: 33.6205, lng: 72.9865 },
  { name: "I-14", nameUr: "آئی فورٹین", lat: 33.6105, lng: 72.9685 },
  { name: "Faizabad", nameUr: "فیض آباد", lat: 33.6625, lng: 73.0875 },
  { name: "Murree Road", nameUr: "مری روڈ", lat: 33.6255, lng: 73.0705 },
  { name: "Tench Bhatta", nameUr: "ٹینچ بھاٹہ", lat: 33.5825, lng: 73.0405 },
  { name: "Lalkurti", nameUr: "لال کرتی", lat: 33.5885, lng: 73.0605 },
];

/** Both spellings, Roman first, for Jev's area reading. */
export const AREA_NAMES = AREAS.flatMap((a) => [a.name, a.nameUr]);

const SECTOR_PATTERN = /\b([defghi])[\s-]{0,4}(\d{1,2})/i;
const KNOWN_SECTOR = /^([D-I])-(\d{1,2})$/;
const MIN_SECTOR = 5;
const MAX_SECTOR = 18;

const hasPhrase = (text: string, phrase: string) => phrase !== "" && ` ${text} `.includes(` ${phrase} `);

/** The longest name first, so a long name is never lost to a shorter one inside it. */
const BY_LONGEST_NAME = [...AREAS].sort((a, b) => b.name.length - a.name.length);

/** A real sector the list does not hold yet takes its position from the closest one it does. */
function nearestSector(letter: string, number: number): Area | null {
  if (number < MIN_SECTOR || number > MAX_SECTOR) return null;
  const column = letter.toUpperCase().charCodeAt(0);
  let best: Area | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const area of AREAS) {
    const known = area.name.match(KNOWN_SECTOR);
    if (!known) continue;
    const gap = Math.abs(column - (known[1] as string).charCodeAt(0)) * 2 + Math.abs(number - Number(known[2]));
    if (gap < bestGap) {
      best = area;
      bestGap = gap;
    }
  }
  if (!best) return null;
  const name = `${letter.toUpperCase()}-${number}`;
  return { ...best, name, nameUr: name };
}

export function findArea(text: string): Area | null {
  const key = canonicalText(text);
  if (!key) return null;
  const sector = text.match(SECTOR_PATTERN);
  const sectorKey = sector ? canonicalText(`${sector[1]}-${sector[2]}`) : null;
  const exact = AREAS.find((a) => {
    const roman = canonicalText(a.name);
    return roman === key || roman === sectorKey || canonicalText(a.nameUr) === key;
  });
  if (exact) return exact;
  const contained = BY_LONGEST_NAME.find(
    (a) => hasPhrase(key, canonicalText(a.name)) || hasPhrase(key, canonicalText(a.nameUr)),
  );
  if (contained) return contained;
  return sector ? nearestSector(sector[1] as string, Number(sector[2])) : null;
}
