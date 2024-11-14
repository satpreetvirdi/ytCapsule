require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const { exec } = require("child_process");


ffmpeg.setFfmpegPath(ffmpegPath);
console.log('ffmpeg path:', ffmpegPath);
console.log('fluent ffmpeg path:', ffmpeg);

const app = express();
app.use(cors());

app.use(express.json());

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const CORTEX_API_KEY = process.env.CORTEX_API_KEY;

app.post("/summarize", async (req, res) => {
  const { videoUrl } = req.body;
  const outputPath = path.join(__dirname, "output.mp3");

  try {
    console.log(ASSEMBLYAI_API_KEY, CORTEX_API_KEY);


    console.log("Extracting audio...");
    await new Promise((resolve, reject) => {
      exec(`yt-dlp -x --audio-format mp3 -o "${outputPath}" ${videoUrl}`, (error, stdout, stderr) => {
        if (error) {
          console.error("Audio extraction failed", error);
          reject(error);
        } else {
          console.log("Audio extraction completed successfully.");
          resolve();
        }
      });
    });


    // console.log("Uploading audio for transcription...");
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

    // console.log("Starting transcription...");

    const transcriptionResponse = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      {
        audio_url: uploadResponse.data.upload_url,
      },
      {
        headers: {
          Authorization: `Bearer ${ASSEMBLYAI_API_KEY}`,
        },
      }
    );
    // console.log("transcriptionResponse",transcriptionResponse);
    if (transcriptionResponse.status !== 200) {
      throw new Error(`Transcription initiation failed: ${transcriptionResponse.statusText}`);
    }

    const transcriptId = transcriptionResponse.data.id;

    // Step 3: Poll for transcription completion
    let transcriptionCompleted = false;
    let transcriptionResult;

    // console.log("Polling transcription status...");
    while (!transcriptionCompleted) {
      const pollingResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            Authorization: `Bearer ${ASSEMBLYAI_API_KEY}`,
          },
        }
      );

      if (pollingResponse.data.status === "completed") {
        transcriptionCompleted = true;
        transcriptionResult = pollingResponse.data;
        console.log("Transcription completed successfully.");
        console.log("transcriptionResult.text",transcriptionResult.text);
      } else if (pollingResponse.data.status === "failed") {
        throw new Error("Transcription failed.");
      } else {
        console.log("Transcription in progress...");
        await new Promise((resolve) => setTimeout(resolve, 5000)); 
      }
    }
    console.log("Summarizing transcription...");
    const summaryResponse = await axios.post(
      "https://article-extractor-and-summarizer.p.rapidapi.com/summarize-text",
      {
        language: "en",
        text: transcriptionResult.text,
      },
      {
        headers: {
          "x-rapidapi-host": "article-extractor-and-summarizer.p.rapidapi.com",
          "x-rapidapi-key": CORTEX_API_KEY,
        },
      }
    );

    if (summaryResponse.status !== 200) {
      throw new Error(`Summarization failed: ${summaryResponse.statusText}`);
    }
    
    // console.log("Summarization completed. Sending response...");
    res.json({ summary: summaryResponse.data.summary });


  } catch (error) {
    console.error("An error occurred during the process:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred."
    });
  } finally {
    // Clean up temporary audio file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.log("Temporary audio file deleted.");
    }
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
