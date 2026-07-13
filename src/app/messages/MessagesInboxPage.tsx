import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { PenSquare, Search } from "lucide-react";

import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useConversations } from "@/lib/firebase/useConversations";
import { getConversationId } from "@/lib/messages/getConversationId";
import { searchClient, ALGOLIA_USERS_INDEX } from "@/lib/algolia/config";
import { Navbar } from "@/components/shared/Navbar";
import { PageTransition } from "@/components/shared/PageTransition";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TradeDocument } from "@/types";

type ContactSnap = { uid: string; displayName: string; photoURL?: string };

// ─── Relative timestamp ───────────────────────────────────────────────────────

function relativeTime(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const date = ts.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── New Conversation Dialog ──────────────────────────────────────────────────

function NewConversationDialog({
  open,
  onClose,
  currentUid,
  onSelectUser,
}: {
  open: boolean;
  onClose: () => void;
  currentUid: string;
  onSelectUser: (contact: ContactSnap) => void;
}) {
  const [search, setSearch] = useState("");
  const [tradePartners, setTradePartners] = useState<ContactSnap[]>([]);
  const [algoliaResults, setAlgoliaResults] = useState<ContactSnap[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trade partners once on open
  useEffect(() => {
    if (!open || !currentUid) return;
    setLoadingContacts(true);

    const load = async () => {
      const tradesRef = collection(db, "trades");
      const [sentSnap, receivedSnap] = await Promise.all([
        getDocs(query(tradesRef, where("fromUserId", "==", currentUid), orderBy("createdAt", "desc"))),
        getDocs(query(tradesRef, where("toUserId", "==", currentUid), orderBy("createdAt", "desc"))),
      ]);

      const otherIds = new Set<string>();
      for (const d of [...sentSnap.docs, ...receivedSnap.docs]) {
        const t = d.data() as TradeDocument;
        const otherId = t.fromUserId === currentUid ? t.toUserId : t.fromUserId;
        if (otherId) otherIds.add(otherId);
      }

      const snaps = await Promise.all([...otherIds].map((id) => getDoc(doc(db, "users", id))));
      const result: ContactSnap[] = [];
      for (const snap of snaps) {
        if (snap.exists()) {
          const d = snap.data();
          result.push({ uid: snap.id, displayName: d.displayName ?? "User", photoURL: d.photoURL });
        }
      }
      setTradePartners(result);
      setLoadingContacts(false);
    };

    load();
  }, [open, currentUid]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setAlgoliaResults([]);
    }
  }, [open]);

  // Debounced Algolia search
  useEffect(() => {
    const trimmed = search.trim();

    if (trimmed.length < 2) {
      setAlgoliaResults([]);
      setLoadingSearch(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    setLoadingSearch(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await searchClient.search({
          requests: [{ indexName: ALGOLIA_USERS_INDEX, query: trimmed, hitsPerPage: 10 }],
        });
        const hits = (response.results[0] as { hits: Array<{ objectID: string; displayName?: string; photoURL?: string }> }).hits;
        const results: ContactSnap[] = hits
          .filter((h) => h.objectID !== currentUid)
          .map((h) => ({
            uid: h.objectID,
            displayName: h.displayName ?? "User",
            photoURL: h.photoURL,
          }));
        setAlgoliaResults(results);
      } catch {
        setAlgoliaResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, currentUid]);

  const isSearching = search.trim().length >= 2;
  const displayList = isSearching ? algoliaResults : tradePartners;
  const isLoading = loadingContacts || (isSearching && loadingSearch);

  const renderRow = (c: ContactSnap) => (
    <button
      key={c.uid}
      type="button"
      onClick={() => {
        onSelectUser(c);
        onClose();
      }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-left"
    >
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={c.photoURL} alt={c.displayName} className="object-cover" />
        <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-[#33FF99]/60 to-[#3366FF]/60">
          {c.displayName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("")}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-semibold text-foreground">{c.displayName}</span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm bg-background [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>

        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {isSearching ? "Searching…" : "Loading contacts…"}
            </div>
          ) : displayList.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {isSearching ? "No users found." : "No trade partners yet."}
            </div>
          ) : (
            <>
              {!isSearching && (
                <p className="px-3 pb-1 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  Trade partners
                </p>
              )}
              {displayList.map(renderRow)}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const MessagesInboxPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { conversations, loading } = useConversations(currentUser?.uid);
  const [composeOpen, setComposeOpen] = useState(false);

  const uid = currentUser?.uid ?? "";

  const handleSelectContact = (contact: ContactSnap) => {
    const convId = getConversationId(uid, contact.uid);
    navigate(`/messages/${convId}`, {
      state: {
        otherUserId: contact.uid,
        otherUser: { displayName: contact.displayName, photoURL: contact.photoURL },
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <PageTransition>
        <main className="pt-20 pb-24 md:pb-10 px-4 mx-auto max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-foreground">Messages</h1>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="p-2 rounded-full hover:bg-accent transition-colors text-foreground"
              title="New message"
            >
              <PenSquare className="w-5 h-5" />
            </button>
          </div>

          {loading && (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}

          {!loading && conversations.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <div className="text-sm text-muted-foreground">
                No messages yet. Start a conversation from a trade or tap the compose button.
              </div>
            </div>
          )}

          <div className="space-y-2">
            {conversations.map((conv) => {
              const otherId = conv.participants.find((p) => p !== uid) ?? "";
              const other = conv.participantInfo?.[otherId];
              const otherName = other?.displayName ?? "User";
              const otherPhoto = other?.photoURL;
              const unread = (conv.unreadCount?.[uid] ?? 0) > 0;
              const initials = otherName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("");

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() =>
                    navigate(`/messages/${conv.id}`, {
                      state: {
                        otherUserId: otherId,
                        otherUser: { displayName: otherName, photoURL: otherPhoto },
                      },
                    })
                  }
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] hover:-translate-y-0.5 transition-all duration-200 text-left"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={otherPhoto} alt={otherName} className="object-cover" />
                      <AvatarFallback className="font-semibold bg-gradient-to-br from-[#33FF99]/60 to-[#3366FF]/60 text-foreground">
                        {initials || "?"}
                      </AvatarFallback>
                    </Avatar>
                    {unread && (
                      <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-[#3366FF] border-2 border-background" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${unread ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>
                      {otherName}
                    </div>
                    <div className={`mt-0.5 text-xs truncate ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {conv.lastMessage || "Say hello!"}
                    </div>
                  </div>

                  <div className="shrink-0 text-[10px] text-muted-foreground">
                    {relativeTime(conv.lastMessageAt)}
                  </div>
                </button>
              );
            })}
          </div>
        </main>
      </PageTransition>

      <NewConversationDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        currentUid={uid}
        onSelectUser={handleSelectContact}
      />
    </div>
  );
};
