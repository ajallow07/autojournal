import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, AlertCircle, Zap, MapPin, BarChart3, Shield } from "lucide-react";
import { SiGoogle } from "react-icons/si";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { login, register, isLoggingIn, isRegistering, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (isAuthenticated) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      if (mode === "login") {
        await login({ username, password });
      } else {
        await register({
          username,
          password,
          email: email || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
        });
      }
      setLocation("/");
    } catch (err: any) {
      const msg = err?.message || "Something went wrong";
      try {
        const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        setError(parsed.message || msg);
      } catch {
        setError(msg);
      }
    }
  }

  const isSubmitting = isLoggingIn || isRegistering;

  const features = [
    {
      icon: Zap,
      title: "Tesla Integration",
      desc: "Automatic trip logging via Tesla API",
    },
    {
      icon: MapPin,
      title: "Smart Geofencing",
      desc: "Auto-classify business and private trips",
    },
    {
      icon: BarChart3,
      title: "Tax-Ready Reports",
      desc: "Monthly and yearly reports with CSV export",
    },
    {
      icon: Shield,
      title: "Skatteverket Compliant",
      desc: "Built for Swedish tax requirements",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex flex-1 relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(222 47% 11%) 0%, hsl(222 40% 18%) 40%, hsl(192 85% 25%) 100%)" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative flex flex-col justify-center px-12 xl:px-20 py-12 z-10 w-full max-w-2xl">
          <div className="flex items-center gap-3 mb-10">
            <img src="/icon.png" alt="Mahlis Auto Journal" className="w-11 h-11 rounded-md" />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Mahlis Auto Journal</h1>
            </div>
          </div>

          <h2 className="text-3xl xl:text-4xl font-bold text-white tracking-tight leading-tight mb-4">
            Your Digital<br />Driver's Journal
          </h2>
          <p className="text-base text-white/70 mb-10 max-w-md leading-relaxed">
            Effortlessly track every trip for your Tesla. Automatic logging,
            geofencing, and tax-ready reports — built for Swedish drivers.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3 p-3 rounded-md bg-white/[0.06] backdrop-blur-sm">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white/10 flex-shrink-0 mt-0.5">
                  <f.icon className="w-4 h-4 text-white/80" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/90">{f.title}</p>
                  <p className="text-xs text-white/50 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 lg:max-w-lg flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <img src="/icon.png" alt="Mahlis Auto Journal" className="w-10 h-10 rounded-md" />
            <span className="text-xl font-bold tracking-tight">Mahlis Auto Journal</span>
          </div>

          <Card>
            <CardHeader className="text-center space-y-1 pb-4">
              <CardTitle className="text-lg" data-testid="text-auth-title">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {mode === "login" ? "Sign in to your driver's journal" : "Start tracking your trips today"}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <a href="/api/auth/google" className="block">
                <Button
                  variant="outline"
                  className="w-full"
                  type="button"
                  data-testid="button-google-login"
                >
                  <SiGoogle className="w-4 h-4 mr-2" />
                  Continue with Google
                </Button>
              </a>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-auth-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={30}
                    autoComplete="username"
                    data-testid="input-username"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    data-testid="input-password"
                  />
                </div>

                {mode === "register" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email (optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        data-testid="input-email"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="firstName">First name</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          autoComplete="given-name"
                          data-testid="input-first-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lastName">Last name</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          autoComplete="family-name"
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                  data-testid="button-submit-auth"
                >
                  {isSubmitting
                    ? mode === "login"
                      ? "Signing in..."
                      : "Creating account..."
                    : mode === "login"
                      ? "Sign in"
                      : "Create account"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("register"); setError(null); }}
                      className="text-primary underline-offset-4 hover:underline font-medium"
                      data-testid="button-switch-to-register"
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("login"); setError(null); }}
                      className="text-primary underline-offset-4 hover:underline font-medium"
                      data-testid="button-switch-to-login"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
