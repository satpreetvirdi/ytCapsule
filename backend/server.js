require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ytDlp = require("yt-dlp-exec");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");

// Set ffmpeg path for fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

// Extract the API keys from process.env
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const CORTEX_API_KEY = process.env.CORTEX_API_KEY;
// if (!ASSEMBLYAI_API_KEY || !Cortex_API_KEY) {
  //   console.error("Missing API keys. Ensure that ASSEMBLYAI_API_KEY and Cortex_API_KEY are set.");
  //   process.exit(1);
  // }
  
  app.post("/summarize", async (req, res) => {
    const { videoUrl } = req.body;
    const outputPath = path.join(__dirname, "output.mp3");
    
    try {
      console.log(ASSEMBLYAI_API_KEY,CORTEX_API_KEY);
      // Step 1: Extract audio using yt-dlp-exec
    console.log("Extracting audio...");
    await new Promise((resolve, reject) => {
      ytDlp(videoUrl, {
        output: outputPath,
        extractAudio: true,
        audioFormat: "mp3",
        quiet: true,
        ffmpegLocation: ffmpegPath
      })
        .then(() => {
          console.log("Audio extraction completed successfully.");
          resolve();
        })
        .catch((error) => {
          console.error("Audio extraction failed", error);
          reject(error);
        });
    });
    // Step 2: Upload audio file to AssemblyAI for transcription
    console.log("Uploading audio for transcription...");
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

    console.log("Starting transcription...");
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

    if (transcriptionResponse.status !== 200) {
      throw new Error(`Transcription initiation failed: ${transcriptionResponse.statusText}`);
    }

    const transcriptId = transcriptionResponse.data.id;

    // Poll AssemblyAI for transcription completion
    let transcriptData;
    console.log("Polling transcription status...");
    while (true) {
      const response = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            Authorization: `Bearer ${ASSEMBLYAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      transcriptData = response.data;

      if (transcriptData.status === "completed") {
        console.log("Transcription completed.");
        break;
      } else if (transcriptData.status === "failed") {
        throw new Error("Transcription failed");
      }

      console.log("Transcription in progress... retrying in 10 seconds");
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 10 seconds
    }

    // Step 3: Use Hugging Face API to summarize the transcription
    console.log("Summarizing transcription...");
    const summaryResponse = await axios.post(
      "https://article-extractor-and-summarizer.p.rapidapi.com/summarize-text",
      {
        language: "en",
        text: transcriptData.text,
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

    // Send the summarized response back to the client
    console.log("Summarization completed. Sending response...");
    res.json({ summary: summaryResponse.data.summary });

    // Clean up by removing the audio file
    fs.unlinkSync(outputPath);
  } catch (error) {
    console.error("Error processing video:", error.message || error);
    res.status(500).json({ error: "Failed to process video", details: error.message || "Unknown error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;