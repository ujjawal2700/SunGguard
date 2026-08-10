import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Home, ChevronLeft, MapPinOff } from "lucide-react";

const NotFoundPage = ({ homePath = "/", compact = false }) => {
  const navigate = useNavigate();

  return (
    <div
      className={`flex items-center justify-center font-outfit ${
        compact ? "min-h-[60vh] p-6" : "min-h-screen bg-slate-50 p-6"
      }`}
    >
      <div className="max-w-md w-full bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-slate-100 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <MapPinOff size={36} className="text-primary" />
        </div>

        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
          Error 404
        </p>
        <h1 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">
          Page Not Found
        </h1>
        <p className="text-slate-500 mb-8 leading-relaxed text-sm">
          The page you are looking for does not exist or may have been moved.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-12 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition"
          >
            <ChevronLeft size={18} />
            Go Back
          </button>
          <Link
            to={homePath}
            className="h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm flex items-center justify-center gap-2 transition"
          >
            <Home size={18} />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
