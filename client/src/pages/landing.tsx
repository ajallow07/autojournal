import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Car, Route, BarChart3, Zap, Shield, MapPin } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Tesla Integration",
    description: "Connect your Tesla account to automatically log trips in real-time using the Fleet API.",
  },
  {
    icon: Route,
    title: "Smart Trip Logging",
    description: "Automatic or manual trip logging with odometer tracking and location detection.",
  },
  {
    icon: BarChart3,
    title: "Tax-Ready Reports",
    description: "Generate monthly and yearly reports with CSV export for Swedish tax compliance.",
  },
  {
    icon: MapPin,
    title: "Geofencing",
    description: "Set up geofences to automatically classify trips as business or private.",
  },
  {
    icon: Shield,
    title: "Multi-User Support",
    description: "Each user gets their own secure space for vehicles, trips, and Tesla connections.",
  },
  {
    icon: Car,
    title: "Vehicle Management",
    description: "Track multiple vehicles with odometer readings and detailed trip history.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="Mahlis Auto Journal" className="w-9 h-9 rounded-md" />
            <span className="text-lg font-semibold">Mahlis Auto Journal</span>
          </div>
          <a href="/api/login">
            <Button data-testid="button-login-nav">Log in</Button>
          </a>
        </div>
      </nav>

      <main className="flex-1">
        <section className="py-16 md:py-24 px-4">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight font-serif" data-testid="text-hero-title">
              Your Digital Driver's Journal
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Effortlessly track business and private trips for your Tesla. 
              Automatic logging, geofencing, and tax-ready reports — built for Swedish drivers.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
              <a href="/api/login">
                <Button size="lg" data-testid="button-get-started">
                  Get Started
                </Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              Free to use. Sign in with Google or email.
            </p>
          </div>
        </section>

        <section className="py-12 px-4 border-t">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-semibold text-center mb-8">Everything you need</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((feature) => (
                <Card key={feature.title} className="hover-elevate">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-medium">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap text-xs text-muted-foreground">
          <span>Mahlis Auto Journal — Stockholm, Sweden</span>
          <span>Built for Tesla drivers</span>
        </div>
      </footer>
    </div>
  );
}
