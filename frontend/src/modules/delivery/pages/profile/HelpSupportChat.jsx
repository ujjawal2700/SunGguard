import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Send, Phone } from "lucide-react";
import { useSettings } from "@core/context/SettingsContext";
import { useAuth } from "@core/context/AuthContext";
import { toast } from "sonner";
import { deliveryApi } from "../../services/deliveryApi";
import { useSupportUnread } from "@core/context/SupportUnreadContext";
import {
  joinTicketRoom,
  leaveTicketRoom,
  onTicketMessage,
} from "@/core/services/orderSocket";

function formatTime(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function normalizeTicketMessages(rawMessages = []) {
  const list = Array.isArray(rawMessages) ? rawMessages : [];
  return list.map((m, idx) => {
    const createdAt = m?.createdAt || null;
    return {
      id: m?._id || m?.id || `${createdAt || Date.now()}-${idx}`,
      text: m?.text || "",
      mediaUrl: m?.mediaUrl || "",
      sender: m?.isAdmin ? "support" : "user",
      createdAt,
      time: formatTime(createdAt),
    };
  });
}

function mergeIncomingMessage(prev, incoming) {
  const next = Array.isArray(prev) ? prev : [];
  if (!incoming) return next;

  const last = next[next.length - 1];
  if (
    last &&
    last.text === incoming.text &&
    String(last.mediaUrl || "") === String(incoming.mediaUrl || "") &&
    last.sender === incoming.sender &&
    (last.createdAt && incoming.createdAt ? last.createdAt === incoming.createdAt : true)
  ) {
    return next;
  }

  return [...next, incoming];
}

const WELCOME_MESSAGES = (appName) => [
  { id: "welcome-1", text: `Hi there! 👋 Welcome to ${appName} rider support.`, sender: "support", time: "" },
  { id: "welcome-2", text: "Send a message and an admin will reply here.", sender: "support", time: "" },
];

const HelpSupportChat = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { token } = useAuth();
  const { setIsViewingSupportChat, setActiveTicketId, markTicketRead } = useSupportUnread();

  const appName = settings?.appName || "App";
  const supportPhone = String(settings?.supportPhone || "").trim();
  const supportPhoneHref = supportPhone ? `tel:${supportPhone.replace(/(?!^\+)[^\d]/g, "")}` : "";

  const [ticketId, setTicketId] = useState(null);
  const ticketIdRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  const getToken = useMemo(() => () => token, [token]);

  useEffect(() => {
    setIsViewingSupportChat(true);
    return () => {
      setIsViewingSupportChat(false);
      setActiveTicketId("");
    };
  }, [setIsViewingSupportChat, setActiveTicketId]);

  useEffect(() => {
    ticketIdRef.current = ticketId;
  }, [ticketId]);

  useEffect(() => {
    const tid = ticketId ? String(ticketId).trim() : "";
    setActiveTicketId(tid);
    if (tid) markTicketRead(tid);
  }, [ticketId, setActiveTicketId, markTicketRead]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;

    async function loadLatestTicket() {
      try {
        setIsLoading(true);
        const res = await deliveryApi.getMyTickets();
        const raw = res?.data?.result;
        const tickets = Array.isArray(raw) ? raw : Array.isArray(res?.data?.results) ? res.data.results : [];

        const active =
          tickets.find((t) => String(t?.status || "").toLowerCase() !== "closed") || tickets[0] || null;

        if (!mounted) return;

        if (active?._id) {
          setTicketId(active._id);
          joinTicketRoom(active._id, getToken);
          setMessages(normalizeTicketMessages(active.messages));
        } else {
          setTicketId(null);
          setMessages(WELCOME_MESSAGES(appName));
        }
      } catch {
        if (!mounted) return;
        toast.error("Failed to load support chat");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadLatestTicket();

    return () => {
      mounted = false;
      const current = ticketIdRef.current;
      if (current) leaveTicketRoom(current, getToken);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const off = onTicketMessage(getToken, (payload) => {
      const current = ticketIdRef.current;
      if (!current) return;
      if (String(payload?.ticketId || "") !== String(current)) return;

      const incoming = {
        id: payload?.message?._id || payload?.message?.id || `${payload?.message?.createdAt || Date.now()}`,
        text: payload?.message?.text || "",
        mediaUrl: payload?.message?.mediaUrl || "",
        sender: payload?.message?.isAdmin ? "support" : "user",
        createdAt: payload?.message?.createdAt || null,
        time: formatTime(payload?.message?.createdAt),
      };

      setMessages((prev) => mergeIncomingMessage(prev, incoming));
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = String(inputText || "").trim();
    if (!text || isSending) return;

    try {
      setIsSending(true);

      if (!ticketIdRef.current) {
        const res = await deliveryApi.createTicket({
          subject: "Support Chat",
          description: text,
          priority: "medium",
          category: "other",
        });
        const ticket = res?.data?.result;
        if (ticket?._id) {
          setTicketId(ticket._id);
          ticketIdRef.current = ticket._id;
          joinTicketRoom(ticket._id, getToken);
          setMessages(normalizeTicketMessages(ticket.messages));
        }
      } else {
        const res = await deliveryApi.replyTicket(ticketIdRef.current, text);
        const ticket = res?.data?.result;
        if (ticket?.messages) {
          setMessages(normalizeTicketMessages(ticket.messages));
        }
      }

      setInputText("");
    } catch {
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col z-[999] overflow-hidden">
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-100 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-slate-50 transition-colors text-slate-600"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-base font-black text-slate-800 leading-none">Rider Support</h1>
            <p className="text-[10px] text-brand-600 font-bold mt-1 uppercase tracking-wider flex items-center gap-1">
              <span className="h-1 w-1 bg-brand-500 rounded-full"></span>
              Online
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {supportPhoneHref ? (
            <a
              href={supportPhoneHref}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              aria-label={`Call support at ${supportPhone}`}
            >
              <Phone size={20} />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 space-y-6 min-h-0 overscroll-contain touch-pan-y">
        {isLoading && <div className="text-center text-xs font-bold text-slate-400">Loading chat…</div>}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] relative group ${msg.sender === "user" ? "items-end" : "items-start"} flex flex-col`}>
              <div
                className={`px-4 py-3 rounded-2xl shadow-sm border text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-primary text-primary-foreground border-black/25 rounded-tr-none"
                    : "bg-white text-slate-700 border-slate-800/40 rounded-tl-none"
                }`}
              >
                {msg.mediaUrl ? (
                  <img src={msg.mediaUrl} alt="Attachment" loading="lazy" className="max-w-[220px] w-full rounded-xl border border-black/10" />
                ) : null}
                {msg.text ? <div className={msg.mediaUrl ? "mt-2" : ""}>{msg.text}</div> : null}
              </div>
              {msg.time ? (
                <span className={`text-[10px] text-slate-400 mt-1 px-1 font-medium ${msg.sender === "user" ? "text-right" : "text-left"}`}>
                  {msg.time}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white p-3 border-t border-slate-100 shrink-0 z-30 safe-area-bottom relative mb-4">
        <div className="flex items-end gap-2 bg-slate-50 p-2 rounded-[1.5rem] border-2 border-slate-800/70 focus-within:border-slate-900 focus-within:shadow-[0_0_0_4px_rgba(15,23,42,0.08)] transition-all">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            className="bg-transparent text-sm w-full py-2.5 px-3 outline-none text-slate-700 placeholder:text-slate-400 font-medium"
          />
          <button
            onClick={handleSend}
            disabled={!String(inputText || "").trim() || isSending}
            className="p-2.5 rounded-full bg-primary text-primary-foreground hover:bg-[var(--brand-400)] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-200 flex-shrink-0"
          >
            <Send size={20} className="ml-0.5" />
          </button>
        </div>
      </div>

      <style>
        {`
          .safe-area-bottom {
            padding-bottom: env(safe-area-inset-bottom);
          }
        `}
      </style>
    </div>
  );
};

export default HelpSupportChat;
