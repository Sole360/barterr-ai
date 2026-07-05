import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { AlertTriangle, ArrowLeft, Send, ShieldAlert } from "lucide-react";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useMessages } from "@/lib/firebase/useMessages";
import { sendMessage } from "@/lib/messages/sendMessage";
import { isOffPlatformAsync } from "@/lib/messages/contentFilter";
import { logFlaggedAttempt } from "@/lib/messages/logFlaggedAttempt";
import { Navbar } from "@/components/shared/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type OtherUser = { displayName: string; photoURL?: string };

// ─── Message bubble ───────────────────────────────────────────────────────────

function formatMessageTime(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const date = ts.toDate();
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return time;

  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${dateStr}, ${time}`;
}

function MessageBubble({
  text,
  isMine,
  createdAt,
}: {
  text: string;
  isMine: boolean;
  createdAt: { toDate: () => Date } | null;
}) {
  return (
    <div className={`flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isMine
            ? "bg-gradient-to-br from-[#3366FF] to-[#33C9BC] text-white rounded-br-sm"
            : "bg-card border border-border text-foreground rounded-bl-sm"
        }`}
      >
        {text}
      </div>
      {createdAt && (
        <span className="text-[10px] text-muted-foreground px-1">
          {formatMessageTime(createdAt)}
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const MessageThreadPage = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();

  const uid = currentUser?.uid ?? "";

  // Other user — from nav state (fast path) or derived + fetched
  const [otherUser, setOtherUser] = useState<OtherUser | null>(
    (location.state as { otherUser?: OtherUser } | null)?.otherUser ?? null
  );
  const [otherUserId, setOtherUserId] = useState<string>(
    (location.state as { otherUserId?: string } | null)?.otherUserId ?? ""
  );

  // If we don't have other user info from state, derive from conversationId
  useEffect(() => {
    if (otherUser && otherUserId) return;
    if (!conversationId || !uid) return;

    const parts = conversationId.split("_");
    const derivedOtherId = parts.find((p) => p !== uid) ?? "";
    setOtherUserId(derivedOtherId);

    if (derivedOtherId && !otherUser) {
      getDoc(doc(db, "users", derivedOtherId)).then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setOtherUser({ displayName: d.displayName ?? "User", photoURL: d.photoURL });
        }
      });
    }
  }, [conversationId, uid, otherUser, otherUserId]);

  const { messages, loading } = useMessages(conversationId, uid);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const doSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || !uid || !otherUserId) return;

    // Hard block — check structural + custom Firestore terms
    if (await isOffPlatformAsync(trimmed)) {
      setBlocked(true);
      logFlaggedAttempt({
        senderId: uid,
        conversationId,
        participants: [uid, otherUserId],
        attemptedText: trimmed,
      });
      return;
    }

    setSending(true);
    setBlocked(false);
    try {
      await sendMessage({
        conversationId,
        senderId: uid,
        senderInfo: {
          displayName: userProfile?.displayName ?? currentUser?.displayName ?? "User",
          photoURL: userProfile?.photoURL,
        },
        receiverId: otherUserId,
        receiverInfo: {
          displayName: otherUser?.displayName ?? "User",
          photoURL: otherUser?.photoURL,
        },
        text: trimmed,
      });
      setText("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("sendMessage error:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (blocked) setBlocked(false);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const otherName = otherUser?.displayName ?? "User";
  const otherInitials = otherName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Chat header */}
      <div className="fixed top-16 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/messages")}
            className="shrink-0 p-1.5 rounded-full hover:bg-accent transition-colors text-muted-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => otherUserId && navigate(`/profile/${otherUserId}`)}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={otherUser?.photoURL} alt={otherName} className="object-cover" />
              <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-[#33FF99]/60 to-[#3366FF]/60">
                {otherInitials || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold text-foreground">{otherName}</span>
          </button>
        </div>
      </div>

      {/* Safety banner */}
      <div className="fixed top-[7.5rem] left-0 right-0 z-20 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
        <div className="mx-auto max-w-2xl px-4 py-2 flex items-start gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
            Keep your transaction on Barterr. Never share personal info, payment details, or contact info outside the platform.
          </p>
        </div>
      </div>

      {/* Messages area — pt accounts for Navbar (64px) + chat header (56px) + banner (~40px) */}
      <div className="flex-1 overflow-y-auto pt-[10.5rem] pb-28 px-4">
        <div className="mx-auto max-w-2xl space-y-3 py-4">
          {loading && (
            <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>
          )}

          {!loading && messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              <div className="text-2xl mb-2">👋</div>
              Say hello to {otherName}!
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              text={msg.text}
              isMine={msg.senderId === uid}
              createdAt={msg.createdAt}
            />
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="mx-auto max-w-2xl space-y-2">
          {/* Hard block warning */}
          {blocked && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-red-800 dark:text-red-300">
                  Message blocked
                </div>
                <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                  Your message appears to contain contact info, payment details, or references to external platforms. Off-platform transactions violate Barterr's Terms of Service. Please edit your message.
                </div>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Type your message…"
              className="flex-1 resize-none rounded-2xl border border-border bg-card text-foreground text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40 placeholder:text-muted-foreground overflow-hidden"
              style={{ height: "42px" }}
            />
            <button
              type="button"
              onClick={() => doSend()}
              disabled={!text.trim() || sending}
              className="shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-[#3366FF] to-[#33C9BC] flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
