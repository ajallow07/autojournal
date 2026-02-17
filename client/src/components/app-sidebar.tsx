import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Route, BarChart3, Car, Zap, Circle, User, LogOut, MapPin, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Trip Log", url: "/trips", icon: Route },
  { title: "Add Trip", url: "/trips/new", icon: Plus },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

const settingsItems = [
  { title: "Vehicles", url: "/vehicle", icon: Car },
  { title: "Tesla", url: "/tesla", icon: Zap },
  { title: "Profile", url: "/profile", icon: User },
];

function TeslaStatusIndicator() {
  const { data } = useQuery<{ connected: boolean; connection: { lastDriveState: string | null; tripInProgress: boolean } | null }>({
    queryKey: ["/api/tesla/status"],
    refetchInterval: 30000,
  });

  if (!data?.connected) return null;

  const conn = data.connection;
  const isDriving = conn?.tripInProgress;
  const state = conn?.lastDriveState;

  return (
    <div className="mx-3 mb-2 p-2.5 rounded-md bg-sidebar-accent" data-testid="tesla-status-indicator">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDriving ? "bg-green-400 animate-pulse" : state === "asleep" ? "bg-amber-400" : "bg-emerald-400"}`} />
        <span className="text-xs font-medium text-sidebar-foreground">
          Tesla {isDriving ? "Driving" : state === "asleep" ? "Asleep" : "Connected"}
        </span>
      </div>
      {isDriving && (
        <div className="flex items-center gap-1.5 mt-1.5 ml-4">
          <MapPin className="w-3 h-3 text-sidebar-foreground/60" />
          <span className="text-[11px] text-sidebar-foreground/60">Trip in progress</span>
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "User" : "";
  const initials = user ? [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || (user.username?.[0]?.toUpperCase() || "U") : "";

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-3">
        <Link href="/" className="flex items-center gap-3">
          <img src="/icon.png" alt="Mahlis Auto Journal" className="w-9 h-9 rounded-md" />
          <div>
            <h1 className="text-sm font-bold text-sidebar-foreground leading-tight tracking-tight">Mahlis Auto Journal</h1>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] tracking-wider font-semibold">Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.url === "/"
                  ? location === "/"
                  : item.url === "/trips/new"
                    ? location === "/trips/new"
                    : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] tracking-wider font-semibold">Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => {
                const isActive = location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-0 pb-2">
        <TeslaStatusIndicator />
        <SidebarSeparator />
        {user && (
          <div className="flex items-center gap-3 px-4 pt-3 pb-1">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
              <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-accent-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate" data-testid="text-sidebar-user-name">{displayName}</p>
              <p className="text-[10px] text-sidebar-foreground/40 truncate">{user.email || ""}</p>
            </div>
            <button onClick={() => logout()} className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors" data-testid="button-sidebar-logout">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
