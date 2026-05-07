import React, { useState, useRef } from 'react';
import axios from 'axios';
import SparkMD5 from 'spark-md5';
import './App.css';

// Updated: Added /api to the base URL so your routes match the backend exactly
const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : 'http://localhost:5000/api';

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);

  // 1. Optimized Chunked Hash Calculation
  const calculateHash = (file) => {
    return new Promise((resolve, reject) => {
      const chunkSize = 2097152; // 2MB Chunks
      const chunks = Math.ceil(file.size / chunkSize);
      let currentChunk = 0;
      const spark = new SparkMD5.ArrayBuffer();
      const reader = new FileReader();

      reader.onload = (e) => {
        spark.append(e.target.result);
        currentChunk++;
        if (currentChunk < chunks) {
          loadNext();
        } else {
          resolve(spark.end());
        }
      };

      reader.onerror = () => reject('Hash calculation failed');

      const loadNext = () => {
        const start = currentChunk * chunkSize;
        const end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
        reader.readAsArrayBuffer(file.slice(start, end));
      };

      loadNext();
    });
  };

  // 2. Secure Download
  const downloadFile = async (hash, fileName) => {
    try {
      setStatus('Downloading...');
      const response = await axios({
        url: `${API_BASE_URL}/download/${hash}`,
        method: 'GET',
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName); 
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setStatus('Download complete.');
    } catch (error) {
      console.error("Download error:", error);
      setStatus('Error downloading file.');
    }
  };

  const handleRemove = async (hash) => {
  try {
    setStatus('Removing...'); // Set a string immediately
    const response = await axios.post(`${API_BASE_URL}/remove`, {
      hash,
      userId: 'user_123'
    });
    
    setUploadedFiles((prev) => prev.filter(f => f.hash !== hash));
    setStatus(response.data.message || 'File removed successfully'); 
  } catch (error) {
    console.error("Remove error:", error);
    setStatus('Error removing file.'); // Fallback string
  }
};

  const handleUpload = async () => {
    if (!file) return;

    try {
      setStatus('Calculating Hash...');
      const hash = await calculateHash(file);

      // Step 1: Deduplication Check
      const checkResponse = await axios.post(`${API_BASE_URL}/check-hash`, {
        hash,
        fileName: file.name,
        userId: 'user_123'
      });

      if (checkResponse.data.duplicated) {
        setStatus('Instant Upload: File already in cloud.');
      } else {
        // Step 2: Physical Upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', 'user_123');
        formData.append('hash', hash);

        setStatus('Uploading unique file...');
        await axios.post(`${API_BASE_URL}/upload`, formData);
        setStatus('Upload Complete.');
      }

      setUploadedFiles((prev) => {
        if (prev.find(f => f.hash === hash)) return prev;
        return [...prev, { name: file.name, hash: hash }];
      });

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

    } catch (error) {
      console.error("Upload Error:", error);
      setStatus('Error connecting to server.');
    }
  };

  return (
    <div className="container">
      <h1>Cloud Vault</h1>
      <p className="subtitle">Secure, deduplicated storage</p>

      <div className="upload-section">
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={(e) => setFile(e.target.files[0])} 
        />
      </div>

      <button
        className="btn-primary"
        onClick={handleUpload}
        disabled={!file || status.includes('Calculating') || status.includes('Uploading')}
      >
        {status.includes('Uploading') ? 'Uploading...' : 'Upload to Cloud'}
      </button>

      {status && (
        <div className={`status-box ${status.includes('Complete') || status.includes('Instant') ? 'status-success' : ''}`}>
          {status}
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="file-list-container">
          <h3>Recent Uploads</h3>
          <ul className="file-list">
            {uploadedFiles.map((f, index) => (
              <li key={index} className="file-item">
                <div className="file-info">
                  <span className="file-name">{f.name}</span>
                  <span className="file-hash">MD5: {f.hash.substring(0, 8)}...</span>
                </div>
                <div className="action-btns">
                  <button
                    className="btn-small btn-outline"
                    onClick={() => downloadFile(f.hash, f.name)}
                  >
                    Download
                  </button>
                  <button
                    className="btn-small btn-outline btn-danger"
                    onClick={() => handleRemove(f.hash)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;