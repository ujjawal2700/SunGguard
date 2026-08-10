/**
 * CAR WASH FEATURE DISABLED — not wired into admin routes.
 */
import React, { useState, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Users,
    UserCheck,
    Activity,
    Trophy,
    Search,
    Filter,
    Phone,
    MapPin,
    Sparkles,
    Star,
    DollarSign,
    ShieldCheck,
    Pencil,
    Trash2,
    Eye,
    X,
    RotateCw,
    Clock,
    Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';

const ActiveWashers = () => {
    const [washers, setWashers] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedWasher, setSelectedWasher] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [viewingWasher, setViewingWasher] = useState(null);

    // Form states
    const [formState, setFormState] = useState({
        name: '', phone: '', email: '', location: '', experience: '', experienceDetails: ''
    });

    // Fetch Washers
    const fetchWashers = async (requestedPage = 1) => {
        setIsLoading(true);
        try {
            const params = { page: requestedPage, limit: pageSize, verified: 'true' };
            if (searchTerm.trim()) params.search = searchTerm.trim();

            const response = await adminApi.getDeliveryPartners(params);
            const payload = response.data.result || {};
            const data = Array.isArray(payload.items) ? payload.items : (response.data.results || response.data.result || []);

            // Filter for car wash service only and map
            const mappedWashers = data
                .filter(r => r.isCarWashService)
                .map(r => ({
                    id: r._id,
                    name: r.name,
                    phone: r.phone,
                    email: r.email,
                    status: r.isOnline ? 'available' : 'offline',
                    experience: r.experience || 'Not Specified',
                    experienceDetails: r.experienceDetails || '',
                    rating: 4.8, // Mock rating
                    totalWashes: r.completedOrdersCount || 0,
                    todayEarnings: 0,
                    location: r.address || r.currentArea || 'Unknown',
                    joinDate: new Date(r.createdAt).toLocaleDateString()
                }));

            setWashers(mappedWashers);
            setTotal(mappedWashers.length);
            setPage(requestedPage);
        } catch (error) {
            console.error('Fetch Washers Error:', error);
            toast.error('Failed to fetch car wash partners');
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        const timer = setTimeout(() => {
            fetchWashers(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [pageSize, searchTerm, statusFilter]);

    const filteredWashers = useMemo(() => {
        return washers.filter(w => {
            const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.phone.includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [washers, searchTerm, statusFilter]);

    const handleAction = (type, washer) => {
        if (type === 'view') {
            setViewingWasher(washer);
        } else if (type === 'edit') {
            setFormState(washer);
            setSelectedWasher(washer);
            setIsEditModalOpen(true);
        } else if (type === 'delete') {
            if (window.confirm(`Are you sure you want to deactivate and reject ${washer.name}?`)) {
                adminApi.rejectDeliveryPartner(washer.id)
                    .then(() => {
                        toast.success('Washer deactivated successfully');
                        setWashers(washers.filter(w => w.id !== washer.id));
                    })
                    .catch(() => toast.error('Failed to deactivate washer'));
            }
        }
    };

    const handleEditSubmit = (e) => {
        e.preventDefault();
        // Since we are mocking updating locally or via an API:
        setWashers(washers.map(w => w.id === selectedWasher.id ? { ...w, ...formState } : w));
        setIsEditModalOpen(false);
        setSelectedWasher(null);
        toast.success("Washer details updated locally.");
    };

    const stats = [
        { label: 'Active Washers', value: washers.length, color: 'cyan', icon: Users, description: 'Total wash force' },
        { label: 'Available Online', value: washers.filter(w => w.status === 'available').length, color: 'emerald', icon: UserCheck, description: 'Ready to wash' },
        { label: 'Offline', value: washers.filter(w => w.status === 'offline').length, color: 'slate', icon: Activity, description: 'Currently inactive' },
        { label: 'Top Cleaners', value: washers.filter(w => w.rating >= 4.5).length, color: 'amber', icon: Trophy, description: 'High rating' },
    ];

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Active Washers
                        <div className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
                    </h1>
                    <p className="ds-description mt-1">Monitor online status, ratings, and performance of active door step car wash agents.</p>
                </div>
                <button 
                    onClick={() => fetchWashers(1)}
                    className="p-3 bg-white ring-1 ring-slate-200 rounded-2xl text-slate-400 hover:text-cyan-500 transition-all shadow-sm"
                >
                    <RotateCw className="h-5 w-5" />
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, idx) => (
                    <Card key={idx} className="p-6 border-none shadow-xl ring-1 ring-slate-100 hover:ring-cyan-500/20 transition-all group overflow-hidden relative bg-white">
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="ds-label mb-2">{stat.label}</p>
                                <h3 className="ds-stat-medium text-slate-800">{stat.value}</h3>
                            </div>
                            <div className={cn(
                                "p-3 rounded-2xl transition-all duration-300 group-hover:scale-110 shadow-lg text-cyan-600 bg-cyan-50 shadow-cyan-50"
                            )}>
                                <stat.icon className="h-5 w-5" strokeWidth={2.5} />
                            </div>
                        </div>
                        <div className="absolute -bottom-6 -right-6 h-24 w-24 bg-slate-50 rounded-full group-hover:scale-150 transition-transform duration-700" />
                    </Card>
                ))}
            </div>

            {/* Filters & Search Section */}
            <Card className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white/50 backdrop-blur-xl">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 group-focus-within:text-cyan-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search washers by name or phone number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-100/50 border-none rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-100/50 p-1 rounded-2xl flex items-center">
                            {['all', 'available', 'offline'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={cn(
                                        "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                        statusFilter === status
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Washers Grid View */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative min-h-[300px]">
                {isLoading && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-3xl">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-10 w-10 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fetching fleet...</p>
                        </div>
                    </div>
                )}
                <AnimatePresence mode='popLayout'>
                    {!isLoading && filteredWashers.length === 0 ?
                        <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                            <Users className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                            <p className="text-sm font-bold text-slate-500">No active washers found matching your filters.</p>
                        </div>
                        :
                        filteredWashers.map((washer) => (
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={washer.id}
                            >
                                <Card className="group border-none shadow-xl ring-1 ring-slate-100 hover:ring-cyan-500/20 transition-all overflow-hidden bg-white rounded-3xl">
                                    <div className="p-6 space-y-5">
                                        {/* Top Header */}
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-4">
                                                <div className="relative">
                                                    <div className="h-14 w-14 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-black text-base ring-2 ring-white shadow-sm">
                                                        {washer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                                    </div>
                                                    <div className={cn(
                                                        "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-white shadow-sm",
                                                        washer.status === 'available' ? 'bg-emerald-500' : 'bg-slate-300'
                                                    )} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900 group-hover:text-cyan-600 transition-colors">{washer.name}</h4>
                                                    <div className="flex items-center gap-1.5 mt-1 text-slate-500">
                                                        <Phone className="h-3 w-3" />
                                                        <span className="text-[10px] font-bold">{washer.phone}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded-lg">
                                                <Star className="h-3 w-3 fill-current" />
                                                <span className="text-[10px] font-black">{washer.rating}</span>
                                            </div>
                                        </div>

                                        {/* Metrics Row */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-50 p-3 rounded-2xl">
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Today Payout</p>
                                                <div className="flex items-center gap-1.5">
                                                    <DollarSign className="h-3.5 w-3.5 text-cyan-600" />
                                                    <span className="text-xs font-black text-slate-900">₹{washer.todayEarnings}</span>
                                                </div>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-2xl">
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Total Washes</p>
                                                <div className="flex items-center gap-1.5">
                                                    <ShieldCheck className="h-3.5 w-3.5 text-cyan-600" />
                                                    <span className="text-xs font-black text-slate-900">{washer.totalWashes} jobs</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Detailing experience details */}
                                        <div className="space-y-2 text-slate-500">
                                            <div className="flex items-center gap-2">
                                                <Briefcase className="h-3.5 w-3.5 text-cyan-500" />
                                                <span className="text-[10px] font-bold truncate">{washer.experience} Exp</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="text-[10px] font-semibold truncate">{washer.location}</span>
                                            </div>
                                        </div>

                                        {/* Action Footer */}
                                        <div className="pt-2 flex items-center gap-2">
                                            <button
                                                onClick={() => handleAction('view', washer)}
                                                className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                VIEW PROFILE
                                            </button>
                                            <button
                                                onClick={() => handleAction('edit', washer)}
                                                className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-cyan-50 hover:text-cyan-600 transition-all"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleAction('delete', washer)}
                                                className="p-2.5 bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        ))
                    }
                </AnimatePresence>
            </div>

            {/* Profile Detail Modal */}
            <AnimatePresence>
                {viewingWasher && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                            onClick={() => setViewingWasher(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="w-full max-w-2xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden p-8"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex gap-4">
                                    <div className="h-16 w-16 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center font-black text-lg">
                                        {viewingWasher.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900">{viewingWasher.name}</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="success" className="uppercase font-black text-[9px] px-2 py-0.5">Approved</Badge>
                                            <span className="text-[10px] text-slate-400 font-bold">Washer ID: WS-{viewingWasher.id.slice(-6).toUpperCase()}</span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setViewingWasher(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mobile Number</p>
                                    <p className="text-xs font-bold text-slate-800">{viewingWasher.phone}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                                    <p className="text-xs font-bold text-slate-800">{viewingWasher.email}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detailing Experience</p>
                                    <p className="text-xs font-bold text-slate-800">{viewingWasher.experience}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Operation Location</p>
                                    <p className="text-xs font-bold text-slate-800">{viewingWasher.location}</p>
                                </div>
                            </div>

                            {viewingWasher.experienceDetails && (
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Experience details</p>
                                    <p className="text-xs font-medium text-slate-600 leading-relaxed">{viewingWasher.experienceDetails}</p>
                                </div>
                            )}

                            <button 
                                onClick={() => handleAction('delete', viewingWasher)}
                                className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-black text-xs uppercase tracking-widest transition-colors"
                            >
                                DEACTIVATE PARTNER
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Edit Modal */}
            <AnimatePresence>
                {isEditModalOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                            onClick={() => setIsEditModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="w-full max-w-md relative z-10 bg-white rounded-3xl p-6 shadow-2xl"
                        >
                            <h3 className="text-base font-black text-slate-900 mb-4">Edit Washer Details</h3>
                            <form onSubmit={handleEditSubmit} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Full Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={formState.name}
                                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Contact Phone</label>
                                    <input
                                        required
                                        type="text"
                                        value={formState.phone}
                                        onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Operating Location</label>
                                    <input
                                        required
                                        type="text"
                                        value={formState.location}
                                        onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
                                    />
                                </div>
                                <button type="submit" className="w-full py-3.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all mt-4">
                                    SAVE CHANGES
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ActiveWashers;
