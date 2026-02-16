import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Zap, ZapOff, MapPin, Trash2, Plus, Radio, Car, Shield, Navigation, Circle,
  RefreshCw, Link2, Unlink, Search,
} from "lucide-react";
import { MapContainer, TileLayer, Circle as LeafletCircle, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Geofence, Vehicle } from "@shared/schema";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const geofenceFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().min(50).max(5000).default(200),
  tripType: z.enum(["business", "private"]),
});

type GeofenceFormValues = z.infer<typeof geofenceFormSchema>;

function TeslaConnectionCard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery<{
    configured: boolean;
    connected: boolean;
    connection: {
      id: string;
      vin: string;
      vehicleName: string;
      isActive: boolean;
      lastPolledAt: string | null;
      lastDriveState: string | null;
      lastOdometer: number | null;
      tripInProgress: boolean;
      vehicleId: string | null;
    } | null;
  }>({ queryKey: ["/api/tesla/status"] });

  const { data: vehicles } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tesla/auth");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.message || "Failed to get auth URL");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/tesla/disconnect");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tesla/status"] });
      toast({ title: "Tesla disconnected" });
    },
  });

  const pollMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tesla/poll");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/tesla/status"] });
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({
        title: "Poll complete",
        description: data.tripAction
          ? `Trip ${data.tripAction}`
          : `State: ${data.driveState || data.status}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Poll failed", description: error.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      await apiRequest("POST", "/api/tesla/link-vehicle", { vehicleId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tesla/status"] });
      toast({ title: "Vehicle linked" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Shield className="w-5 h-5" />
            Tesla API Setup Required
          </CardTitle>
          <CardDescription>
            To connect your Tesla, you need to register as a developer at developer.tesla.com and add your credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Setup steps:</p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to <span className="font-medium text-foreground">developer.tesla.com</span> and register your application</li>
              <li>Generate an EC keypair and host the public key on your domain</li>
              <li>Copy your <span className="font-medium text-foreground">Client ID</span> and <span className="font-medium text-foreground">Client Secret</span></li>
              <li>Add them as secrets named <span className="font-mono text-foreground">TESLA_CLIENT_ID</span> and <span className="font-mono text-foreground">TESLA_CLIENT_SECRET</span></li>
            </ol>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
            <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Your credentials are stored securely as encrypted secrets and never exposed to the frontend.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tesla/register");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Partner registered", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <ZapOff className="w-5 h-5" />
            Connect Your Tesla
          </CardTitle>
          <CardDescription>
            Link your Tesla account to enable automatic trip logging. Every drive will be recorded in real-time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>When connected, the app will:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Automatically detect when you start and end a drive</li>
              <li>Record odometer, locations, time, and distance</li>
              <li>Use geofences to classify trips as business or private</li>
              <li>Reverse-geocode GPS coordinates to street addresses</li>
            </ul>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              data-testid="button-connect-tesla"
            >
              <Zap className="w-4 h-4 mr-2" />
              {connectMutation.isPending ? "Redirecting..." : "Connect Tesla Account"}
            </Button>
            <Button
              variant="outline"
              onClick={() => registerMutation.mutate()}
              disabled={registerMutation.isPending}
              data-testid="button-register-tesla"
            >
              <Shield className="w-4 h-4 mr-2" />
              {registerMutation.isPending ? "Registering..." : "Register Partner Account"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            If you get a region error, click "Register Partner Account" first, then try connecting again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const conn = status.connection!;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Zap className="w-5 h-5 text-green-500" />
            Tesla Connected
          </CardTitle>
          <Badge variant="outline" data-testid="badge-connection-status">
            <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
            Active
          </Badge>
        </div>
        <CardDescription>
          Your Tesla is linked. Trips are being logged automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Vehicle</p>
            <p className="text-sm font-medium" data-testid="text-tesla-vehicle-name">{conn.vehicleName}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">VIN</p>
            <p className="text-sm font-mono" data-testid="text-tesla-vin">{conn.vin}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Drive State</p>
            <p className="text-sm font-medium capitalize" data-testid="text-drive-state">
              {conn.lastDriveState || "Unknown"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Odometer</p>
            <p className="text-sm font-medium" data-testid="text-tesla-odometer">
              {conn.lastOdometer ? `${conn.lastOdometer.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} km` : "N/A"}
            </p>
          </div>
          {conn.tripInProgress && (
            <div className="col-span-full">
              <Badge variant="default" data-testid="badge-trip-in-progress">
                <Navigation className="w-3 h-3 mr-1" />
                Trip in progress
              </Badge>
            </div>
          )}
        </div>

        {vehicles && vehicles.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">Linked to journal vehicle</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={conn.vehicleId || ""}
                onValueChange={(val) => linkMutation.mutate(val)}
              >
                <SelectTrigger className="w-64" data-testid="select-link-vehicle">
                  <SelectValue placeholder="Select vehicle..." />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.licensePlate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
          <Button
            variant="outline"
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending}
            data-testid="button-poll-now"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${pollMutation.isPending ? "animate-spin" : ""}`} />
            Poll Now
          </Button>
          <Button
            variant="destructive"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            data-testid="button-disconnect-tesla"
          >
            <Unlink className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
        </div>

        {conn.lastPolledAt && (
          <p className="text-xs text-muted-foreground">
            Last polled: {new Date(conn.lastPolledAt).toLocaleString("sv-SE")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToLocation({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 15, { duration: 1 });
  }, [lat, lng, map]);
  return null;
}

function GeofenceManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);

  const { data: geofences, isLoading } = useQuery<Geofence[]>({
    queryKey: ["/api/geofences"],
  });

  const form = useForm<GeofenceFormValues>({
    resolver: zodResolver(geofenceFormSchema),
    defaultValues: {
      name: "",
      latitude: 59.3293,
      longitude: 18.0686,
      radiusMeters: 200,
      tripType: "business",
    },
  });

  const selectedLat = form.watch("latitude");
  const selectedLng = form.watch("longitude");
  const selectedRadius = form.watch("radiusMeters");

  const handleMapClick = useCallback((lat: number, lng: number) => {
    form.setValue("latitude", parseFloat(lat.toFixed(6)));
    form.setValue("longitude", parseFloat(lng.toFixed(6)));
  }, [form]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        form.setValue("latitude", parseFloat(lat.toFixed(6)));
        form.setValue("longitude", parseFloat(lng.toFixed(6)));
        setFlyTo({ lat, lng });
        if (!form.getValues("name")) {
          const shortName = data[0].display_name.split(",")[0];
          form.setValue("name", shortName);
        }
      } else {
        toast({ title: "Location not found", description: "Try a different search term", variant: "destructive" });
      }
    } catch {
      toast({ title: "Search failed", description: "Could not search for location", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, form, toast]);

  const createMutation = useMutation({
    mutationFn: async (values: GeofenceFormValues) => {
      await apiRequest("POST", "/api/geofences", values);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/geofences"] });
      form.reset();
      setFlyTo(null);
      toast({ title: "Geofence added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add geofence", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/geofences/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/geofences"] });
      toast({ title: "Geofence removed" });
    },
  });

  const onSubmit = (values: GeofenceFormValues) => {
    createMutation.mutate(values);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <MapPin className="w-5 h-5" />
          Geofences
        </CardTitle>
        <CardDescription>
          Click the map or search for an address to set the geofence location. Existing geofences are shown as circles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md overflow-hidden border" style={{ height: "350px" }} data-testid="geofence-map-container">
          <MapContainer
            center={[59.3293, 18.0686]}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onMapClick={handleMapClick} />
            {flyTo && <FlyToLocation lat={flyTo.lat} lng={flyTo.lng} />}
            {selectedLat && selectedLng && (
              <>
                <Marker position={[selectedLat, selectedLng]} />
                <LeafletCircle
                  center={[selectedLat, selectedLng]}
                  radius={selectedRadius || 200}
                  pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15, weight: 2 }}
                />
              </>
            )}
            {geofences?.map((gf) => (
              <LeafletCircle
                key={gf.id}
                center={[gf.latitude, gf.longitude]}
                radius={gf.radiusMeters}
                pathOptions={{
                  color: gf.tripType === "business" ? "#22c55e" : "#f59e0b",
                  fillColor: gf.tripType === "business" ? "#22c55e" : "#f59e0b",
                  fillOpacity: 0.15,
                  weight: 2,
                  dashArray: "5,5",
                }}
              />
            ))}
          </MapContainer>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search address (e.g. Stureplan, Stockholm)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
            data-testid="input-geofence-search"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleSearch}
            disabled={isSearching}
            data-testid="button-search-location"
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Office, Home" {...field} data-testid="input-geofence-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tripType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-geofence-trip-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="radiusMeters"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Radius (meters)</FormLabel>
                    <FormControl>
                      <Input type="number" min={50} max={5000} {...field} data-testid="input-geofence-radius" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="sm:col-span-2 flex items-end">
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedLat?.toFixed(4)}, {selectedLng?.toFixed(4)}
                </p>
              </div>
            </div>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-add-geofence"
            >
              <Plus className="w-4 h-4 mr-2" />
              {createMutation.isPending ? "Adding..." : "Add Geofence"}
            </Button>
          </form>
        </Form>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : geofences && geofences.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium mb-2">Active Geofences</p>
            {geofences.map((gf) => (
              <div
                key={gf.id}
                className="flex items-center justify-between gap-4 p-3 rounded-md border flex-wrap"
                data-testid={`geofence-item-${gf.id}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{gf.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {gf.latitude.toFixed(4)}, {gf.longitude.toFixed(4)} ({gf.radiusMeters}m)
                    </p>
                  </div>
                  <Badge variant={gf.tripType === "business" ? "default" : "secondary"}>
                    {gf.tripType}
                  </Badge>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(gf.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-geofence-${gf.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <Radio className="w-5 h-5" />
          How It Works
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Link2 className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium">1. Connect</p>
            <p className="text-xs text-muted-foreground">
              Log in with your Tesla account to grant access to vehicle data. No hardware needed.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <Navigation className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium">2. Drive</p>
            <p className="text-xs text-muted-foreground">
              Every trip is automatically detected via the Tesla API. Start driving and the app handles the rest.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium">3. Classify</p>
            <p className="text-xs text-muted-foreground">
              Geofences auto-tag trips as business or private. Review and export for tax reporting.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TeslaPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-tesla-title">Tesla Integration</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Tesla for automatic trip logging
        </p>
      </div>

      <HowItWorks />
      <TeslaConnectionCard />
      <GeofenceManager />
    </div>
  );
}
