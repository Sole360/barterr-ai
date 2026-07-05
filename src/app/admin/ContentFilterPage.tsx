import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firebase/config";
import { bustContentFilterCache } from "@/lib/messages/contentFilter";
import { useToast } from "@/hooks/use-toast";

export const ContentFilterPage = () => {
  const { toast } = useToast();
  const [terms, setTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTerm, setNewTerm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "config", "contentFilter")).then((snap) => {
      setTerms(snap.data()?.customTerms ?? []);
      setLoading(false);
    });
  }, []);

  const save = async (updated: string[]) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "config", "contentFilter"), { customTerms: updated }, { merge: true });
      bustContentFilterCache();
      toast({ title: "Filter updated" });
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const term = newTerm.trim().toLowerCase();
    if (!term || terms.includes(term)) return;
    const updated = [...terms, term];
    setTerms(updated);
    setNewTerm("");
    await save(updated);
  };

  const remove = async (term: string) => {
    const updated = terms.filter((t) => t !== term);
    setTerms(updated);
    await save(updated);
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-[#3366FF]" />
        <h1 className="text-xl font-bold text-foreground">Content Filter</h1>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Custom terms block messages containing these words. Structural patterns (phone numbers, emails, URLs, payment platforms, social handles) are always enforced in code.
      </p>

      {/* Add new term */}
      <div className="flex gap-2 mb-5">
        <input
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a term or phrase…"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40"
        />
        <button
          type="button"
          onClick={add}
          disabled={!newTerm.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3366FF] text-white text-sm font-semibold hover:bg-[#3366FF]/90 transition-colors disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : terms.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No custom terms yet. Add one above.
        </div>
      ) : (
        <div className="space-y-2">
          {terms.map((term) => (
            <div key={term} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm font-mono text-foreground">{term}</span>
              <button
                type="button"
                onClick={() => remove(term)}
                disabled={saving}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
