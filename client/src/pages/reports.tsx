import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Download, Briefcase, Home, Gauge, TrendingUp, Calendar } from "lucide-react";
import type { Trip } from "@shared/schema";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths, startOfYear, endOfYear, eachMonthOfInterval } from "date-fns";
import { useState, useMemo } from "react";

export default function Reports() {
  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const now = new Date();
  const [reportType, setReportType] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState(format(now, "yyyy-MM"));
  const [startDate, setStartDate] = useState(format(subMonths(now, 3), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(now, "yyyy-MM-dd"));

  const filteredTrips = useMemo(() => {
    if (!trips) return [];
    if (reportType === "monthly") {
      const [year, month] = selectedMonth.split("-").map(Number);
      const mStart = startOfMonth(new Date(year, month - 1));
      const mEnd = endOfMonth(new Date(year, month - 1));
      return trips.filter((t) => {
        const d = parseISO(t.date);
        return isWithinInterval(d, { start: mStart, end: mEnd });
      });
    }
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    return trips.filter((t) => {
      const d = parseISO(t.date);
      return isWithinInterval(d, { start: s, end: e });
    });
  }, [trips, reportType, selectedMonth, startDate, endDate]);

  const stats = useMemo(() => {
    const totalDistance = filteredTrips.reduce((acc, t) => acc + t.distance, 0);
    const businessTrips = filteredTrips.filter((t) => t.tripType === "business");
    const privateTrips = filteredTrips.filter((t) => t.tripType === "private");
    const businessDistance = businessTrips.reduce((acc, t) => acc + t.distance, 0);
    const privateDistance = privateTrips.reduce((acc, t) => acc + t.distance, 0);
    const businessPercent = totalDistance > 0 ? Math.round((businessDistance / totalDistance) * 100) : 0;
    const avgDistance = filteredTrips.length > 0 ? totalDistance / filteredTrips.length : 0;

    return {
      totalTrips: filteredTrips.length,
      totalDistance,
      businessTrips: businessTrips.length,
      privateTrips: privateTrips.length,
      businessDistance,
      privateDistance,
      businessPercent,
      avgDistance,
    };
  }, [filteredTrips]);

  const monthlyBreakdown = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    const yearStart = startOfYear(now);
    const yearEnd = endOfYear(now);
    const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

    return months.map((month) => {
      const mStart = startOfMonth(month);
      const mEnd = endOfMonth(month);
      const monthTrips = trips.filter((t) => {
        const d = parseISO(t.date);
        return isWithinInterval(d, { start: mStart, end: mEnd });
      });
      const business = monthTrips.filter((t) => t.tripType === "business").reduce((acc, t) => acc + t.distance, 0);
      const priv = monthTrips.filter((t) => t.tripType === "private").reduce((acc, t) => acc + t.distance, 0);
      return {
        month: format(month, "MMM"),
        business,
        private: priv,
        total: business + priv,
        trips: monthTrips.length,
      };
    });
  }, [trips]);

  const maxMonthDistance = Math.max(...monthlyBreakdown.map((m) => m.total), 1);

  const handleExportCSV = () => {
    if (filteredTrips.length === 0) return;
    const headers = ["Date", "Start Time", "End Time", "From", "To", "Start Odometer", "End Odometer", "Distance (km)", "Type", "Purpose", "Notes"];
    const rows = filteredTrips
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((t) => [
        t.date,
        t.startTime || "",
        t.endTime || "",
        t.startLocation,
        t.endLocation,
        t.startOdometer.toString(),
        t.endOdometer.toString(),
        t.distance.toString(),
        t.tripType,
        t.purpose || "",
        t.notes || "",
      ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `korjournal-${reportType === "monthly" ? selectedMonth : `${startDate}_${endDate}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Analyze your driving patterns and expenses</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={filteredTrips.length === 0}
          data-testid="button-export-csv"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Tabs value={reportType} onValueChange={setReportType}>
        <TabsList>
          <TabsTrigger value="monthly" data-testid="tab-monthly">Monthly</TabsTrigger>
          <TabsTrigger value="custom" data-testid="tab-custom">Custom Period</TabsTrigger>
          <TabsTrigger value="yearly" data-testid="tab-yearly">Yearly Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-6 mt-4">
          <div className="flex items-center gap-3">
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-48"
              data-testid="input-month-select"
            />
          </div>
          <ReportStats stats={stats} />
          <TripTable trips={filteredTrips} />
        </TabsContent>

        <TabsContent value="custom" className="space-y-6 mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-44"
                data-testid="input-start-date"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-44"
                data-testid="input-end-date"
              />
            </div>
          </div>
          <ReportStats stats={stats} />
          <TripTable trips={filteredTrips} />
        </TabsContent>

        <TabsContent value="yearly" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{format(now, "yyyy")} Monthly Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {monthlyBreakdown.map((m) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-8 flex-shrink-0">{m.month}</span>
                    <div className="flex-1 flex h-5 rounded-md overflow-hidden bg-muted">
                      {m.business > 0 && (
                        <div
                          className="bg-primary h-full transition-all duration-500"
                          style={{ width: `${(m.business / maxMonthDistance) * 100}%` }}
                        />
                      )}
                      {m.private > 0 && (
                        <div
                          className="bg-chart-3 h-full transition-all duration-500"
                          style={{ width: `${(m.private / maxMonthDistance) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-16 text-right flex-shrink-0">
                      {formatKm(m.total)} km
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground w-10 text-right flex-shrink-0">
                      {m.trips} trips
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
                  <span className="text-xs text-muted-foreground">Business</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-chart-3" />
                  <span className="text-xs text-muted-foreground">Private</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportStats({ stats }: { stats: any }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Distance</p>
          <p className="text-xl font-bold mt-1 tabular-nums">{formatKm(stats.totalDistance)} km</p>
          <p className="text-xs text-muted-foreground mt-0.5">{stats.totalTrips} trips</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Business</p>
          <p className="text-xl font-bold mt-1 tabular-nums">{formatKm(stats.businessDistance)} km</p>
          <p className="text-xs text-muted-foreground mt-0.5">{stats.businessTrips} trips · {stats.businessPercent}%</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Private</p>
          <p className="text-xl font-bold mt-1 tabular-nums">{formatKm(stats.privateDistance)} km</p>
          <p className="text-xs text-muted-foreground mt-0.5">{stats.privateTrips} trips · {100 - stats.businessPercent}%</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Avg. per Trip</p>
          <p className="text-xl font-bold mt-1 tabular-nums">{formatKm(stats.avgDistance)} km</p>
          <p className="text-xs text-muted-foreground mt-0.5">average distance</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TripTable({ trips }: { trips: Trip[] }) {
  const sorted = [...trips].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No trips in this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Trip Details</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-report-trips">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">From</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">To</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Distance</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((trip) => (
                <tr key={trip.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-xs tabular-nums whitespace-nowrap">{format(parseISO(trip.date), "d MMM")}</td>
                  <td className="px-4 py-2 text-xs truncate max-w-[140px]">{trip.startLocation}</td>
                  <td className="px-4 py-2 text-xs truncate max-w-[140px]">{trip.endLocation}</td>
                  <td className="px-4 py-2 text-xs text-right tabular-nums font-medium">{formatKm(trip.distance)} km</td>
                  <td className="px-4 py-2">
                    <Badge variant={trip.tripType === "business" ? "default" : "secondary"} className="text-xs">
                      {trip.tripType === "business" ? "Biz" : "Priv"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{trip.purpose || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50">
                <td className="px-4 py-2 text-xs font-medium" colSpan={3}>Total</td>
                <td className="px-4 py-2 text-xs text-right font-bold tabular-nums">
                  {formatKm(sorted.reduce((a, t) => a + t.distance, 0))} km
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatKm(val: number) {
  return val.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
}
