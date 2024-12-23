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
const cookieParser = require('cookie-parser');

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
app.use(cookieParser());
// const { videoUrl } = req.body;

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
      secure: true,
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

  console.log("Serializing user:", user.id);
  done(null, user.id);
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
const parseCookiesToNetscape = (cookies) => {
  return cookies.map(cookie => {
    try {
      // Split the cookie into individual parts by semicolon and trim extra spaces
      const cookieParts = cookie.split(';').map(part => part.trim());

      // Extract the name and value from the first part (before the first semicolon)
      const [name, value] = cookieParts[0].split('=');

      // Extract the domain, defaulting to empty string if not found
      const domainAttr = cookieParts.find(part => part.startsWith('Domain='));
      const domain = domainAttr ? domainAttr.split('=')[1] : '';
      const formattedDomain = domain && !domain.startsWith('.') ? `.${domain}` : domain;

      // Extract the path, defaulting to '/' if not provided
      const pathAttr = cookieParts.find(part => part.startsWith('Path='));
      const path = pathAttr ? pathAttr.split('=')[1] : '/';

      // Check if the cookie is marked as Secure
      const secure = cookieParts.includes('Secure') ? 'TRUE' : 'FALSE';

      // Extract the expiration date and convert it to Unix timestamp, defaulting to max value if not found
      const expiresAttr = cookieParts.find(part => part.startsWith('Expires='));
      const expiration = expiresAttr
        ? Math.floor(new Date(expiresAttr.split('=')[1]).getTime() / 1000)
        : 2147483647; // Default expiration if not found

      // Handle HttpOnly flag, but it doesn't affect the Netscape format
      const httpOnly = cookieParts.includes('HttpOnly') ? 'TRUE' : 'FALSE'; // Not necessary for Netscape format, but could be logged

      // Create the Netscape formatted cookie string
      return `${formattedDomain}\tTRUE\t${path}\t${secure}\t${expiration}\t${name}\t${value}`;
    } catch (error) {
      console.error(`Error processing cookie: ${cookie}`, error);
      return ''; // Skip any invalid cookies
    }
  }).filter(Boolean)  // Filter out invalid cookies (empty strings)
    .join('\n'); // Join all valid cookies into a single string separated by newlines
};

const users = [];
let accessToken;

// Google OAuth callback route
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-failed" }),
  async (req, res) => {
    console.log("Authentication callback triggered.");
    if (req.user) {
      try {

        users.push(req.user);       
        req.session.user = req.user;
        console.log("Session after login:after", req.session);

        accessToken = req.session.user.accessToken;
        // const cookieJar = new CookieJar();
        // const response = await axios.get("https://www.youtube.com/", {
        //   headers: {
        //     Authorization: `Bearer ${req.session.user.accessToken}`,
        //   },
        //   jar: cookieJar,
        //   withCredentials: true,
        // });
        // console.log("response header", response.headers);
        // const cookiesFiltered = response.headers['set-cookie'];
        // console.log("cookiesFiltered" , cookiesFiltered);
        // if (cookiesFiltered && cookiesFiltered.length > 0) {
        //   const netscapeFormattedCookies = parseCookiesToNetscape(cookiesFiltered);
        //   console.log("Netscape formatted",netscapeFormattedCookies);
        //   const header = "# Netscape HTTP Cookie File\n";
        //   const cookiesFilePath = path.join(__dirname, "cookies.txt");
        //   fs.writeFileSync(cookiesFilePath, netscapeFormattedCookies);
        //   console.log("Cookies saved to cookies.txt in Netscape format");
        // }
        //   console.log("cookieJar",cookieJar);
        //   const cookiesJSON = cookieJar.toJSON();
        //   console.log("cookieJSON",cookiesJSON.cookies);
        
        //   const cookieString = Object.values(cookiesJSON.cookies)
        //   .map(cookie => cookie.cookieString())
        //  .join('; ');
      //   console.log("cookieString",cookieString);
      //  fs.writeFileSync(cookiesFilePath, storedCookies);  
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
  console.log("req.session.user", req.session.user);

  if (users.length > 0) {
    users.length = 0;
    return res.status(200).json({ isAuthenticated: true });
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
    // if (!cookies) {
  //   return res.status(400).json({ error: "Session cookie (cookie.sid) not found." });
  // }
  const { videoUrl } = req.body;
  const ytDlpCookiesPath = path.join(__dirname, "cookies.txt");

  const outputPath = path.join(__dirname, "output.mp3");

  try {
    const cookieJar = new CookieJar();
    const response = await axios.get(videoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      jar: cookieJar,
      withCredentials: true,
    });

    console.log("Response headers:", response.headers);
    const cookiesFiltered = response.headers['set-cookie'];
    console.log("Filtered cookies:", cookiesFiltered);
    const cookiesFilePath = path.join(__dirname, "cookies.txt");

    // Process the cookies and save them in Netscape format
    if (cookiesFiltered && cookiesFiltered.length > 0) {
      const netscapeFormattedCookies = parseCookiesToNetscape(cookiesFiltered);
      const header = "# Netscape HTTP Cookie File\n# This is a generated file! Do not edit.\n\n";
      console.log("Netscape formatted cookies:",header + netscapeFormattedCookies);
      fs.writeFileSync(cookiesFilePath, header + netscapeFormattedCookies);
      console.log("Cookies saved to cookies.txt in Netscape format");
      const savedCookies = fs.readFileSync(cookiesFilePath, 'utf8').trim();
      if (savedCookies.length === 0) {
        console.log("cookies.txt is empty after saving.");
        return res.status(500).json({ error: "Failed to save cookies correctly." });
      } else {
        console.log("cookies.txt contains cookies.");
      }
    }
    console.log("Extracting audio from video...");
    await new Promise((resolve, reject) => {
      exec(
        `yt-dlp -x --audio-format mp3 -o "${outputPath}" --cookies ${ytDlpCookiesPath} --no-check-certificate  --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" --retries 5 ${videoUrl}`,
        (error, stdout, stderr) => {
          if (error) {
            console.error("Audio extraction failed:", error);
            fs.unlinkSync(ytDlpCookiesPath);
            return reject(error);
          }
          fs.unlinkSync(ytDlpCookiesPath);
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
