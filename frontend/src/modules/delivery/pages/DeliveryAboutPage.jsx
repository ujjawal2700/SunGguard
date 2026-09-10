import React from 'react';
import { ChevronLeft, Truck, Heart, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@core/context/SettingsContext';

/**
 * About Us page for Delivery Boys.
 * Content is authored by admin via Settings → Legal Content → Delivery Boy → About Us.
 * Falls back to a delivery-partner-specific static layout if no CMS content exists.
 */
const DeliveryAboutPage = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const cmsContent = settings?.legalContent?.deliveryAboutUs || '';

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-24">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">About Us</h1>
            </div>

            <div className="px-4 pt-1 max-w-3xl mx-auto space-y-4">

                {cmsContent ? (
                    /* Admin-authored content from CMS */
                    <>
                        <div className="rounded-xl p-5 text-center bg-white border border-slate-200">
                            <div className="flex flex-col items-center">
                                <div className="bg-amber-50 p-3 rounded-lg mb-3">
                                    <Truck size={24} className="text-amber-600" />
                                </div>
                                <h2 className="text-xl font-semibold mb-1 tracking-tight text-slate-900">{appName}</h2>
                                <p className="text-slate-500 text-xs font-medium">Delivery Partner Programme</p>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-slate-200">
                            <div
                                className="prose prose-slate prose-sm max-w-none text-slate-600"
                                dangerouslySetInnerHTML={{ __html: cmsContent }}
                            />
                        </div>
                    </>
                ) : (
                    /* Fallback: delivery-partner specific static content */
                    <>
                        <div className="rounded-xl p-5 text-center bg-white border border-slate-200">
                            <div className="flex flex-col items-center">
                                <div className="bg-amber-50 p-3 rounded-lg mb-3">
                                    <Truck size={24} className="text-amber-600" />
                                </div>
                                <h2 className="text-xl font-semibold mb-1 tracking-tight text-slate-900">{appName}</h2>
                                <p className="text-slate-600 text-sm max-w-sm mx-auto">Empowering delivery partners with fair pay and flexible hours.</p>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                                    <Star size={18} />
                                </div>
                                <h3 className="text-base font-semibold text-slate-800">Our Promise to You</h3>
                            </div>
                            <p className="text-slate-600 leading-relaxed text-sm">
                                We believe our delivery partners are the backbone of our service. We are committed to providing a transparent, rewarding, and safe working experience.
                            </p>
                        </div>

                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                                    <Heart size={18} />
                                </div>
                                <h3 className="text-base font-semibold text-slate-800">Partner Benefits</h3>
                            </div>
                            <ul className="space-y-3 text-sm text-slate-600">
                                <li className="flex gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300 mt-2 flex-shrink-0" />
                                    <span><strong>Flexible Hours:</strong> Work at your own pace and schedule.</span>
                                </li>
                                <li className="flex gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300 mt-2 flex-shrink-0" />
                                    <span><strong>Instant Payouts:</strong> Get your earnings transferred quickly.</span>
                                </li>
                                <li className="flex gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300 mt-2 flex-shrink-0" />
                                    <span><strong>24/7 Support:</strong> Our team is always here when you need help.</span>
                                </li>
                            </ul>
                        </div>
                    </>
                )}

                <div className="text-center pt-2">
                    <p className="text-xs text-slate-400">© {new Date().getFullYear()} {appName}. All rights reserved.</p>
                </div>

            </div>
        </div>
    );
};

export default DeliveryAboutPage;
