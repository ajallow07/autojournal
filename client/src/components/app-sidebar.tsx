import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Route, Plus, BarChart3, Car, Zap, Circle, User, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Trip Log", url: "/trips", icon: Route },
  { title: "Add Trip", url: "/trips/new", icon: Plus },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Vehicle", url: "/vehicle", icon: Car },
  { title: "Tesla", url: "/tesla", icon: Zap },
  { title: "User Profile", url: "/profile", icon: User },
];

function TeslaStatusIndicator() {
  const { data } = useQuery<{ connected: boolean; connection: { lastDriveState: string | null; tripInProgress: boolean } | null }>({
    queryKey: ["/api/tesla/status"],
    refetchInterval: 30000,
  });

  if (!data?.connected) return null;

  const conn = data.connection;
  const isDriving = conn?.tripInProgress;

  return (
    <div className="flex items-center gap-2" data-testid="tesla-status-indicator">
      <Circle className={`w-2 h-2 ${isDriving ? "fill-green-500 text-green-500 animate-pulse" : "fill-muted-foreground text-muted-foreground"}`} />
      <span className="text-xs text-muted-foreground">
        Tesla {isDriving ? "driving" : "connected"}
      </span>
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "User" : "";
  const initials = user ? [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "U" : "";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary">
            <Car className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Körjournal</h1>
            <p className="text-xs text-muted-foreground">Tesla Model Y</p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.url === "/"
                  ? location === "/"
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
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        <TeslaStatusIndicator />
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" data-testid="text-sidebar-user-name">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email || ""}</p>
            </div>
            <a href="/api/logout" data-testid="button-sidebar-logout">
              <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
