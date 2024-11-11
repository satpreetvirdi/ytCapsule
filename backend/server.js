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
const Cortex_API_KEY = process.env.Cortex_API_KEY;

app.post("/summarize", async (req, res) => {
  const { videoUrl } = req.body;
  const outputPath = path.join(__dirname, "output.mp3");

  try {
    // Step 1: Extract audio using yt-dlp-exec
    await new Promise((resolve, reject) => {
      ytDlp(videoUrl, {
        output: outputPath,
        extractAudio: true,
        audioFormat: "mp3",
        ffmpegLocation: ffmpegPath, // Specify the path to ffmpeg
        quiet: true,
      })
        .then(resolve)
        .catch(reject);
    });

    // Step 2: Upload audio file to AssemblyAI for transcription
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
    console.log("uploadResponse", uploadResponse);
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

    const transcriptId = transcriptionResponse.data.id;
    console.log("transcriptId", transcriptId);
    // Poll AssemblyAI for transcription completion
    let transcriptData;
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
      console.log("transcriptData", transcriptData);
      if (transcriptData.status === "completed") {
        break;
      } else if (transcriptData.status === "failed") {
        throw new Error("Transcription failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 5 seconds
    }

    // Step 3: Use Hugging Face API to summarize the transcription
    // transcriptData.text
    const summaryResponse = await axios.post(
      "https://article-extractor-and-summarizer.p.rapidapi.com/summarize-text",
      {
        language: "en",
        text: transcriptData.text,
      },
      {
        headers: {
          "x-rapidapi-host": "article-extractor-and-summarizer.p.rapidapi.com",
          "x-rapidapi-key": `${Cortex_API_KEY}`,
        },
      }
    );
    console.log("summaryResponse", summaryResponse);
    // Send the summarized response back to the client
    res.json({ summary: summaryResponse.data.summary });

    // Clean up by removing the audio file
    fs.unlinkSync(outputPath);
  } catch (error) {
    console.error("Error processing video:", error);
    res.status(500).json({ error: "Failed to process video" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
