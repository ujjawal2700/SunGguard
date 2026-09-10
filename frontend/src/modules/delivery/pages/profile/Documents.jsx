import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileCheck, Eye, X } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { useAuth } from "@core/context/AuthContext";

/**
 * Only the three documents actually collected at onboarding (see
 * signupDelivery in backend/app/controller/deliveryAuthController.js —
 * aadhar/pan/dl are the only files it accepts and stores under
 * `documents.{aadhar,pan,drivingLicense}`). Police Clearance and Bank
 * Passbook were never part of that form, so there is nothing real to show
 * for them.
 */
const DOC_TYPES = [
  { key: "aadhar", title: "Aadhar Card" },
  { key: "pan", title: "PAN Card" },
  { key: "drivingLicense", title: "Driving License" },
];

const isPdf = (url) => /\.pdf(\?|$)/i.test(url);

const Documents = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewingDoc, setViewingDoc] = useState(null);

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const docs = DOC_TYPES.map((type) => ({
    ...type,
    fileUrl: user?.documents?.[type.key] || "",
  }));

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">My Documents</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {docs.map((doc) => (
          <Card key={doc.key} className="p-4 border border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-gray-800">{doc.title}</h4>
              {doc.fileUrl ? (
                <span className="flex items-center text-brand-600 bg-brand-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                  <FileCheck size={12} className="mr-1" /> On File
                </span>
              ) : (
                <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                  Not Uploaded
                </span>
              )}
            </div>

            {doc.fileUrl && user?.createdAt && (
              <p className="text-xs text-gray-500 mb-3">
                Submitted with application • {formatDate(user.createdAt)}
              </p>
            )}

            {doc.fileUrl && (
              <Button
                size="sm"
                className="w-full text-xs h-8"
                onClick={() => setViewingDoc(doc)}
              >
                <Eye size={14} className="mr-1" /> View File
              </Button>
            )}
          </Card>
        ))}
      </div>

      {/* Inline viewer — stays on this page rather than opening a new tab */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col">
          <div className="flex items-center justify-between p-4 bg-white shrink-0">
            <h2 className="font-bold text-gray-900 truncate pr-3">{viewingDoc.title}</h2>
            <button
              onClick={() => setViewingDoc(null)}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors shrink-0"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {isPdf(viewingDoc.fileUrl) ? (
              <iframe
                src={viewingDoc.fileUrl}
                title={viewingDoc.title}
                className="w-full h-full bg-white rounded"
              />
            ) : (
              <img
                src={viewingDoc.fileUrl}
                alt={viewingDoc.title}
                className="max-w-full max-h-full object-contain rounded"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
