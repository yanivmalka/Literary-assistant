import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ToastContainer from './components/Toast'
import './index.css'
import './i18n'

const basename = import.meta.env.BASE_URL

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
      <ToastContainer />
    </BrowserRouter>
  </React.StrictMode>,
)
