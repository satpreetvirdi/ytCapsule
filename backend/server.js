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


// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const corsOptions = {
  origin: 'https://ytcapsule-1.onrender.com/', // Replace with your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true, // Allow cookies to be sent with requests
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
// console.log(process.env.CORTEX_API_KEY);
// Configure Passport for Google OAuth
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://ytcapsule-2.onrender.com/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      profile.accessToken = accessToken;
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Route for Google OAuth login
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback route
// app.get(
//   "/auth/google/callback",
//   passport.authenticate("google", {
//     failureRedirect: "/login-failed",
//     successRedirect: "/auth-redirect",
//   })
// );

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-failed", successRedirect: "/auth-redirect" }),
  async (req, res) => {
    // Capture the cookies after successful authentication
    if (req.user) {
      try {
        const cookieJar = new CookieJar();

        // Make a request to YouTube or any Google service to get cookies
        const response = await axios.get("https://www.youtube.com/", {
          headers: {
            "Authorization": `Bearer ${req.user.accessToken}`, // Use access token for authentication
          },
          jar: cookieJar, // Store cookies in this jar
          withCredentials: true,
        });

        // Extract the cookies from the jar
        const cookies = cookieJar.toJSON();
        console.log("cookies",cookies);
        const cookiesFilePath = path.join(__dirname, "cookies.json");

        // Save cookies to a file
        fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies));

        console.log("Cookies captured and saved to cookies.json");
      } catch (error) {
        console.error("Error capturing cookies", error);
      }
    }

    // Redirect to the frontend
    res.redirect("https://ytcapsule-1.onrender.com/");
  }
);

// Check authentication status
app.get('/check-auth', (req, res) => {
  if (req.isAuthenticated()) {
    res.status(200).json({ isAuthenticated: true });
  } else {
    res.status(200).json({ isAuthenticated: false });
  }
});
// New route to check if the user is logged in and redirect to the frontend
app.get("/auth-redirect", (req, res) => {
  if (req.isAuthenticated()) {
  
    res.redirect("https://ytcapsule-1.onrender.com/");
  } else {

    res.redirect("https://ytcapsule-1.onrender.com/");
  }
});
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// Summarize route with auth check
app.post("/summarize", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  const { videoUrl } = req.body;
  const ytDlpCookiesPath = path.join(__dirname, "cookies.json");
  
  const outputPath = path.join(__dirname, "output.mp3");

  try {
    const cookies = fs.existsSync(ytDlpCookiesPath) ? fs.readFileSync(ytDlpCookiesPath, "utf-8") : null;

    if (!cookies) {
      return res.status(400).json({ error: "Cookies not found, user not authenticated." });
    }

    await new Promise((resolve, reject) => {
      exec(`yt-dlp -x --audio-format mp3 -o "${outputPath}" --cookies "${ytDlpCookiesPath}" ${videoUrl}`, (error, stdout, stderr) => {
        if (error) {
          console.error("Audio extraction failed", error);
          reject(error);
        } else {
          console.log("Audio extraction completed successfully.");
          resolve();
        }
      });
    });

    const uploadResponse = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fs.createReadStream(outputPath),
      {
        headers: {
          authorization: ASSEMBLYAI_API_KEY,
          "transfer-encoding": "chunked",
        },
      }
    );

    if (uploadResponse.status !== 200) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    res.json({ message: "Audio extraction and upload completed." });
  } catch (error) {
    console.error("Error during the process", error);
    res.status(500).json({ error: "An error occurred during audio extraction." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
