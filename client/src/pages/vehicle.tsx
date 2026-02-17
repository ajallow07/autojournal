import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Car, Save, Gauge, Calendar, Hash, Trash2, Plus, Pencil, X } from "lucide-react";
import type { Vehicle } from "@shared/schema";

const vehicleFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().min(1900).max(2100),
  licensePlate: z.string().min(1, "License plate is required"),
  currentOdometer: z.coerce.number().min(0),
});

type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

function VehicleForm({ vehicle, onCancel }: { vehicle?: Vehicle; onCancel?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: vehicle
      ? {
          name: vehicle.name,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          licensePlate: vehicle.licensePlate,
          currentOdometer: vehicle.currentOdometer,
        }
      : {
          name: "",
          make: "",
          model: "",
          year: new Date().getFullYear(),
          licensePlate: "",
          currentOdometer: 0,
        },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: VehicleFormValues) => {
      if (vehicle) {
        return apiRequest("PATCH", `/api/vehicles/${vehicle.id}`, values);
      }
      return apiRequest("POST", "/api/vehicles", { ...values, isDefault: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: vehicle ? "Vehicle updated" : "Vehicle added" });
      if (!vehicle) {
        form.reset();
        onCancel?.();
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Name</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-vehicle-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="make"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Make</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-vehicle-make" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-vehicle-model" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-vehicle-year" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="licensePlate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>License Plate</FormLabel>
                <FormControl>
                  <Input placeholder="ABC 123" {...field} data-testid="input-license-plate" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currentOdometer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Odometer (km)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" {...field} data-testid="input-current-odometer" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-vehicle">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : vehicle ? "Update Vehicle" : "Add Vehicle"}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-vehicle">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/vehicles/${vehicle.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Vehicle removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Cannot delete", description: error.message, variant: "destructive" });
    },
  });

  if (editing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
            <Pencil className="w-4 h-4" />
            Edit Vehicle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VehicleForm vehicle={vehicle} onCancel={() => setEditing(false)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center justify-center w-12 h-12 rounded-md bg-chart-1/15">
              <Car className="w-6 h-6 text-chart-1" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold" data-testid={`text-vehicle-name-${vehicle.id}`}>{vehicle.name}</p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {vehicle.year}
                </span>
                {vehicle.licensePlate && (
                  <span className="flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" /> {vehicle.licensePlate}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5" /> {vehicle.currentOdometer.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} km
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditing(true)}
              data-testid={`button-edit-vehicle-${vehicle.id}`}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                if (confirm("Are you sure you want to delete this vehicle? Vehicles with trips cannot be deleted.")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-vehicle-${vehicle.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VehiclePage() {
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: vehicles, isLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-vehicle-page-title">Vehicles</h1>
          <p className="text-sm text-muted-foreground">Manage your vehicles</p>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)} data-testid="button-add-vehicle">
            <Plus className="w-4 h-4 mr-2" />
            Add Vehicle
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <Plus className="w-4 h-4" />
              New Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <VehicleForm onCancel={() => setShowAddForm(false)} />
          </CardContent>
        </Card>
      )}

      {vehicles && vehicles.length > 0 ? (
        <div className="space-y-3">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted mb-4">
              <Car className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No vehicles added yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a vehicle or connect your Tesla to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
