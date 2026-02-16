import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import type { Trip, Vehicle } from "@shared/schema";

const tripFormSchema = z.object({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  startLocation: z.string().min(1, "Start location is required"),
  endLocation: z.string().min(1, "End location is required"),
  startOdometer: z.coerce.number().min(0, "Must be 0 or greater"),
  endOdometer: z.coerce.number().min(0, "Must be 0 or greater"),
  tripType: z.enum(["business", "private"]),
  purpose: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => data.endOdometer > data.startOdometer, {
  message: "End odometer must be greater than start odometer",
  path: ["endOdometer"],
});

type TripFormValues = z.infer<typeof tripFormSchema>;

export default function TripForm() {
  const params = useParams<{ id: string }>();
  const isEditing = params.id && params.id !== "new";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: existingTrip, isLoading: tripLoading } = useQuery<Trip>({
    queryKey: ["/api/trips", params.id],
    enabled: !!isEditing,
  });

  const vehicle = vehicles?.[0];

  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      startTime: "",
      endTime: "",
      startLocation: "",
      endLocation: "",
      startOdometer: vehicle?.currentOdometer || 0,
      endOdometer: 0,
      tripType: "private",
      purpose: "",
      notes: "",
    },
    values: existingTrip
      ? {
          date: existingTrip.date,
          startTime: existingTrip.startTime || "",
          endTime: existingTrip.endTime || "",
          startLocation: existingTrip.startLocation,
          endLocation: existingTrip.endLocation,
          startOdometer: existingTrip.startOdometer,
          endOdometer: existingTrip.endOdometer,
          tripType: existingTrip.tripType as "business" | "private",
          purpose: existingTrip.purpose || "",
          notes: existingTrip.notes || "",
        }
      : undefined,
  });

  const startOdo = form.watch("startOdometer");
  const endOdo = form.watch("endOdometer");
  const distance = endOdo > startOdo ? endOdo - startOdo : 0;

  const saveMutation = useMutation({
    mutationFn: async (values: TripFormValues) => {
      const payload = {
        ...values,
        startTime: values.startTime || null,
        endTime: values.endTime || null,
        purpose: values.purpose || null,
        notes: values.notes || null,
        distance,
        vehicleId: vehicle?.id || "",
      };
      if (isEditing) {
        return apiRequest("PATCH", `/api/trips/${params.id}`, payload);
      }
      return apiRequest("POST", "/api/trips", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({
        title: isEditing ? "Trip updated" : "Trip logged",
        description: `${distance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km recorded`,
      });
      navigate("/trips");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/trips/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Trip deleted" });
      navigate("/trips");
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting trip",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: TripFormValues) => {
    saveMutation.mutate(values);
  };

  if (isEditing && tripLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(isEditing ? `/trips/${params.id}` : "/trips")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isEditing ? "Edit Trip" : "Log New Trip"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {vehicle?.name || "Tesla Model Y"} · {vehicle?.licensePlate || ""}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Trip Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Stockholm, Kungsholmen" {...field} data-testid="input-start-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Solna, Mall of Scandinavia" {...field} data-testid="input-end-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Odometer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startOdometer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start (km)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} data-testid="input-start-odometer" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endOdometer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End (km)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} data-testid="input-end-odometer" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {distance > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                  <span className="text-sm text-muted-foreground">Distance:</span>
                  <span className="text-sm font-semibold">
                    {distance.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} km
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="tripType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-trip-type">
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
              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purpose</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Client meeting at Ericsson HQ" {...field} data-testid="input-purpose" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes..." className="resize-none" {...field} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-trip"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(isEditing ? `/trips/${params.id}` : "/trips")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-trip"
              >
                <Save className="w-4 h-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : isEditing ? "Update Trip" : "Save Trip"}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
