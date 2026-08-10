import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, ChevronLeft, Wallet } from 'lucide-react';
import { customerApi } from '../services/customerApi';

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const WalletPage = () => {
    const navigate = useNavigate();
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [profileRes, txRes] = await Promise.all([
                    customerApi.getProfile(),
                    customerApi.getWalletTransactions({ limit: 50 }),
                ]);
                const profile = profileRes.data?.result ?? profileRes.data?.data ?? profileRes.data;
                setBalance(profile?.walletBalance ?? 0);

                const payload = txRes.data?.result ?? txRes.data?.data ?? {};
                const items = Array.isArray(payload.items) ? payload.items : [];
                setTransactions(items);
            } catch (err) {
                console.error('Wallet fetch error:', err);
                setBalance(0);
                setTransactions([]);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Wallet</h1>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-1 relative z-20 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Available Balance</p>
                    <h2 className="text-3xl font-semibold text-slate-900 mt-1">
                        {loading ? '...' : `₹${(balance || 0).toLocaleString('en-IN')}`}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Refunds and wallet payments show in history below</p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-800">Transaction History</h3>
                        <Wallet size={18} className="text-slate-400" />
                    </div>

                    {loading ? (
                        <div className="py-12 flex justify-center text-slate-400 text-sm font-semibold">
                            Loading...
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                            <p className="text-sm font-semibold text-slate-500 mb-1">No wallet activity yet</p>
                            <p className="text-xs text-slate-400">
                                Credits (refunds) and wallet payments will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {transactions.map((tx) => (
                                <div key={tx._id} className="px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${tx.type === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-700'}`}>
                                            {tx.type === 'credit' ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-semibold text-slate-800 text-sm truncate">{tx.title}</h4>
                                            <p className="text-[11px] text-slate-500">{formatDate(tx.date)}</p>
                                            {tx.orderId && (
                                                <p className="text-[10px] text-slate-500">#{tx.orderId}</p>
                                            )}
                                            {!tx.orderId && tx.reference ? (
                                                <p className="text-[10px] text-slate-400 truncate">{tx.reference}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className={`text-sm font-semibold shrink-0 ml-3 ${tx.type === 'credit' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        {tx.type === 'credit' ? '+' : '-'}₹{(tx.amount || 0).toLocaleString('en-IN')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WalletPage;
