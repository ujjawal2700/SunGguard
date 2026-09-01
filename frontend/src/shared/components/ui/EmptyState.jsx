import React from 'react';
import { cn } from '@/lib/utils';

const EmptyState = ({
    icon: IconOrElement,
    title,
    description,
    action,
    className,
}) => {
    const renderIcon = () => {
        if (!IconOrElement) return null;
        if (React.isValidElement(IconOrElement)) {
            return <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 mb-1">{IconOrElement}</div>;
        }
        const Icon = IconOrElement;
        return (
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 mb-1">
                <Icon className="h-8 w-8" />
            </div>
        );
    };

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-2.5 py-14 px-6 text-center',
                className,
            )}
        >
            {renderIcon()}
            {title ? (
                <h3 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">{title}</h3>
            ) : null}
            {description ? (
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-md font-medium leading-relaxed">{description}</p>
            ) : null}
            {action ? <div className="mt-3">{action}</div> : null}
        </div>
    );
};

export default EmptyState;
