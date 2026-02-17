import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil, MapPin, Clock, Gauge, Briefcase, Home, FileText } from "lucide-react";
import type { Trip } from "@shared/schema";
import { format, parseISO } from "date-fns";

export default function TripDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: trip, isLoading } = useQuery<Trip>({
    queryKey: ["/api/trips", params.id],
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Trip not found</p>
        <Link href="/trips">
          <Button variant="outline" className="mt-4">Back to Trips</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/trips")} data-testid="button-back-detail">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Trip Details</h1>
            <p className="text-sm text-muted-foreground">{format(parseISO(trip.date), "EEEE, d MMMM yyyy")}</p>
          </div>
        </div>
        <Link href={`/trips/${trip.id}/edit`}>
          <Button variant="outline" data-testid="button-edit-trip">
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-10 h-10 rounded-md ${trip.tripType === "business" ? "bg-chart-1/15" : "bg-chart-3/15"}`}>
                {trip.tripType === "business" ? (
                  <Briefcase className="w-5 h-5 text-chart-1" />
                ) : (
                  <Home className="w-5 h-5 text-chart-3" />
                )}
              </div>
              <div>
                <p className="text-lg font-semibold">{trip.distance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km</p>
                <Badge variant={trip.tripType === "business" ? "default" : "secondary"}>
                  {trip.tripType === "business" ? "Business" : "Private"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Route
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">From</p>
              <p className="text-sm font-medium" data-testid="text-start-location">{trip.startLocation}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">To</p>
              <p className="text-sm font-medium" data-testid="text-end-location">{trip.endLocation}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> Odometer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Start</p>
              <p className="text-sm font-medium tabular-nums" data-testid="text-start-odo">
                {trip.startOdometer.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} km
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">End</p>
              <p className="text-sm font-medium tabular-nums" data-testid="text-end-odo">
                {trip.endOdometer.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} km
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(trip.startTime || trip.endTime) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 flex-wrap">
              {trip.startTime && (
                <div>
                  <p className="text-xs text-muted-foreground">Departure</p>
                  <p className="text-sm font-medium">{trip.startTime}</p>
                </div>
              )}
              {trip.endTime && (
                <div>
                  <p className="text-xs text-muted-foreground">Arrival</p>
                  <p className="text-sm font-medium">{trip.endTime}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(trip.purpose || trip.notes) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {trip.purpose && (
              <div>
                <p className="text-xs text-muted-foreground">Purpose</p>
                <p className="text-sm" data-testid="text-purpose">{trip.purpose}</p>
              </div>
            )}
            {trip.notes && (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm" data-testid="text-notes">{trip.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
