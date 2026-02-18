import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import type { Express, RequestHandler } from "express";
import { db } from "./db";
import { users, type User } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 10;

async function getUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return user;
}

async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

async function getUserByGoogleId(googleId: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
  return user;
}

async function createUser(data: {
  username?: string;
  email?: string;
  passwordHash?: string;
  googleId?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}): Promise<User> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

const OWNER_EMAIL = process.env.OWNER_EMAIL || "";

function sanitizeUser(user: User) {
  const { passwordHash, ...safe } = user;
  return { ...safe, isOwner: !!user.email && user.email === OWNER_EMAIL };
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await getUserById(id);
      done(null, user || false);
    } catch (err) {
      done(err);
    }
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await getUserByUsername(username);
        if (!user || !user.passwordHash) {
          return done(null, false, { message: "Invalid username or password" });
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = process.env.APP_DOMAIN
      ? `https://${process.env.APP_DOMAIN}/api/auth/google/callback`
      : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`
        : "/api/auth/google/callback";

    console.log("Google OAuth callback URL:", callbackURL);

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            let user = await getUserByGoogleId(profile.id);
            if (user) {
              return done(null, user);
            }

            const email = profile.emails?.[0]?.value;
            if (email) {
              user = await getUserByEmail(email);
              if (user) {
                const [updated] = await db
                  .update(users)
                  .set({
                    googleId: profile.id,
                    profileImageUrl: user.profileImageUrl || profile.photos?.[0]?.value,
                    updatedAt: new Date(),
                  })
                  .where(eq(users.id, user.id))
                  .returning();
                return done(null, updated);
              }
            }

            user = await createUser({
              googleId: profile.id,
              email: email || undefined,
              firstName: profile.name?.givenName || profile.displayName,
              lastName: profile.name?.familyName || undefined,
              profileImageUrl: profile.photos?.[0]?.value,
              username: email ? email.split("@")[0] : `user_${profile.id.slice(0, 8)}`,
            });
            return done(null, user);
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );
  }

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, email, firstName, lastName } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ message: "Username must be 3-30 characters" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const existing = await getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "Username already taken" });
      }

      if (email) {
        const emailUser = await getUserByEmail(email);
        if (emailUser) {
          return res.status(409).json({ message: "Email already registered" });
        }
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await createUser({
        username,
        passwordHash,
        email: email || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Registration successful but login failed" });
        }
        res.status(201).json(sanitizeUser(user));
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        res.json(sanitizeUser(user));
      });
    })(req, res, next);
  });

  app.get("/api/auth/google", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(501).json({ message: "Google login is not configured" });
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", {
      successRedirect: "/",
      failureRedirect: "/login?error=google_failed",
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(sanitizeUser(req.user as User));
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};
