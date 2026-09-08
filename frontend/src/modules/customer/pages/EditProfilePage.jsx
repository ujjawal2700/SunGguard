import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, Camera, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@core/context/AuthContext';
import compressImage from '@shared/utils/compressImage';
import { customerApi } from '../services/customerApi';

/** Mirrors the limits enforced in updateCustomerProfile on the server. */
const NAME_MAX_LENGTH = 50;
const NAME_MIN_LENGTH = 2;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const EditProfilePage = () => {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const fileRef = useRef(null);

    const [isLoading, setIsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [avatar, setAvatar] = useState(user?.avatar || '');
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
    });
    const [errors, setErrors] = useState({ name: '', email: '' });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: name === 'name' ? value.slice(0, NAME_MAX_LENGTH) : value,
        }));
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    };

    const validate = () => {
        const next = { name: '', email: '' };
        const name = formData.name.trim();
        const email = formData.email.trim();

        if (name.length < NAME_MIN_LENGTH) {
            next.name = `Name must be at least ${NAME_MIN_LENGTH} characters.`;
        } else if (name.length > NAME_MAX_LENGTH) {
            next.name = `Name cannot exceed ${NAME_MAX_LENGTH} characters.`;
        }
        // Email stays optional — but if one is given it has to be usable.
        if (email && !EMAIL_PATTERN.test(email)) {
            next.email = 'Enter a valid email address, e.g. name@example.com.';
        }

        setErrors(next);
        return !next.name && !next.email;
    };

    /**
     * Picking a photo used to do nothing at all: the button opened no file
     * dialog and the avatar was never sent. It now uploads immediately, so the
     * new picture is on the server before Save is pressed.
     */
    const handleAvatarPick = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.type?.startsWith('image/')) {
            toast.error('Choose an image file.');
            return;
        }
        if (file.size > AVATAR_MAX_BYTES) {
            toast.error('That image is larger than 5 MB.');
            return;
        }

        setUploading(true);
        try {
            const compressed = await compressImage(file, { maxEdge: 512, quality: 0.85 });
            const body = new FormData();
            body.append('file', compressed, file.name);
            const response = await customerApi.uploadMedia(body);
            const url =
                response.data?.result?.url ||
                response.data?.result?.secureUrl ||
                response.data?.url ||
                '';
            if (!url) throw new Error('Upload did not return an image URL');
            setAvatar(url);
            toast.success('Photo ready — press Save to apply it.');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Could not upload that photo');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setIsLoading(true);
        try {
            const response = await customerApi.updateProfile({
                name: formData.name.trim(),
                email: formData.email.trim(),
                avatar,
            });
            const updatedUser = response.data.result;

            // Update local auth state
            login({ ...user, ...updatedUser });

            toast.success('Profile updated successfully!');
            navigate('/profile');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    const fieldShell =
        'flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border transition-all focus-within:ring-4 focus-within:ring-primary/10';

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-10">
            {/* Header */}
            <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center gap-3 shadow-sm">
                <Link to="/profile" className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                    <ArrowLeft size={24} className="text-slate-600" />
                </Link>
                <h1 className="text-lg font-black text-slate-800">Edit Profile</h1>
            </div>

            <div className="max-w-xl mx-auto p-5">

                {/* Profile Picture Upload */}
                <div className="flex flex-col items-center mb-8">
                    <div className="relative">
                        <div className="h-28 w-28 rounded-full bg-slate-200 border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                            {avatar ? (
                                <img
                                    src={avatar}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    onError={() => setAvatar('')}
                                />
                            ) : (
                                <User size={48} className="text-slate-400" />
                            )}
                            {uploading && (
                                <div className="absolute inset-0 grid place-items-center rounded-full bg-slate-900/45">
                                    <Loader2 size={24} className="animate-spin text-white" />
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            aria-label="Change profile photo"
                            className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full border-2 border-white shadow-sm hover:bg-[#0a701a] transition-colors disabled:opacity-60"
                        >
                            <Camera size={18} />
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarPick}
                            className="hidden"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="mt-3 text-sm font-bold text-primary disabled:opacity-60"
                    >
                        {uploading ? 'Uploading…' : 'Change Photo'}
                    </button>
                </div>

                {/* Edit Form */}
                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
                        <div>
                            <div className="flex items-baseline justify-between mb-2">
                                <label htmlFor="name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
                                <span className="text-[11px] font-semibold text-slate-400 tabular-nums">
                                    {formData.name.length}/{NAME_MAX_LENGTH}
                                </span>
                            </div>
                            <div className={`${fieldShell} ${errors.name ? 'border-red-300 focus-within:border-red-400' : 'border-slate-200 focus-within:border-primary'}`}>
                                <User size={20} className="text-slate-400 shrink-0" />
                                <input
                                    id="name"
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    maxLength={NAME_MAX_LENGTH}
                                    aria-invalid={Boolean(errors.name)}
                                    className="bg-transparent w-full min-w-0 text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter your name"
                                />
                            </div>
                            {errors.name && <p className="mt-1.5 text-xs font-semibold text-red-500">{errors.name}</p>}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Phone Number</label>
                            <div className={`${fieldShell} border-slate-200 opacity-70`}>
                                <Phone size={20} className="text-slate-400 shrink-0" />
                                <input
                                    type="tel"
                                    name="phone"
                                    value={user?.phone ? `+91 ${user.phone}` : ''}
                                    readOnly
                                    disabled
                                    className="bg-transparent w-full min-w-0 text-slate-800 font-bold outline-none"
                                />
                            </div>
                            <p className="mt-1.5 text-xs font-medium text-slate-400">
                                Your number is how you sign in, so it can&apos;t be changed here.
                            </p>
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                            <div className={`${fieldShell} ${errors.email ? 'border-red-300 focus-within:border-red-400' : 'border-slate-200 focus-within:border-primary'}`}>
                                <Mail size={20} className="text-slate-400 shrink-0" />
                                <input
                                    id="email"
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    autoComplete="email"
                                    inputMode="email"
                                    aria-invalid={Boolean(errors.email)}
                                    className="bg-transparent w-full min-w-0 text-slate-800 font-bold outline-none placeholder:font-medium"
                                    placeholder="Enter email address"
                                />
                            </div>
                            {errors.email ? (
                                <p className="mt-1.5 text-xs font-semibold text-red-500">{errors.email}</p>
                            ) : (
                                <p className="mt-1.5 text-xs font-medium text-slate-400">Optional — used for order receipts.</p>
                            )}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || uploading}
                        className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-lg shadow-brand-200 hover:bg-[#0a701a] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save size={20} />
                        )}
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>

            </div>
        </div>
    );
};

export default EditProfilePage;
