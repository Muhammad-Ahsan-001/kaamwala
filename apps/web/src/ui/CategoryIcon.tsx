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

export function iconFor(name: string | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Wrench;
}

export function CategoryIcon({ name, className }: { name: string | undefined; className?: string }) {
  const Icon = iconFor(name);
  return <Icon className={className} aria-hidden />;
}
