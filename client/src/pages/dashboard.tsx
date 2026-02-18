import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Home, Gauge, Calendar, Route, ArrowRight, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { Trip, Vehicle } from "@shared/schema";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

function StatCard({ title, value, subtitle, icon: Icon, iconBg }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  iconBg: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`flex items-center justify-center w-9 h-9 rounded-md ${iconBg}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const { data: vehicles, isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const isLoading = tripsLoading || vehiclesLoading;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const monthTrips = trips?.filter((t) => {
    const d = parseISO(t.date);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  }) || [];

  const totalDistance = monthTrips.reduce((acc, t) => acc + t.distance, 0);
  const businessTrips = monthTrips.filter((t) => t.tripType === "business");
  const privateTrips = monthTrips.filter((t) => t.tripType === "private");
  const businessDistance = businessTrips.reduce((acc, t) => acc + t.distance, 0);
  const privateDistance = privateTrips.reduce((acc, t) => acc + t.distance, 0);
  const businessPercent = totalDistance > 0 ? Math.round((businessDistance / totalDistance) * 100) : 0;

  const vehicle = vehicles?.[0];
  const recentTrips = [...(trips || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "MMMM yyyy")} overview {vehicle ? `\u2014 ${vehicle.name}` : ""}
          </p>
        </div>
        {monthTrips.length > 0 && (
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-medium text-primary">{monthTrips.length} trips this month</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Distance"
          value={`${totalDistance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km`}
          subtitle={`${monthTrips.length} trips this month`}
          icon={Gauge}
          iconBg="bg-primary"
        />
        <StatCard
          title="Business"
          value={`${businessDistance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km`}
          subtitle={`${businessTrips.length} trips (${businessPercent}%)`}
          icon={Briefcase}
          iconBg="bg-chart-1"
        />
        <StatCard
          title="Private"
          value={`${privateDistance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km`}
          subtitle={`${privateTrips.length} trips`}
          icon={Home}
          iconBg="bg-chart-3"
        />
        <StatCard
          title="Odometer"
          value={vehicle ? `${vehicle.currentOdometer.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} km` : "N/A"}
          subtitle={vehicle?.licensePlate || vehicle?.name || "No vehicle"}
          icon={Calendar}
          iconBg="bg-chart-4"
        />
      </div>

      {totalDistance > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Business vs Private Split</p>
            <div className="flex h-3 rounded-md overflow-hidden bg-muted">
              {businessPercent > 0 && (
                <div
                  className="bg-chart-1 transition-all duration-500"
                  style={{ width: `${businessPercent}%` }}
                />
              )}
              {100 - businessPercent > 0 && (
                <div
                  className="bg-chart-3 transition-all duration-500"
                  style={{ width: `${100 - businessPercent}%` }}
                />
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-chart-1" />
                <span className="text-xs text-muted-foreground">Business {businessPercent}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-chart-3" />
                <span className="text-xs text-muted-foreground">Private {100 - businessPercent}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-sm font-medium">Recent Trips</CardTitle>
          <Link href="/trips">
            <Button variant="ghost" size="sm" data-testid="link-view-all-trips">
              View All
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentTrips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted mb-4">
                <Route className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No trips logged yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Connect your Tesla to start automatic trip logging, or add trips manually
              </p>
              <Link href="/tesla">
                <Button variant="outline" size="sm" className="mt-4" data-testid="link-connect-tesla-empty">
                  Connect Tesla
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {recentTrips.map((trip) => (
                <Link key={trip.id} href={`/trips/${trip.id}`}>
                  <div
                    className="flex items-center justify-between gap-4 px-4 py-3 hover-elevate cursor-pointer flex-wrap"
                    data-testid={`trip-row-${trip.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-md ${trip.tripType === "business" ? "bg-chart-1/15" : "bg-chart-3/15"}`}>
                        {trip.tripType === "business" ? (
                          <Briefcase className="w-3.5 h-3.5 text-chart-1" />
                        ) : (
                          <Home className="w-3.5 h-3.5 text-chart-3" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {trip.startLocation} <ArrowRight className="w-3 h-3 inline text-muted-foreground mx-0.5" /> {trip.endLocation}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(trip.date), "d MMM yyyy")}
                          {trip.purpose ? ` \u00b7 ${trip.purpose}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-medium tabular-nums">
                        {trip.distance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km
                      </span>
                      <Badge variant={trip.tripType === "business" ? "default" : "secondary"} className="text-xs">
                        {trip.tripType === "business" ? "Business" : "Private"}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
