import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
  deleteUser,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/contexts/auth.context";
import { useTour } from "@/lib/contexts/tour.context";
import { Navbar } from "@/components/shared/Navbar";
import { PageTransition } from "@/components/shared/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft, Bell, Lock, MapPin, PlayCircle } from "lucide-react";
import { usePlacesAutocomplete, type ParsedAddress } from "@/lib/hooks/usePlacesAutocomplete";

const Toggle = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
      checked ? "bg-[#3366FF]" : "bg-muted"
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
        checked ? "translate-x-5" : "translate-x-0"
      }`}
    />
  </button>
);

export const AccountSettingsPage = () => {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { startTour } = useTour();
  const { toast } = useToast();

  // Email change
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  // Notification prefs — sync from profile once loaded
  const [inAppNotifs, setInAppNotifs] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // Shipping address
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [addressSaving, setAddressSaving] = useState(false);

  const onAddressSelect = useCallback((parsed: ParsedAddress) => {
    setStreet(parsed.street);
    if (parsed.street2) setStreet2(parsed.street2);
    setCity(parsed.city);
    setState(parsed.state);
    setZip(parsed.zip);
  }, []);

  const { suggestions, fetchSuggestions, selectSuggestion, clearSuggestions } =
    usePlacesAutocomplete(onAddressSelect);

  const addressDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userProfile) return;
    setInAppNotifs(userProfile.notification ?? true);
    setEmailNotifs(userProfile.emailNotifications ?? true);
    const a = userProfile.address;
    if (a) {
      setStreet(a.street ?? "");
      setStreet2(a.street2 ?? "");
      setCity(a.city ?? "");
      setState(a.state ?? "");
      setZip(a.zip ?? "");
    }
  }, [userProfile]);

  const handleAddressSave = async () => {
    if (!currentUser?.uid) return;
    setAddressSaving(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        address: { street: street.trim(), street2: street2.trim(), city: city.trim(), state: state.trim(), zip: zip.trim() },
      });
      toast({ title: "Address saved" });
    } catch {
      toast({ title: "Error", description: "Failed to save address", variant: "destructive" });
    } finally {
      setAddressSaving(false);
    }
  };

  // Delete account
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleEmailChange = async () => {
    if (!currentUser?.email || !newEmail || !emailPassword) return;
    setEmailSaving(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, emailPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await verifyBeforeUpdateEmail(currentUser, newEmail);
      toast({
        title: "Verification email sent",
        description: "Check your new email address to confirm the change.",
      });
      setNewEmail("");
      setEmailPassword("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update email";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser?.email) return;
    try {
      const fns = getFunctions(undefined, "us-central1");
      await httpsCallable(fns, "sendPasswordResetLink")({ email: currentUser.email });
      toast({
        title: "Reset link sent",
        description: `Check ${currentUser.email} for a password reset link.`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to send reset email", variant: "destructive" });
    }
  };

  const handleNotifSave = async () => {
    if (!currentUser?.uid) return;
    setNotifSaving(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        notification: inAppNotifs,
        emailNotifications: emailNotifs,
      });
      toast({ title: "Preferences saved" });
    } catch {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    } finally {
      setNotifSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUser?.email || deleteConfirm !== "DELETE" || !deletePassword) return;
    setDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, deletePassword);
      await reauthenticateWithCredential(currentUser, credential);
      await deleteDoc(doc(db, "users", currentUser.uid!));
      await deleteUser(currentUser);
      navigate("/login");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      toast({ title: "Error", description: message, variant: "destructive" });
      setDeleting(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-32 md:pt-24 pb-16 px-4 sm:px-6">
          <div className="max-w-xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Account Settings</h1>
                <p className="text-sm text-muted-foreground">
                  Manage your login credentials and preferences
                </p>
              </div>
            </div>

            {/* Login & Security */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#3366FF]" />
                <h2 className="text-sm font-semibold text-foreground">Login & Security</h2>
              </div>

              {/* Email change */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Current email
                  </p>
                  <p className="text-sm font-medium text-foreground mt-1">{currentUser?.email}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newEmail">New email address</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="new@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emailPassword">Confirm with your current password</Label>
                  <Input
                    id="emailPassword"
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="Current password"
                  />
                </div>

                <Button
                  size="sm"
                  className="bg-[#3366FF] hover:bg-[#3366FF]/90"
                  disabled={!newEmail || !emailPassword || emailSaving}
                  onClick={handleEmailChange}
                >
                  {emailSaving ? "Sending verification…" : "Change email"}
                </Button>
              </div>

              <div className="border-t border-border" />

              {/* Password reset */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Password</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We'll send a reset link to your email
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handlePasswordReset}>
                  Send reset link
                </Button>
              </div>
            </div>

            {/* Notifications */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#3366FF]" />
                <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">In-app notifications</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Trade updates, messages, and alerts in the bell menu
                    </p>
                  </div>
                  <Toggle checked={inAppNotifs} onChange={setInAppNotifs} />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Email notifications</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Trade activity and account updates sent to your email
                    </p>
                  </div>
                  <Toggle checked={emailNotifs} onChange={setEmailNotifs} />
                </div>
              </div>

              <Button
                size="sm"
                className="bg-[#3366FF] hover:bg-[#3366FF]/90"
                disabled={notifSaving}
                onClick={handleNotifSave}
              >
                {notifSaving ? "Saving…" : "Save preferences"}
              </Button>
            </div>

            {/* Shipping Address */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#3366FF]" />
                <h2 className="text-sm font-semibold text-foreground">Shipping Address</h2>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Used by Shippo to generate trade shipping labels.
              </p>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="street">Street address</Label>
                  <div className="relative" ref={addressDropdownRef}>
                    <Input
                      id="street"
                      value={street}
                      onChange={(e) => {
                        setStreet(e.target.value);
                        fetchSuggestions(e.target.value);
                      }}
                      onBlur={() => setTimeout(clearSuggestions, 150)}
                      placeholder="Start typing your address…"
                      autoComplete="off"
                    />
                    {suggestions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={() => selectSuggestion(s)}
                            className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="street2">Apt, suite, unit <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="street2" value={street2} onChange={(e) => setStreet2(e.target.value)} placeholder="Apt 4B" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="New York" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="NY" maxLength={2} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP code</Label>
                  <Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="10001" maxLength={10} className="max-w-[160px]" />
                </div>
              </div>

              <Button
                size="sm"
                className="bg-[#3366FF] hover:bg-[#3366FF]/90"
                disabled={!street || !city || !state || !zip || addressSaving}
                onClick={handleAddressSave}
              >
                {addressSaving ? "Saving…" : "Save address"}
              </Button>
            </div>

            {/* App Tour */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-[#3366FF] shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">App walkthrough</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Replay the guided tour of Barterr's key features
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigate("/dashboard");
                    startTour();
                  }}
                >
                  Take the tour
                </Button>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-2xl border border-destructive/40 bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <h2 className="text-sm font-semibold text-destructive">Danger Zone</h2>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Delete account</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Permanently remove your account and all data. This cannot be undone.
                  </p>
                </div>
                {!showDeleteForm && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setShowDeleteForm(true)}
                  >
                    Delete
                  </Button>
                )}
              </div>

              {showDeleteForm && (
                <div className="space-y-3 pt-1 border-t border-border">
                  <div className="space-y-2">
                    <Label htmlFor="deletePassword">Confirm your password</Label>
                    <Input
                      id="deletePassword"
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Your password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deleteConfirm">
                      Type <span className="font-mono font-bold">DELETE</span> to confirm
                    </Label>
                    <Input
                      id="deleteConfirm"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder="DELETE"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteConfirm !== "DELETE" || !deletePassword || deleting}
                      onClick={handleDelete}
                    >
                      {deleting ? "Deleting…" : "Permanently delete account"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDeleteForm(false);
                        setDeletePassword("");
                        setDeleteConfirm("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </PageTransition>
  );
};
