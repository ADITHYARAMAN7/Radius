import {
  Cpu,
  GraduationCap,
  Music,
  Sparkles,
  Tag,
  Trophy,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Primitives';
import { CATEGORY_STYLES, cn } from '@/lib/utils';
import type { Category } from '@/lib/types';

const ICONS: Record<Category, LucideIcon> = {
  Sports: Trophy,
  Music,
  Food: UtensilsCrossed,
  'Yard Sale': Tag,
  Community: Users,
  Education: GraduationCap,
  Technology: Cpu,
  Other: Sparkles,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  const Icon = ICONS[category] ?? Sparkles;
  return <Icon className={cn('h-4 w-4', className)} aria-hidden="true" />;
}

export function CategoryBadge({
  category,
  size = 'md',
  withIcon = true,
  className,
}: {
  category: Category;
  size?: 'sm' | 'md';
  withIcon?: boolean;
  className?: string;
}) {
  const style = CATEGORY_STYLES[category];

  return (
    <Badge tone="custom" size={size} className={cn(style.badge, className)}>
      {withIcon && <CategoryIcon category={category} className="h-3.5 w-3.5" />}
      {category}
    </Badge>
  );
}
