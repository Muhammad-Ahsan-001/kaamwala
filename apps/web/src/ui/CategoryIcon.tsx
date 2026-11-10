import {
  Baby,
  Bike,
  Car,
  CookingPot,
  Droplets,
  Fan,
  Flower2,
  Hammer,
  HardHat,
  KeyRound,
  PaintRoller,
  Scissors,
  Shirt,
  ShieldCheck,
  Shovel,
  Snowflake,
  Sparkles,
  Truck,
  Tv,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Icons the admin can choose from. This is a picture set, not the list of trades. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  droplets: Droplets,
  snowflake: Snowflake,
  hammer: Hammer,
  wrench: Wrench,
  "hard-hat": HardHat,
  shovel: Shovel,
  "paint-roller": PaintRoller,
  sparkles: Sparkles,
  scissors: Scissors,
  truck: Truck,
  shirt: Shirt,
  baby: Baby,
  "cooking-pot": CookingPot,
  car: Car,
  tv: Tv,
  fan: Fan,
  bike: Bike,
  flower: Flower2,
  key: KeyRound,
  shield: ShieldCheck,
};

/** The seed stores emoji. They are drawn from the same line-icon set as every admin-picked icon. */
const EMOJI_ICONS: Record<string, string> = {
  "⚡": "zap",
  "🚰": "droplets",
  "❄": "snowflake",
  "🪚": "hammer",
  "🔧": "wrench",
  "🧱": "hard-hat",
  "💪": "shovel",
  "🎨": "paint-roller",
  "🧹": "sparkles",
};

/** The CATEGORY_ICONS key for a stored icon value, or null when it is not one of them. */
export function iconKey(name: string | undefined): string | null {
  if (!name) return null;
  if (CATEGORY_ICONS[name]) return name;
  return EMOJI_ICONS[name.replace(/️/g, "")] ?? null;
}

export function iconFor(name: string | undefined): LucideIcon {
  const key = iconKey(name);
  return (key && CATEGORY_ICONS[key]) || Wrench;
}

export function CategoryIcon({ name, className }: { name: string | undefined; className?: string }) {
  const Icon = iconFor(name);
  return <Icon className={className} aria-hidden />;
}
