import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({ 
    label, 
    value, 
    icon: Icon, 
    trend, 
    trendDirection = 'up',
    description,
    color = 'text-primary',
    bg = 'bg-primary/10 border border-primary/20',
    onClick,
    className 
}) => {
    return (
        <div 
            onClick={onClick}
            className={cn(
                "ds-stat-card group relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200",
                onClick && "cursor-pointer hover:border-primary/40",
                className
            )}
        >
            <div className="flex flex-col space-y-3">
                <div className="flex justify-between items-start">
                    <div className={cn("p-2.5 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105", bg)}>
                        {Icon && <Icon className={cn("h-5 w-5", color)} strokeWidth={2} />}
                    </div>
                    {trend && (
                        <div className={cn(
                            "inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full",
                            trendDirection === 'up' 
                                ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800' 
                                : 'text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800'
                        )}>
                            {trendDirection === 'up' ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                                <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {trend}
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                    <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">{value}</p>
                    {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{description}</p>}
                </div>
            </div>
        </div>
    );
};

export default StatCard;
