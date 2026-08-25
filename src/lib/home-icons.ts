import {
  Award,
  BarChart3,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Compass,
  FileText,
  Flag,
  GraduationCap,
  Layers,
  LineChart,
  ListChecks,
  Lock,
  Medal,
  PenLine,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons an admin may attach to a landing-page block.
 *
 * An allow-list rather than a free-text Lucide name: the stored value is rendered as a
 * component, so accepting arbitrary names would mean either shipping the whole icon set to
 * the client or rendering nothing when a name is misspelt.
 *
 * The names are a const tuple so the same list drives the zod enum, the admin picker, and
 * the `Record` below — which fails to typecheck if an icon is ever left unmapped.
 */
export const HOME_ICON_NAMES = [
  "sparkles",
  "timer",
  "clock",
  "check",
  "listChecks",
  "clipboard",
  "fileText",
  "penLine",
  "book",
  "layers",
  "graduation",
  "brain",
  "target",
  "compass",
  "flag",
  "refresh",
  "trendingUp",
  "lineChart",
  "barChart",
  "trophy",
  "medal",
  "award",
  "users",
  "shield",
  "lock",
  "rocket",
  "zap",
  "wand",
  "calendar",
] as const;

export type HomeIconName = (typeof HOME_ICON_NAMES)[number];

const ICONS: Record<HomeIconName, LucideIcon> = {
  sparkles: Sparkles,
  timer: Timer,
  clock: Clock,
  check: CheckCircle2,
  listChecks: ListChecks,
  clipboard: ClipboardList,
  fileText: FileText,
  penLine: PenLine,
  book: BookOpen,
  layers: Layers,
  graduation: GraduationCap,
  brain: Brain,
  target: Target,
  compass: Compass,
  flag: Flag,
  refresh: RefreshCw,
  trendingUp: TrendingUp,
  lineChart: LineChart,
  barChart: BarChart3,
  trophy: Trophy,
  medal: Medal,
  award: Award,
  users: Users,
  shield: ShieldCheck,
  lock: Lock,
  rocket: Rocket,
  zap: Zap,
  wand: Wand2,
  calendar: Calendar,
};

export function isHomeIconName(value: unknown): value is HomeIconName {
  return typeof value === "string" && value in ICONS;
}

/** Resolves a stored icon name, falling back to a neutral mark for empty/unknown values. */
export function homeIcon(name: string | null | undefined): LucideIcon {
  return isHomeIconName(name) ? ICONS[name] : Sparkles;
}
