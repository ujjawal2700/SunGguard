import React from 'react';
import { cn } from '@/lib/utils';
import EmptyState from './EmptyState';
import { Inbox } from 'lucide-react';

const DataTable = ({ 
    columns, 
    data = [], 
    onRowClick, 
    className,
    emptyMessage = "No data available",
    emptyDescription = "There are no records to display at this time.",
    isLoading = false
}) => {
    if (isLoading) {
        return (
            <div className={cn("ds-table-container min-h-[200px] flex items-center justify-center p-8", className)}>
                <div className="flex flex-col items-center gap-2">
                    <div className="h-7 w-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-semibold text-slate-400">Loading records...</p>
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className={cn("ds-table-container bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl", className)}>
                <EmptyState 
                    icon={Inbox}
                    title={emptyMessage}
                    description={emptyDescription}
                />
            </div>
        );
    }

    return (
        <div className={cn("ds-table-container overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm", className)}>
            <div className="overflow-x-auto">
                <table className="ds-table w-full text-left">
                    <thead className="ds-table-header bg-slate-50/90 dark:bg-slate-800/80 backdrop-blur-sm">
                        <tr>
                            {columns.map((column, index) => (
                                <th 
                                    key={index} 
                                    className={cn(
                                        "ds-table-header-cell px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800",
                                        column.align === 'right' && 'text-right',
                                        column.align === 'center' && 'text-center',
                                        column.className
                                    )}
                                >
                                    {column.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {data.map((row, rowIndex) => (
                            <tr 
                                key={rowIndex} 
                                className={cn(
                                    "ds-table-row transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
                                    onRowClick && "cursor-pointer"
                                )}
                                onClick={() => onRowClick && onRowClick(row)}
                            >
                                {columns.map((column, colIndex) => (
                                    <td 
                                        key={colIndex} 
                                        className={cn(
                                            "ds-table-cell px-4 py-3.5 text-xs md:text-sm text-slate-700 dark:text-slate-200",
                                            column.align === 'right' && 'text-right',
                                            column.align === 'center' && 'text-center',
                                            column.cellClassName
                                        )}
                                    >
                                        {column.cell ? column.cell(row) : row[column.accessor]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DataTable;
