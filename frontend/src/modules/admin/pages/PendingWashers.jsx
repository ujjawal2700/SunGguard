/**
 * CAR WASH FEATURE DISABLED — not wired into admin routes.
 */
import React, { useState, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    Search,
    Filter,
    CheckCircle,
    XCircle,
    FileSearch,
    Phone,
    Mail,
    Sparkles,
    MapPin,
    Calendar,
    RotateCw,
    Check,
    X,
    Clock,
    Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const PendingWashers = () => {
    const [pendingWashers, setPendingWashers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewingWasher, setViewingWasher] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch Pending Washers
    const fetchPendingWashers = async () => {
        setIsLoading(true);
        try {
            const params = {};
            if (searchTerm.trim()) params.search = searchTerm.trim();
            const response = await adminApi.getDeliveryPartners(params);
            const payload = response.data.result || {};
            const list = Array.isArray(payload.items) ? payload.items : (response.data.results || []);

            // Filter for car wash service only and map
            const mappedWashers = list
                .filter(r => r.isCarWashService)
                .map(r => ({
                    id: r._id,
                    name: r.name,
                    phone: r.phone,
                    email: r.email,
                    appliedDate: new Date(r.createdAt).toLocaleDateString(),
                    location: r.address || r.currentArea || 'Unknown',
                    vehicle: r.vehicleType,
                    documents: Object.keys(r.documents || {}).filter(key => r.documents[key]),
                    documentsRaw: r.documents || {},
                    status: r.isVerified ? 'approved' : 'pending_review',
                    experience: r.experience || 'Not Specified',
                    experienceDetails: r.experienceDetails || '',
                    preferredArea: r.address || r.currentArea || 'Not Specified',
                    isCarWashService: r.isCarWashService,
                    isParcelService: r.isParcelService
                }));

            console.log('mappedWashers:', mappedWashers);
            setPendingWashers(mappedWashers);
        } catch (error) {
            console.error('Fetch Pending Washers Error:', error);
            toast.error('Failed to load applications');
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        const timer = setTimeout(() => {
            fetchPendingWashers();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, filterStatus]);

    const filteredWashers = useMemo(() => {
        return pendingWashers.filter(w => {
            const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.phone.includes(searchTerm);
            const matchesStatus = 
                filterStatus === 'all' || 
                w.status === filterStatus ||
                (filterStatus === 'pending' && w.status === 'pending_review');
            return matchesSearch && matchesStatus;
        });
    }, [pendingWashers, searchTerm, filterStatus]);

    const handleApprove = async (id) => {
        setIsProcessing(true);
        try {
            await adminApi.approveDeliveryPartner(id);
            toast.success('Car Wash Partner Approved & Activated!');
            setPendingWashers(pendingWashers.filter(w => w.id !== id));
            setViewingWasher(null);
        } catch (error) {
            console.error('Approval Error:', error);
            toast.error('Failed to approve partner');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async (id) => {
        if (window.confirm('Are you sure you want to reject this washer application?')) {
            setIsProcessing(true);
            try {
                await adminApi.rejectDeliveryPartner(id);
                toast.success('Application Rejected');
                setPendingWashers(pendingWashers.filter(w => w.id !== id));
                setViewingWasher(null);
            } catch (error) {
                console.error('Rejection Error:', error);
                toast.error('Failed to reject application');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Washer Applications
                        <Badge variant="info" className="text-[10px] px-2 py-0.5 uppercase">Pending Review</Badge>
                    </h1>
                    <p className="ds-description mt-1">Review documents and detailing experience for new door step car wash agents.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={fetchPendingWashers}
                        className="p-3 bg-white ring-1 ring-slate-200 rounded-2xl text-slate-400 hover:text-primary transition-all shadow-sm active:rotate-180 duration-500"
                    >
                        <RotateCw className="h-5 w-5" />
                    </button>
                    <div className="h-10 w-[1px] bg-slate-200 mx-2" />
                    <div className="flex flex-col items-end">
                        <p className="ds-label">Total Pending</p>
                        <h4 className="ds-h2">{pendingWashers.filter(w => w.status === 'pending_review').length}</h4>
                    </div>
                </div>
            </div>

            {/* Utility Bar */}
            <Card className="p-4 border-none shadow-sm ring-1 ring-slate-100 bg-white/50 backdrop-blur-xl">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400 group-focus-within:text-cyan-500 transition-colors" />
                        <input
                          type="text"
                          placeholder="Search washers by name or mobile..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-12 pr-4 py-3.5 bg-slate-100/50 border-none rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-cyan-500/10 transition-all"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="bg-slate-100/50 p-1 rounded-2xl flex items-center">
                            {['all', 'pending', 'missing_info'].map((status) => (
                                <button
                                  key={status}
                                  onClick={() => setFilterStatus(status)}
                                  className={cn(
                                        "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                        filterStatus === status
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {status === 'pending' ? 'PENDING' : status.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Applications Table View */}
            <Card className="border-none shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white rounded-xl relative min-h-[400px]">
                {isLoading && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-10 w-10 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Applications...</p>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="ds-table-header-cell px-8">Applicant Details</th>
                                <th className="ds-table-header-cell px-8">Detailing Experience</th>
                                <th className="ds-table-header-cell px-8">Operational Area</th>
                                <th className="ds-table-header-cell px-8">
                                    <div className="flex justify-center">Action</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {!isLoading && filteredWashers.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="py-20 text-center">
                                        <FileSearch className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                                        <p className="text-sm font-bold text-slate-500">No pending washer applications found.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredWashers.map((washer) => (
                                    <tr key={washer.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold text-sm ring-2 ring-white shadow-sm">
                                                    {washer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-900">{washer.name}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Phone className="h-3 w-3 text-slate-400" />
                                                        <span className="text-[10px] font-bold text-slate-500">{washer.phone}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <Briefcase className="h-4 w-4 text-cyan-500" />
                                                <div>
                                                    <span className="text-xs font-black block">{washer.experience}</span>
                                                    {washer.experienceDetails && (
                                                        <span className="text-[10px] text-slate-400 font-bold block max-w-xs truncate">{washer.experienceDetails}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="text-xs font-bold">{washer.location}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                  onClick={() => setViewingWasher(washer)}
                                                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                                >
                                                    Review Details
                                                </button>
                                                {washer.status === 'pending_review' ? (
                                                    <>
                                                        <button
                                                          onClick={() => handleApprove(washer.id)}
                                                          className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl transition-all"
                                                          title="Approve Partner"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                          onClick={() => handleReject(washer.id)}
                                                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all"
                                                          title="Reject Application"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="px-2.5 py-1 bg-emerald-100/60 text-emerald-700 text-[9px] font-black uppercase rounded-lg tracking-wider">
                                                        Approved
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Application Detail Sliding/Modal Sheet */}
            <AnimatePresence>
                {viewingWasher && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-end">
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                          onClick={() => setViewingWasher(null)}
                        />
                        <motion.div
                          initial={{ x: '100%' }}
                          animate={{ x: 0 }}
                          exit={{ x: '100%' }}
                          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                          className="w-full max-w-2xl h-full relative z-10 bg-slate-50 shadow-2xl flex flex-col justify-between"
                        >
                            {/* Left: Metadata Details */}
                            <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-8">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="h-16 w-16 bg-cyan-100 text-cyan-700 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner">
                                            {viewingWasher.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black text-slate-900">{viewingWasher.name}</h2>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mt-0.5">Applied on {viewingWasher.appliedDate}</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setViewingWasher(null)} 
                                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white rounded-2rem p-5 shadow-sm border border-slate-100 space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contact Records</h4>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                                                <Phone className="h-4 w-4 text-cyan-500" />
                                                <span>{viewingWasher.phone}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                                                <Mail className="h-4 w-4 text-cyan-500" />
                                                <span>{viewingWasher.email}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-2rem p-5 shadow-sm border border-slate-100 space-y-4">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Detailing Experience</h4>
                                        <div className="space-y-2">
                                            <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-cyan-500" />
                                                <span>{viewingWasher.experience}</span>
                                            </div>
                                            {viewingWasher.experienceDetails && (
                                                <p className="text-[11px] font-bold text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                                    {viewingWasher.experienceDetails}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2rem p-6 shadow-sm border border-slate-100 space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Submitted Documents</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        {viewingWasher.documents.map((doc, idx) => {
                                            const isObj = doc && typeof doc === 'object';
                                            const docKey = isObj ? (doc.name || '') : doc;
                                            const docUrl = isObj ? doc.url : (viewingWasher.documentsRaw?.[docKey] || '');
                                            const docName = docKey.toUpperCase();
                                            return (
                                                <a 
                                                    key={idx} 
                                                    href={docUrl} 
                                                    target="_blank" 
                                                    rel="noreferrer" 
                                                    className="group relative aspect-[4/3] bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden cursor-pointer hover:border-cyan-500 transition-all flex flex-col items-center justify-center"
                                                >
                                                    {docUrl ? (
                                                        <img 
                                                            src={docUrl} 
                                                            alt={docName} 
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                    ) : (
                                                        <FileSearch className="h-8 w-8 text-slate-400 group-hover:text-cyan-600 transition-colors" />
                                                    )}
                                                    <div className="absolute inset-x-0 bottom-0 bg-slate-900/60 backdrop-blur-sm py-1.5 px-3 flex items-center justify-between">
                                                        <span className="text-[9px] font-black text-white uppercase tracking-wider">{docName}</span>
                                                        <span className="text-[8px] font-bold text-cyan-300 uppercase">Click to Zoom</span>
                                                    </div>
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Sticky footer actions */}
                            {viewingWasher.status === 'pending_review' && (
                                <div className="bg-white border-t border-slate-100 p-6 flex gap-4">
                                    <button
                                      disabled={isProcessing}
                                      onClick={() => handleApprove(viewingWasher.id)}
                                      className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isProcessing ? 'Processing Approval...' : 'Approve & Activate Agent'}
                                    </button>
                                    <button
                                      disabled={isProcessing}
                                      onClick={() => handleReject(viewingWasher.id)}
                                      className="py-4 px-6 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-black text-xs uppercase tracking-widest transition-colors disabled:opacity-50"
                                    >
                                        Reject Application
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PendingWashers;
