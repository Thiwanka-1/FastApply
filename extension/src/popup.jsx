import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

ReactDOM.createRoot(document.getElementById('popup-root')).render(
  <React.StrictMode>
    <div className="flex flex-col items-center justify-center h-full space-y-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-blue-500">FastApply</h1>
      <p className="text-gray-300">Autofill is ready.</p>
      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors">
        Open Dashboard
      </button>
    </div>
  </React.StrictMode>,
)