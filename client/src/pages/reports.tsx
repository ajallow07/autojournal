import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Download, Briefcase, Home, Gauge, TrendingUp, Calendar, Receipt, Info } from "lucide-react";
import type { Trip } from "@shared/schema";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths, startOfYear, endOfYear, startOfQuarter, endOfQuarter, eachMonthOfInterval } from "date-fns";
import { useState, useMemo } from "react";

const SKATTEVERKET_RATES = {
  privateCar: { perKm: 2.5, perMil: 25, label: "Private car" },
  companyCar: { perKm: 1.2, perMil: 12, label: "Company car (petrol/diesel/hybrid)" },
  companyCarElectric: { perKm: 0.95, perMil: 9.5, label: "Company car (electric)" },
};

type VehicleType = keyof typeof SKATTEVERKET_RATES;

export default function Reports() {
  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const now = new Date();
  const [reportType, setReportType] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState(format(now, "yyyy-MM"));
  const [startDate, setStartDate] = useState(format(subMonths(now, 3), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(now, "yyyy-MM-dd"));
  const [vehicleType, setVehicleType] = useState<VehicleType>("privateCar");
  const [allowancePeriod, setAllowancePeriod] = useState("monthly");
  const [allowanceYear, setAllowanceYear] = useState(format(now, "yyyy"));

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
    const rate = SKATTEVERKET_RATES[vehicleType];
    const allowance = businessDistance * rate.perKm;

    return {
      totalTrips: filteredTrips.length,
      totalDistance,
      businessTrips: businessTrips.length,
      privateTrips: privateTrips.length,
      businessDistance,
      privateDistance,
      businessPercent,
      avgDistance,
      allowance,
    };
  }, [filteredTrips, vehicleType]);

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

  const allowanceBreakdown = useMemo(() => {
    if (!trips) return [];
    const year = parseInt(allowanceYear);
    const yearStart = startOfYear(new Date(year, 0));
    const yearEnd = endOfYear(new Date(year, 0));
    const rate = SKATTEVERKET_RATES[vehicleType];

    const businessTrips = trips.filter((t) => {
      const d = parseISO(t.date);
      return t.tripType === "business" && isWithinInterval(d, { start: yearStart, end: yearEnd });
    });

    if (allowancePeriod === "monthly") {
      const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });
      return months.map((month) => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);
        const periodTrips = businessTrips.filter((t) => isWithinInterval(parseISO(t.date), { start: mStart, end: mEnd }));
        const distance = periodTrips.reduce((acc, t) => acc + t.distance, 0);
        return {
          label: format(month, "MMM yyyy"),
          trips: periodTrips.length,
          distance,
          allowance: distance * rate.perKm,
        };
      });
    }

    if (allowancePeriod === "quarterly") {
      return [0, 1, 2, 3].map((q) => {
        const qStart = startOfQuarter(new Date(year, q * 3));
        const qEnd = endOfQuarter(new Date(year, q * 3));
        const periodTrips = businessTrips.filter((t) => isWithinInterval(parseISO(t.date), { start: qStart, end: qEnd }));
        const distance = periodTrips.reduce((acc, t) => acc + t.distance, 0);
        return {
          label: `Q${q + 1} ${year}`,
          trips: periodTrips.length,
          distance,
          allowance: distance * rate.perKm,
        };
      });
    }

    if (allowancePeriod === "half-yearly") {
      return [0, 1].map((h) => {
        const hStart = new Date(year, h * 6, 1);
        const hEnd = endOfMonth(new Date(year, h * 6 + 5));
        const periodTrips = businessTrips.filter((t) => isWithinInterval(parseISO(t.date), { start: hStart, end: hEnd }));
        const distance = periodTrips.reduce((acc, t) => acc + t.distance, 0);
        return {
          label: h === 0 ? `H1 ${year} (Jan–Jun)` : `H2 ${year} (Jul–Dec)`,
          trips: periodTrips.length,
          distance,
          allowance: distance * rate.perKm,
        };
      });
    }

    const totalDistance = businessTrips.reduce((acc, t) => acc + t.distance, 0);
    return [{
      label: `Full Year ${year}`,
      trips: businessTrips.length,
      distance: totalDistance,
      allowance: totalDistance * rate.perKm,
    }];
  }, [trips, allowancePeriod, allowanceYear, vehicleType]);

  const allowanceTotals = useMemo(() => {
    const totalDistance = allowanceBreakdown.reduce((acc, p) => acc + p.distance, 0);
    const totalAllowance = allowanceBreakdown.reduce((acc, p) => acc + p.allowance, 0);
    const totalTrips = allowanceBreakdown.reduce((acc, p) => acc + p.trips, 0);
    return { totalDistance, totalAllowance, totalTrips };
  }, [allowanceBreakdown]);

  const maxMonthDistance = Math.max(...monthlyBreakdown.map((m) => m.total), 1);

  const handleExportCSV = () => {
    if (filteredTrips.length === 0) return;
    const rate = SKATTEVERKET_RATES[vehicleType];
    const headers = ["Date", "Start Time", "End Time", "From", "To", "Start Odometer", "End Odometer", "Distance (km)", "Type", "Purpose", "Notes", "Allowance (SEK)"];
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
        t.tripType === "business" ? (t.distance * rate.perKm).toFixed(2) : "0",
      ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mahlis-auto-journal-${reportType === "monthly" ? selectedMonth : `${startDate}_${endDate}`}.csv`;
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
          <p className="text-sm text-muted-foreground">Analyze your driving patterns and tax allowance</p>
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
          <TabsTrigger value="allowance" data-testid="tab-allowance">Tax Allowance</TabsTrigger>
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
          <ReportStats stats={stats} vehicleType={vehicleType} />
          <TripTable trips={filteredTrips} vehicleType={vehicleType} />
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
          <ReportStats stats={stats} vehicleType={vehicleType} />
          <TripTable trips={filteredTrips} vehicleType={vehicleType} />
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
                          className="bg-chart-1 h-full transition-all duration-500"
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
                  <div className="w-2.5 h-2.5 rounded-sm bg-chart-1" />
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

        <TabsContent value="allowance" className="space-y-6 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Skatteverket Milersättning 2026</p>
                  <p>Tax-free mileage allowance for business trips using your own car. Rates: Private car 25 kr/mil (2.50 kr/km), Company car 12 kr/mil (1.20 kr/km), Electric company car 9.50 kr/mil (0.95 kr/km).</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vehicle type</label>
              <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
                <SelectTrigger className="w-64" data-testid="select-vehicle-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="privateCar">Private car — 25 kr/mil</SelectItem>
                  <SelectItem value="companyCar">Company car — 12 kr/mil</SelectItem>
                  <SelectItem value="companyCarElectric">Company car (electric) — 9.50 kr/mil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Period</label>
              <Select value={allowancePeriod} onValueChange={setAllowancePeriod}>
                <SelectTrigger className="w-40" data-testid="select-allowance-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="half-yearly">Half-yearly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Year</label>
              <Select value={allowanceYear} onValueChange={setAllowanceYear}>
                <SelectTrigger className="w-28" data-testid="select-allowance-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2].map((offset) => {
                    const y = String(now.getFullYear() - offset);
                    return <SelectItem key={y} value={y}>{y}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-chart-1/15">
                    <Briefcase className="w-4 h-4 text-chart-1" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Business Trips</p>
                </div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-allowance-trips">{allowanceTotals.totalTrips}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatKm(allowanceTotals.totalDistance)} km total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-chart-4/15">
                    <Gauge className="w-4 h-4 text-chart-4" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Rate Applied</p>
                </div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-allowance-rate">{SKATTEVERKET_RATES[vehicleType].perMil} kr/mil</p>
                <p className="text-xs text-muted-foreground mt-0.5">{SKATTEVERKET_RATES[vehicleType].perKm} kr/km</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-chart-2/15">
                    <Receipt className="w-4 h-4 text-chart-2" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Total Allowance</p>
                </div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-allowance-total">{formatSEK(allowanceTotals.totalAllowance)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">tax-free compensation</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Allowance Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {allowanceBreakdown.length === 0 || allowanceTotals.totalTrips === 0 ? (
                <div className="py-12 text-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted mx-auto mb-4">
                    <Receipt className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No business trips found</p>
                  <p className="text-xs text-muted-foreground mt-1">Business trips generate tax-free mileage allowance</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-allowance-breakdown">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Period</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Trips</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Distance</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Mil</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Allowance (SEK)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allowanceBreakdown.map((period) => (
                        <tr key={period.label} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5 text-sm font-medium">{period.label}</td>
                          <td className="px-4 py-2.5 text-sm text-right tabular-nums">{period.trips}</td>
                          <td className="px-4 py-2.5 text-sm text-right tabular-nums">{formatKm(period.distance)} km</td>
                          <td className="px-4 py-2.5 text-sm text-right tabular-nums">{formatKm(period.distance / 10)} mil</td>
                          <td className="px-4 py-2.5 text-sm text-right tabular-nums font-semibold">
                            {period.allowance > 0 ? formatSEK(period.allowance) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/50">
                        <td className="px-4 py-2.5 text-sm font-semibold">Total</td>
                        <td className="px-4 py-2.5 text-sm text-right tabular-nums font-semibold">{allowanceTotals.totalTrips}</td>
                        <td className="px-4 py-2.5 text-sm text-right tabular-nums font-semibold">{formatKm(allowanceTotals.totalDistance)} km</td>
                        <td className="px-4 py-2.5 text-sm text-right tabular-nums font-semibold">{formatKm(allowanceTotals.totalDistance / 10)} mil</td>
                        <td className="px-4 py-2.5 text-sm text-right tabular-nums font-bold">{formatSEK(allowanceTotals.totalAllowance)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportStats({ stats, vehicleType }: { stats: any; vehicleType: VehicleType }) {
  const rate = SKATTEVERKET_RATES[vehicleType];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium">Tax Allowance</p>
          <p className="text-xl font-bold mt-1 tabular-nums">{formatSEK(stats.allowance)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{rate.perMil} kr/mil · business only</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TripTable({ trips, vehicleType }: { trips: Trip[]; vehicleType: VehicleType }) {
  const sorted = [...trips].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const rate = SKATTEVERKET_RATES[vehicleType];

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted mx-auto mb-4">
            <BarChart3 className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No trips in this period</p>
          <p className="text-xs text-muted-foreground mt-1">Select a different date range to see data</p>
        </CardContent>
      </Card>
    );
  }

  const totalAllowance = sorted
    .filter((t) => t.tripType === "business")
    .reduce((acc, t) => acc + t.distance * rate.perKm, 0);

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
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Allowance</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((trip) => (
                <tr key={trip.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-xs tabular-nums whitespace-nowrap">{format(parseISO(trip.date), "d MMM")}</td>
                  <td className="px-4 py-2 text-xs truncate max-w-[130px]">{trip.startLocation}</td>
                  <td className="px-4 py-2 text-xs truncate max-w-[130px]">{trip.endLocation}</td>
                  <td className="px-4 py-2 text-xs text-right tabular-nums font-medium">{formatKm(trip.distance)} km</td>
                  <td className="px-4 py-2">
                    <Badge variant={trip.tripType === "business" ? "default" : "secondary"} className="text-xs">
                      {trip.tripType === "business" ? "Biz" : "Priv"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-right tabular-nums">
                    {trip.tripType === "business" ? formatSEK(trip.distance * rate.perKm) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[160px]">{trip.purpose || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/50">
                <td className="px-4 py-2 text-xs font-medium" colSpan={3}>Total</td>
                <td className="px-4 py-2 text-xs text-right font-bold tabular-nums">
                  {formatKm(sorted.reduce((a, t) => a + t.distance, 0))} km
                </td>
                <td></td>
                <td className="px-4 py-2 text-xs text-right font-bold tabular-nums">
                  {formatSEK(totalAllowance)}
                </td>
                <td></td>
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

function formatSEK(val: number) {
  return val.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 2, style: "currency", currency: "SEK" });
}
