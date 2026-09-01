import React from 'react';
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const Badge = ({ children, variant = 'gray', className, ...props }) => {
    const variantStyles = {
        primary: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15',
        success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        yellow: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        error: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        red: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
        gray: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };

    return (
        <ShadcnBadge
            variant="outline"
            className={cn(
                'text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border transition-colors',
                variantStyles[variant] || variantStyles.gray,
                className
            )}
            {...props}
        >
            {children}
        </ShadcnBadge>
    );
};

export default Badge;
