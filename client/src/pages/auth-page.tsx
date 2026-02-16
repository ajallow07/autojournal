import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, AlertCircle } from "lucide-react";
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary">
                <Car className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">Körjournal</span>
            </div>
            <CardTitle data-testid="text-auth-title">
              {mode === "login" ? "Log in" : "Create account"}
            </CardTitle>
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
                    ? "Logging in..."
                    : "Creating account..."
                  : mode === "login"
                    ? "Log in"
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
                    className="text-primary underline-offset-4 hover:underline"
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
                    className="text-primary underline-offset-4 hover:underline"
                    data-testid="button-switch-to-login"
                  >
                    Log in
                  </button>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="hidden md:flex flex-1 items-center justify-center bg-muted/30 p-12">
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-bold tracking-tight font-serif">
            Your Digital Driver's Journal
          </h2>
          <p className="text-muted-foreground">
            Effortlessly track business and private trips for your Tesla.
            Automatic logging, geofencing, and tax-ready reports — built for Swedish drivers.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Tesla API integration for automatic trip logging
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Business/private trip classification with geofencing
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Tax-compliant monthly and yearly reports with CSV export
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
