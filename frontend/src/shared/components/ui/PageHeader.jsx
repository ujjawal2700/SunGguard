import React from 'react';
import { cn } from '@/lib/utils';

const PageHeader = ({ 
    title, 
    description, 
    actions, 
    badge, 
    icon: Icon,
    breadcrumbs,
    className 
}) => {
    return (
        <div className={cn("ds-page-header", className)}>
            <div className="ds-page-title-group">
                {breadcrumbs && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-1">
                        {breadcrumbs}
                    </div>
                )}
                <div className="flex items-center flex-wrap gap-2.5">
                    {Icon && (
                        <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                            <Icon className="h-5 w-5" />
                        </div>
                    )}
                    <h1 className="ds-h1">{title}</h1>
                    {badge && <div>{badge}</div>}
                </div>
                {description && <p className="ds-description mt-0.5">{description}</p>}
            </div>
            {actions && <div className="ds-page-actions">{actions}</div>}
        </div>
    );
};

export default PageHeader;
