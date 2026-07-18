import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/contexts/auth.context";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    try {
      setError("");
      setLoading(true);
      await signIn(values.email, values.password);
      navigate("/dashboard");
    } catch (err: any) {
      if (err.code === "auth/user-disabled") {
        setError("This account has been suspended. Please contact support if you believe this is a mistake.");
      } else {
        setError(err.message ?? "Failed to sign in");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ── */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-[#33FF99] via-[#33c9bc] to-[#3366FF] flex-col p-10 overflow-hidden">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/barterr-dev-98dfd.firebasestorage.app/o/public%2Fbarterr-icon-glyph-gradient.png?alt=media&token=1ebf5744-52b4-4d42-9673-a9799b5fb1c1"
            alt="Barterr"
            className="h-8 w-auto brightness-0 invert"
          />
          <span className="text-white font-black text-xl tracking-tight">Barterr</span>
        </Link>

        {/* Illustration — fills middle, mix-blend-multiply drops the white background */}
        <div className="flex-1 flex items-center justify-center py-6">
          <img
            src="/illustrations/Dashboard.png"
            alt=""
            className="w-full max-w-sm object-contain mix-blend-multiply"
            aria-hidden="true"
          />
        </div>

        {/* Tagline — always visible at bottom */}
        <div className="shrink-0">
          <h2 className="text-3xl font-black text-white leading-tight mb-2">
            Trade sneakers<br />with confidence.
          </h2>
          <p className="text-white/80 text-sm max-w-xs leading-relaxed">
            Authenticated trades, payment protection for both sides, and prepaid shipping — all in one place.
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full md:w-1/2 flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="md:hidden text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2">
              <img
                src="https://firebasestorage.googleapis.com/v0/b/barterr-dev-98dfd.firebasestorage.app/o/public%2Fbarterr-icon-glyph-gradient.png?alt=media&token=1ebf5744-52b4-4d42-9673-a9799b5fb1c1"
                alt="Barterr"
                className="h-8 w-auto"
              />
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-black text-foreground mb-1">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to your Barterr account</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" className="rounded-xl h-11" {...field} />
                    </FormControl>
                    <FormMessage className="text-red-500" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Password</FormLabel>
                      <Link to="/forgot-password" className="text-xs text-[#3366FF] hover:underline font-semibold">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" className="rounded-xl h-11" {...field} />
                    </FormControl>
                    <FormMessage className="text-red-500" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11 rounded-xl font-black text-sm bg-[#3366FF] hover:bg-[#3366FF]/90"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </Form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="text-[#3366FF] hover:underline font-bold">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
