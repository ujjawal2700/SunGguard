import React from 'react';
import Badge from './Badge';

const ORDER_STATUS_VARIANT = {
    pending: 'yellow',
    confirmed: 'blue',
    packed: 'blue',
    out_for_delivery: 'blue',
    delivered: 'green',
    cancelled: 'red',
    returned: 'red',
    return_requested: 'yellow',
    return_approved: 'blue',
    return_rejected: 'red',
    return_pickup_assigned: 'blue',
    return_completed: 'green',
    active: 'green',
    inactive: 'gray',
    verified: 'green',
    rejected: 'red',
    suspended: 'red',
};

const PAYMENT_STATUS_VARIANT = {
    PAID: 'green',
    CAPTURED: 'green',
    PENDING: 'yellow',
    CREATED: 'gray',
    FAILED: 'red',
    REFUNDED: 'purple',
};

const PAYOUT_STATUS_VARIANT = {
    pending: 'yellow',
    on_hold: 'yellow',
    released: 'green',
    approved: 'green',
    completed: 'green',
    failed: 'red',
    rejected: 'red',
};

const PARCEL_STATUS_VARIANT = {
    CREATED: 'gray',
    ASSIGNED: 'blue',
    ACCEPTED: 'blue',
    PICKED_UP: 'blue',
    IN_TRANSIT: 'blue',
    DELIVERED: 'green',
    CANCELLED: 'red',
    RETURNED: 'red',
};

function pickVariant(status, kind) {
    if (!status) return 'gray';
    const key = String(status);
    switch (kind) {
        case 'payment':
            return PAYMENT_STATUS_VARIANT[key.toUpperCase()] || 'gray';
        case 'payout':
            return PAYOUT_STATUS_VARIANT[key.toLowerCase()] || 'gray';
        case 'parcel':
            return PARCEL_STATUS_VARIANT[key.toUpperCase()] || ORDER_STATUS_VARIANT[key.toLowerCase()] || 'gray';
        case 'order':
        default:
            return ORDER_STATUS_VARIANT[key.toLowerCase()] || 'gray';
    }
}

function formatLabel(status) {
    if (!status) return '';
    return String(status)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

const StatusBadge = ({ status, kind = 'order', className }) => {
    const variant = pickVariant(status, kind);
    return (
        <Badge variant={variant} className={className}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {formatLabel(status)}
        </Badge>
    );
};

export default StatusBadge;
