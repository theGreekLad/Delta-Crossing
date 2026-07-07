import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ProformaPage from './pages/ProformaPage';
import './index.css';
import './proforma.css';

function ProformaRoot() {
  useEffect(() => {
    document.documentElement.classList.add('proforma-page');
    return () => document.documentElement.classList.remove('proforma-page');
  }, []);

  return <ProformaPage />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ProformaRoot />
  </StrictMode>,
);
