import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

ReactDOM.createRoot(document.getElementById('sidepanel-root')).render(
  <React.StrictMode>
    <div className="p-4">
      <h2 className="text-lg font-bold border-b border-gray-700 pb-2 mb-4">Quick Access</h2>
      <p className="text-sm text-gray-400">Click any field to copy it to your clipboard.</p>
      {/* We will map the user's data here later */}
    </div>
  </React.StrictMode>,
)