import {
  Briefcase,
  Car,
  CircleHelp,
  Fuel,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  PartyPopper,
  PawPrint,
  Pill,
  Plane,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Ícones disponíveis para categoria. Mapa explícito em vez de import dinâmico
 * de toda a lucide — o bundle do celular agradece.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  car: Car,
  'circle-help': CircleHelp,
  fuel: Fuel,
  'graduation-cap': GraduationCap,
  heart: Heart,
  'heart-pulse': HeartPulse,
  house: House,
  'party-popper': PartyPopper,
  'paw-print': PawPrint,
  pill: Pill,
  plane: Plane,
  repeat: Repeat,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  smartphone: Smartphone,
  utensils: Utensils,
  wallet: Wallet,
  wifi: Wifi,
  wrench: Wrench,
  zap: Zap,
}

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS)

export function CategoryIcon({
  name,
  className,
}: {
  name: string | null | undefined
  className?: string
}) {
  const Icon = (name && CATEGORY_ICONS[name]) || CircleHelp
  return <Icon className={className} />
}
