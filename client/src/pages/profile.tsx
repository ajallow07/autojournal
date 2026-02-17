import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { LogOut, Mail, User, Calendar } from "lucide-react";

export default function ProfilePage() {
  const { user, isLoading, logout, isLoggingOut } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!user) return null;

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "User";
  const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "U";

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight" data-testid="text-profile-title">Profile</h1>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
              <AvatarFallback className="text-lg bg-primary/15 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-0.5">
              <h2 className="text-lg font-semibold" data-testid="text-profile-name">{displayName}</h2>
              {user.email && (
                <p className="text-sm text-muted-foreground" data-testid="text-profile-email">{user.email}</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {user.email && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{user.email}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-sm font-medium">{user.username || displayName}</p>
              </div>
            </div>
            {user.createdAt && (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Member since</p>
                  <p className="text-sm font-medium">
                    {new Date(user.createdAt).toLocaleDateString("sv-SE")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-5 mt-5 border-t">
            <Button
              variant="outline"
              onClick={() => logout()}
              disabled={isLoggingOut}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? "Logging out..." : "Log out"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
