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
];

/** Both spellings, Roman first, for Jev's area reading. */
export const AREA_NAMES = AREAS.flatMap((a) => [a.name, a.nameUr]);

export function findArea(text: string): Area | null {
  const key = canonicalText(text);
  if (!key) return null;
  const sector = text.match(/\b([defghi])\s*-?\s*(\d{1,2})/i);
  const sectorKey = sector ? canonicalText(`${sector[1]}-${sector[2]}`) : null;
  return (
    AREAS.find((a) => {
      const roman = canonicalText(a.name);
      return roman === key || roman === sectorKey || canonicalText(a.nameUr) === key;
    }) ?? null
  );
}
