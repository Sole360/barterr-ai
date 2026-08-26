import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
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

const signupSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupFormValues = z.infer<typeof signupSchema>;

export const SignupPage = () => {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralId = searchParams.get("refId");

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: SignupFormValues) {
    try {
      setError("");
      setLoading(true);
      await signUp(values.email, values.password, {
        firstName: values.firstName,
        lastName: values.lastName,
        mobile: values.phoneNumber,
        referredBy: referralId ?? undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message ?? "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#33FF99] via-[#33c9bc] to-[#3366FF] p-4">
        <div className="bg-card rounded-3xl shadow-[0_4px_32px_rgba(0,0,0,0.10)] p-10 w-full max-w-md text-center">
          <img
            src="/illustrations/Confirm-Email.png"
            alt=""
            className="w-36 mx-auto mb-6 object-contain"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-black text-foreground mb-2">Check your email</h1>
          <p className="text-sm text-muted-foreground mb-1">
            We sent a verification link to{" "}
            <strong className="text-foreground">{form.getValues("email")}</strong>
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Verify your email before signing in. Don't forget to check spam.
          </p>
          <Button
            onClick={() => navigate("/login")}
            className="w-full h-11 rounded-xl font-black bg-[#3366FF] hover:bg-[#3366FF]/90"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
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

        {/* Illustration */}
        <div className="flex-1 flex items-center justify-center py-6">
          <img
            src="/illustrations/Create-Trade.png"
            alt=""
            className="w-full max-w-sm object-contain mix-blend-multiply"
            aria-hidden="true"
          />
        </div>

        {/* Tagline */}
        <div className="shrink-0">
          <h2 className="text-3xl font-black text-white leading-tight mb-2">
            Your sneakers<br />deserve better trades.
          </h2>
          <p className="text-white/80 text-sm max-w-xs leading-relaxed">
            Join thousands of sneakerheads who trade smarter with authentication you can trust.
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full md:w-1/2 flex items-center justify-center bg-background px-6 py-12 overflow-y-auto">
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
            <h1 className="text-2xl font-black text-foreground mb-1">Create account</h1>
            <p className="text-sm text-muted-foreground">Join Barterr and start trading</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wide">First</FormLabel>
                      <FormControl>
                        <Input placeholder="John" className="rounded-xl h-11" {...field} />
                      </FormControl>
                      <FormMessage className="text-red-500" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Last</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" className="rounded-xl h-11" {...field} />
                      </FormControl>
                      <FormMessage className="text-red-500" />
                    </FormItem>
                  )}
                />
              </div>

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
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(555) 123-4567" className="rounded-xl h-11" {...field} />
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
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" className="rounded-xl h-11" {...field} />
                    </FormControl>
                    <FormMessage className="text-red-500" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Confirm Password</FormLabel>
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
                {loading ? "Creating account…" : "Create Account"}
              </Button>
            </form>
          </Form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-[#3366FF] hover:underline font-bold">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
