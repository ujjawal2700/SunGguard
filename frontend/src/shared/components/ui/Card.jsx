import React from 'react';
import {
    Card as ShadcnCard,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from '@/lib/utils';

const Card = ({ 
    children, 
    title, 
    subtitle, 
    className, 
    headerAction, 
    footer, 
    contentClassName, 
    headerClassName,
    footerClassName,
    ...props 
}) => {
    return (
        <ShadcnCard className={cn("bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm transition-all duration-200", className)} {...props}>
            {(title || subtitle || headerAction) && (
                <CardHeader className={cn("flex flex-row items-center justify-between space-y-0 border-b border-slate-100 dark:border-slate-800/80 px-6 py-4.5", headerClassName)}>
                    <div className="space-y-0.5">
                        {title && <CardTitle className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">{title}</CardTitle>}
                        {subtitle && <CardDescription className="text-xs font-medium text-slate-500 dark:text-slate-400">{subtitle}</CardDescription>}
                    </div>
                    {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
                </CardHeader>
            )}
            <CardContent className={cn("p-6", !title && !subtitle && !headerAction && "pt-6", contentClassName)}>
                {children}
            </CardContent>
            {footer && (
                <CardFooter className={cn("bg-slate-50/50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800/80 px-6 py-3.5 rounded-b-2xl", footerClassName)}>
                    {footer}
                </CardFooter>
            )}
        </ShadcnCard>
    );
};

export default Card;
