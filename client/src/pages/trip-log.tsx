import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Route, Briefcase, Home, Plus, Search, Filter } from "lucide-react";
import { Link } from "wouter";
import type { Trip } from "@shared/schema";
import { format, parseISO } from "date-fns";
import { useState, useMemo } from "react";

export default function TripLog() {
  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date-desc");

  const filteredTrips = useMemo(() => {
    if (!trips) return [];
    let result = [...trips];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.startLocation.toLowerCase().includes(q) ||
          t.endLocation.toLowerCase().includes(q) ||
          (t.purpose && t.purpose.toLowerCase().includes(q)) ||
          (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    if (typeFilter !== "all") {
      result = result.filter((t) => t.tripType === typeFilter);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "date-asc":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "distance-desc":
          return b.distance - a.distance;
        case "distance-asc":
          return a.distance - b.distance;
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });

    return result;
  }, [trips, search, typeFilter, sortBy]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-7 w-32" />
        <div className="flex gap-3 flex-wrap">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const totalDistance = filteredTrips.reduce((acc, t) => acc + t.distance, 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Trip Log</h1>
          <p className="text-sm text-muted-foreground">
            {filteredTrips.length} trips · {totalDistance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km total
          </p>
        </div>
        <Link href="/trips/new">
          <Button data-testid="button-add-trip">
            <Plus className="w-4 h-4 mr-2" />
            Add Trip
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search trips..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-trips"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-trip-type-filter">
            <Filter className="w-3.5 h-3.5 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]" data-testid="select-sort-trips">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest First</SelectItem>
            <SelectItem value="date-asc">Oldest First</SelectItem>
            <SelectItem value="distance-desc">Longest First</SelectItem>
            <SelectItem value="distance-asc">Shortest First</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredTrips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Route className="w-10 h-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                {search || typeFilter !== "all" ? "No matching trips found" : "No trips logged yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {search || typeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Start by adding your first trip"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTrips.map((trip) => (
                <Link key={trip.id} href={`/trips/${trip.id}`}>
                  <div
                    className="flex items-center justify-between gap-4 px-4 py-3 hover-elevate cursor-pointer flex-wrap"
                    data-testid={`trip-item-${trip.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0 ${trip.tripType === "business" ? "bg-primary/10" : "bg-chart-3/10"}`}>
                        {trip.tripType === "business" ? (
                          <Briefcase className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <Home className="w-3.5 h-3.5 text-chart-3" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {trip.startLocation} → {trip.endLocation}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(trip.date), "d MMM yyyy")}
                          </p>
                          {trip.startTime && trip.endTime && (
                            <p className="text-xs text-muted-foreground">
                              {trip.startTime} – {trip.endTime}
                            </p>
                          )}
                          {trip.purpose && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              · {trip.purpose}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {trip.distance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {trip.startOdometer.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} → {trip.endOdometer.toLocaleString("sv-SE", { maximumFractionDigits: 0 })}
                        </p>
                      </div>
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
