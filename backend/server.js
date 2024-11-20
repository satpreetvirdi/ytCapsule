require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const { exec } = require("child_process");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { CookieJar } = require("tough-cookie");
const RedisStore = require("connect-redis").default;
const { createClient } = require('redis');
// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const corsOptions = {
  origin: 'https://ytcapsule-1.onrender.com',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Configure Redis
const redisClient = createClient({
  url: process.env.REDIS_URL, 
  // legacyMode: true, 
});
redisClient.connect().catch(console.error);

// Session middleware
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Google OAuth configuration
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://ytcapsule-2.onrender.com/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      profile.accessToken = accessToken;
      console.log("Google profile received:", profile.accessToken);
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => {
  console.log("Serializing user:", user);
  done(null, user);
});

passport.deserializeUser((user, done) => {
  console.log("Deserializing user:", user);
  done(null, user);
});

// Route for Google OAuth login
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback route
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-failed" }),
  async (req, res) => {
    console.log("Authentication callback triggered.");
    if (req.user) {
      try {
        req.session.user = req.user;
        console.log("Session after login:", req.session);

        const cookieJar = new CookieJar();
        const response = await axios.get("https://www.youtube.com/", {
          headers: {
            Authorization: `Bearer ${req.user.accessToken}`,
          },
          jar: cookieJar,
          withCredentials: true,
        });

        const cookies = cookieJar.toJSON();
        console.log("Captured cookies:", cookies);

        const cookiesFilePath = path.join(__dirname, "cookies.json");
        fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies));
        console.log("Cookies saved to cookies.json");
      } catch (error) {
        console.error("Error capturing cookies:", error.message);
      }
    } else {
      console.error("Authentication failed: User object is missing.");
    }

    res.redirect("https://ytcapsule-1.onrender.com");
  }
);

// Check authentication status
app.get('/check-auth', (req, res) => {
  console.log("Session data in /check-auth:", req.session);
  console.log("Authenticated user:", req.user);

  if (req.user) {
    console.log("Authenticated user:", req.user);
    return res.status(200).json({ isAuthenticated: true, user: req.user });
  }

  res.status(200).json({ isAuthenticated: false });
});

// Redirect after successful login
app.get("/auth-redirect", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("https://ytcapsule-1.onrender.com");
  } 
});
// Summarize route with auth check
app.post("/summarize", async (req, res) => {
  console.log("Summarize route accessed.");
  if (!req.isAuthenticated() && !req.session.user) {
    console.warn("User not authenticated for summarize route.");
    return res.status(401).json({ error: "User not authenticated" });
  }

  const { videoUrl } = req.body;
  const ytDlpCookiesPath = path.join(__dirname, "cookies.json");
  const outputPath = path.join(__dirname, "output.mp3");

  try {
    const cookies = fs.existsSync(ytDlpCookiesPath) ? fs.readFileSync(ytDlpCookiesPath, "utf-8") : null;

    if (!cookies) {
      console.error("Cookies file not found.");
      return res.status(400).json({ error: "Cookies not found, user not authenticated." });
    }

    console.log("Extracting audio from video...");
    await new Promise((resolve, reject) => {
      exec(
        `yt-dlp -x --audio-format mp3 -o "${outputPath}" --cookies "${ytDlpCookiesPath}" ${videoUrl}`,
        (error, stdout, stderr) => {
          if (error) {
            console.error("Audio extraction failed:", error);
            return reject(error);
          }
          console.log("Audio extraction completed successfully:", stdout);
          resolve();
        }
      );
    });

    console.log("Uploading extracted audio...");
    const uploadResponse = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fs.createReadStream(outputPath),
      {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          "transfer-encoding": "chunked",
        },
      }
    );

    if (uploadResponse.status !== 200) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    console.log("Audio upload completed.");
    res.json({ message: "Audio extraction and upload completed successfully." });
  } catch (error) {
    console.error("Error during the summarize process:", error.message);
    res.status(500).json({ error: "An error occurred during audio extraction." });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
