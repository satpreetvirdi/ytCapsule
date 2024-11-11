import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css'; // Importing CSS for styles

const App = () => {
  const [videoUrl, setVideoUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [typedSummary, setTypedSummary] = useState(''); // State for the typewriter effect
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVideoUrlChange = (e) => {
    setVideoUrl(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSummary('');
    setTypedSummary('');
    setError('');

    try {
      const response = await axios.post('/api/summarize', { videoUrl });
      setSummary(response.data.summary);
    } catch (err) {
      console.error('Error fetching summary:', err);
      setError('Failed to fetch summary. Please check the video URL or try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Effect to type out the summary one character at a time
  useEffect(() => {
    if (summary) {
      let index = 0;
      const interval = setInterval(() => {
        setTypedSummary((prev) => prev + summary[index]);
        index++;
        if (index >= summary.length) {
          clearInterval(interval);
        }
      }, 20); // Adjust the typing speed by changing the interval time
      return () => clearInterval(interval); // Cleanup interval on unmount
    }
  }, [summary]);

  return (
    <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#121212', color: '#ffffff', minHeight: '100vh' }}>
      <h1><span style={{ color: '#ff0000' }}>YouTube</span> Video Summarizer</h1> {/* Only "YouTube" is in red */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Enter YouTube video URL"
          value={videoUrl}
          onChange={handleVideoUrlChange}
          required
          style={{
            width: '60%',
            padding: '10px',
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '5px',
          }}
        />
        <button
          type="submit"
          style={{
            marginLeft: '10px',
            padding: '10px 20px',
            backgroundColor: '#ff0000',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            transition: 'background-color 0.3s',
            marginTop:"20px"
          }}
        >
          Get Summary
        </button>
      </form>
      {loading && <p>Loading summary, please wait...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {typedSummary && (
        <div
          style={{
            backgroundColor: '#333',
            color: '#fff',
            padding: '50px',
            marginTop: '20px',
            borderRadius: '8px',
            maxWidth: '60%',
            margin: 'auto',
            textAlign: 'left',
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            lineHeight: '2'
          }}
        >
          <h3>Video Summary:</h3>
          <div>{typedSummary}</div> {/* Display the word-by-word typed summary */}
        </div>
      )}
    </div>
  );
};

export default App;
