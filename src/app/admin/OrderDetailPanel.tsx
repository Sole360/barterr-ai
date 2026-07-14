import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import { X, Package, CheckCircle2, Truck, ShieldCheck, ShieldX, Mail, ExternalLink, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Timestamp } from "firebase/firestore";

interface TrackingInfo {
  carrier: string;
  tracking: string;
  label: string;
}

interface OrderParty {
  id: string;
  name: string;
  email: string;
  sneakerReceived?: boolean;
  authenticated?: boolean;
}

interface OrderDoc {
  id: string;
  tradeId: string;
  fromUserId: string;
  toUserId: string;
  sender: OrderParty;
  poster: OrderParty;
  trackingSender?: TrackingInfo;
  trackingPoster?: TrackingInfo;
  senderOutbound?: TrackingInfo;
  posterOutbound?: TrackingInfo;
  fakes?: { userId: string; reasons: string };
  completed: boolean;
  confirmedAt: Timestamp | null;
}

interface UserAddress {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface Props {
  order: OrderDoc;
  addresses: { sender?: UserAddress; poster?: UserAddress };
  photos: { sender: string[]; poster: string[] };
  onClose: () => void;
}

type Side = "sender" | "poster";

function trackingUrl(carrier: string, tracking: string): string {
  const c = carrier.toLowerCase();
  if (c.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`;
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${tracking}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`;
  if (c.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${tracking}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} tracking ${tracking}`)}`;
}

function TrackingRow({ label, info }: { label: string; info?: TrackingInfo }) {
  if (!info) {
    return (
      <div className="text-xs text-muted-foreground italic">{label}: Not yet purchased</div>
    );
  }
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-mono text-foreground">{info.carrier} </span>
      <a
        href={trackingUrl(info.carrier, info.tracking)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[#3366FF] hover:underline"
      >
        {info.tracking}
      </a>
      {" · "}
      <a href={info.label} target="_blank" rel="noreferrer" className="text-[#3366FF] hover:underline font-semibold">
        Download Label
      </a>
    </div>
  );
}

function AddressBlock({ address, name }: { address?: UserAddress; name: string }) {
  if (!address?.street) {
    return <div className="text-xs text-red-500">No address on file for {name}</div>;
  }
  return (
    <div className="text-xs text-muted-foreground leading-relaxed">
      {address.street}{address.street2 ? `, ${address.street2}` : ""}<br />
      {address.city}, {address.state} {address.zip}
    </div>
  );
}

export const OrderDetailPanel = ({ order, addresses, photos, onClose }: Props) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [acting, setActing] = useState<string | null>(null);
  const [failReasonSide, setFailReasonSide] = useState<Side | null>(null);
  const [failReasons, setFailReasons] = useState("");

  const callFn = async (name: string, data: Record<string, unknown>, key: string) => {
    setActing(key);
    try {
      const fns = getFunctions(undefined, "us-central1");
      await httpsCallable(fns, name)(data);
      toast({ title: "Done" });
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Action failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const emailPhotos = () =>
    callFn(
      "sendOrderPhotosEmail",
      {
        tradeId: order.tradeId,
        senderPhotos: photos.sender,
        posterPhotos: photos.poster,
        senderName: order.sender.name,
        posterName: order.poster.name,
      },
      "email_photos"
    );

  const markReceived = (role: Side) =>
    callFn("markSneakersReceived", { tradeId: order.tradeId, role }, `received_${role}`);

  const markAuth = (role: Side, passed: boolean, reasons?: string) =>
    callFn("markAuthResult", { tradeId: order.tradeId, role, passed, reasons }, `auth_${role}_${passed}`);

  const generateOutbound = (recipient: Side) =>
    callFn("createOutboundLabel", { tradeId: order.tradeId, recipient }, `outbound_${recipient}`);

  const renderSide = (role: Side) => {
    const party = role === "sender" ? order.sender : order.poster;
    const inboundTracking = role === "sender" ? order.trackingSender : order.trackingPoster;
    const outboundTracking = role === "sender" ? order.senderOutbound : order.posterOutbound;
    const address = role === "sender" ? addresses.sender : addresses.poster;
    const photoUrls = role === "sender" ? photos.sender : photos.poster;
    const isFake = order.fakes?.userId === party.id;

    return (
      <div className="rounded-xl border border-border bg-background p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm text-foreground">{party.name}</div>
            <div className="text-[11px] text-muted-foreground">{party.email}</div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{party.id}</div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-muted text-muted-foreground">
            {role}
          </span>
        </div>

        {/* Address */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Shipping Address</p>
          <AddressBlock address={address} name={party.name} />
        </div>

        {/* Photos */}
        {photoUrls.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Photos</p>
            <div className="grid grid-cols-3 gap-1.5">
              {photoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="relative group block aspect-square rounded-lg overflow-hidden border border-border">
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Inbound tracking */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Inbound Label</p>
          <TrackingRow label="Inbound" info={inboundTracking} />
        </div>

        {/* Step 1: Mark Received */}
        <div className="flex items-center gap-3">
          {party.sneakerReceived ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Sneakers received
            </div>
          ) : (
            <button
              type="button"
              disabled={!!acting}
              onClick={() => markReceived(role)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3366FF] text-white text-xs font-semibold hover:bg-[#3366FF]/90 transition-colors disabled:opacity-40"
            >
              <Package className="w-3.5 h-3.5" />
              {acting === `received_${role}` ? "Marking…" : "Mark Received"}
            </button>
          )}
        </div>

        {/* Step 2: Auth Result */}
        {party.sneakerReceived && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Authentication</p>
            {party.authenticated ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" /> Passed
              </div>
            ) : isFake ? (
              <div className="flex items-center gap-1.5 text-xs text-red-500 font-semibold">
                <ShieldX className="w-4 h-4" /> Failed — {order.fakes?.reasons}
              </div>
            ) : failReasonSide === role ? (
              <div className="space-y-2">
                <textarea
                  value={failReasons}
                  onChange={(e) => setFailReasons(e.target.value)}
                  placeholder="Describe the issue…"
                  rows={2}
                  className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3366FF]/40 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!failReasons.trim() || !!acting}
                    onClick={() => {
                      markAuth(role, false, failReasons);
                      setFailReasonSide(null);
                      setFailReasons("");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-40"
                  >
                    Confirm Fail
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFailReasonSide(null); setFailReasons(""); }}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!!acting}
                  onClick={() => markAuth(role, true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-40"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {acting === `auth_${role}_true` ? "Saving…" : "Pass"}
                </button>
                <button
                  type="button"
                  disabled={!!acting}
                  onClick={() => setFailReasonSide(role)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
                >
                  <ShieldX className="w-3.5 h-3.5" /> Fail
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Outbound Label */}
        {party.authenticated && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Outbound Label</p>
            {outboundTracking ? (
              <TrackingRow label="Outbound" info={outboundTracking} />
            ) : (
              <button
                type="button"
                disabled={!!acting}
                onClick={() => generateOutbound(role)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-40"
              >
                <Truck className="w-3.5 h-3.5" />
                {acting === `outbound_${role}` ? "Generating…" : "Generate Outbound Label"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Order Details</h2>
            {order.confirmedAt && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Confirmed {format(order.confirmedAt.toDate(), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { onClose(); navigate(`/admin/audit?q=${order.tradeId}`); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="View audit trail for this order"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Audit Trail
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-accent transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="p-6 grid gap-4 md:grid-cols-2">
          {renderSide("sender")}
          {renderSide("poster")}
        </div>

        {order.completed && (
          <div className="mx-6 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-center">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              ✓ Order fully completed — both sides authenticated and outbound labels generated
            </p>
          </div>
        )}

        {/* Email photos */}
        {(photos.sender.length > 0 || photos.poster.length > 0) && (
          <div className="mx-6 mb-6">
            <button
              type="button"
              disabled={!!acting}
              onClick={emailPhotos}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-40 w-full justify-center"
            >
              <Mail className="w-4 h-4" />
              {acting === "email_photos" ? "Sending…" : `Email All Photos to terrence@barterr.ai`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
